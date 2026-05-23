const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 5173);
const SHEET_ID = '101bdNW3KITcaYOmL8Qr7OWRQVq_2qB_mjXE5bktqbGU';
const GID = '1323449178';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
const TEAM_COUNT = 15;
const REFRESH_MS = 5000;

const PTS = {
  wwcd: 100,
  wwcd2x: 150,
  top3: 50,
  top4_10: 30,
  elim: 20,
  elim10: 40,
  elim20: 80
};

const REGION_NAMES = {
  'TURKEY REGION': { en: 'TURKEY', tr: 'TÜRKİYE' },
  'WEU REGION': { en: 'WEU', tr: 'WEU' },
  'CIS REGION': { en: 'CIS', tr: 'CIS' }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf'
};

function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let inQuotes = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function num(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function readTeamRow(r) {
  return {
    team: r[0],
    placementPoints: num(r[1]) * PTS.wwcd
      + num(r[2]) * PTS.wwcd2x
      + num(r[3]) * PTS.top3
      + num(r[4]) * PTS.top4_10,
    killPoints: num(r[5]) * PTS.elim
      + num(r[6]) * PTS.elim10
      + num(r[7]) * PTS.elim20,
    counts: {
      wwcd: num(r[1]),
      wwcd2x: num(r[2]),
      top3: num(r[3]),
      top4_10: num(r[4]),
      elim: num(r[5]),
      elim10: num(r[6]),
      elim20: num(r[7])
    }
  };
}

function extractTeams(rows) {
  const stage1 = {};
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const t = readTeamRow(r);
    stage1[t.team] = t;
  }

  let stage2Start = -1;
  for (let i = TEAM_COUNT + 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toLowerCase().includes('stage 2')) {
      stage2Start = i + 2;
      break;
    }
  }

  const stage2 = {};
  if (stage2Start > 0) {
    for (let i = stage2Start; i < stage2Start + TEAM_COUNT && i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      const t = readTeamRow(r);
      stage2[t.team] = t;
    }
  }

  const totalMap = {};
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const r = rows[i];
    if (!r || !r[12]) continue;
    totalMap[r[12]] = num(r[13]);
  }

  const teamNames = new Set([
    ...Object.keys(stage1),
    ...Object.keys(stage2),
    ...Object.keys(totalMap)
  ]);

  const teams = [];
  teamNames.forEach(name => {
    const s1 = stage1[name] || { killPoints: 0, placementPoints: 0, counts: {} };
    const s2 = stage2[name] || { killPoints: 0, placementPoints: 0, counts: {} };
    const calculatedTotal = s1.killPoints + s1.placementPoints + s2.killPoints + s2.placementPoints;
    teams.push({
      team: name,
      stage1: {
        killPoints: s1.killPoints,
        placementPoints: s1.placementPoints,
        counts: s1.counts
      },
      stage2: {
        killPoints: s2.killPoints,
        placementPoints: s2.placementPoints,
        counts: s2.counts
      },
      calculatedTotal,
      total: totalMap[name] !== undefined ? totalMap[name] : calculatedTotal
    });
  });

  teams.sort((a, b) => b.total - a.total);
  return teams.map((team, index) => ({ rank: index + 1, ...team }));
}

function extractRegions(rows) {
  const regionKeys = Object.keys(REGION_NAMES);
  const found = {};
  for (const r of rows) {
    if (!r) continue;
    const label = (r[12] || '').toUpperCase();
    if (regionKeys.includes(label) && found[label] === undefined) {
      found[label] = num(r[13]);
    }
  }

  return regionKeys
    .map(key => ({
      key,
      name: REGION_NAMES[key],
      points: found[key] || 0
    }))
    .sort((a, b) => b.points - a.points)
    .map((region, index) => ({ rank: index + 1, ...region }));
}

function buildRegionTotals(regions) {
  const totals = {
    turkey: 0,
    weu: 0,
    cis: 0
  };

  regions.forEach(region => {
    if (region.key === 'TURKEY REGION') totals.turkey = region.points;
    if (region.key === 'WEU REGION') totals.weu = region.points;
    if (region.key === 'CIS REGION') totals.cis = region.points;
  });

  return totals;
}

function buildRegionsByKey(regions) {
  return regions.reduce((acc, region) => {
    acc[region.key] = region;
    return acc;
  }, {});
}

async function buildLivePayload() {
  const res = await fetch(`${CSV_URL}&_t=${Date.now()}`);
  if (!res.ok) throw new Error(`Google Sheet HTTP ${res.status}`);
  const rows = parseCSV(await res.text());
  const teams = extractTeams(rows);
  const regions = extractRegions(rows);

  return {
    generatedAt: new Date().toISOString(),
    refreshMs: REFRESH_MS,
    source: {
      type: 'google-sheet-csv',
      sheetId: SHEET_ID,
      gid: GID,
      csvUrl: CSV_URL
    },
    scoring: PTS,
    teams,
    regions,
    regionTotals: buildRegionTotals(regions),
    regionsByKey: buildRegionsByKey(regions)
  };
}

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentType
    });
    res.end(body);
  } catch (err) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
    return;
  }

  if (pathname === '/live.json' || pathname === '/api/live.json') {
    try {
      const payload = await buildLivePayload();
      send(res, 200, JSON.stringify(payload, null, 2), 'application/json; charset=utf-8');
    } catch (err) {
      send(res, 502, JSON.stringify({ error: err.message }, null, 2), 'application/json; charset=utf-8');
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Clash of Nations server running at http://localhost:${PORT}`);
  console.log(`Live JSON endpoint: http://localhost:${PORT}/live.json`);
});
