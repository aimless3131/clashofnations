const SHEET_ID = '101bdNW3KITcaYOmL8Qr7OWRQVq_2qB_mjXE5bktqbGU';
const GID = '1323449178';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
const TEAM_COUNT = 15;

// Takım logoları — yeni takım eklendikçe buraya ekle
// Değer string ise tek logo, dizi ise yan yana birden fazla logo gösterilir.
const TEAM_LOGOS = {
  'BURUNLEY ESPOR': 'assets/teams/BURUNLEY.png',
  'KARA': 'assets/teams/KARA.png',
  'TEAM BRA': 'assets/teams/TEAM_BRA.png',
  'BARISG': 'assets/teams/BARISG.png',
  'KNGL': 'assets/teams/KNGL.png',
  'KATMAN': 'assets/teams/KATMAN.png',
  'TEAM ROSE': 'assets/teams/TEAM_ROSE.png',
  'BARBAR': 'assets/teams/BARBAR.png',
  'ATABARI': 'assets/teams/ATABARI.png',
  'GIRL POWER': [
    'assets/teams/girl_power/KATMAN71.png',
    'assets/teams/girl_power/MAKARON.png',
    'assets/teams/girl_power/NISA.png',
    'assets/teams/girl_power/FIRESHINE.png',
  ],
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

// Puan çarpanları — sheet'te adet tutuluyor, görüntüde puana çevrilir.
//   SIRALAMA = B*100 + C*150 + D*50  + E*30   (WWCD / 2xWWCD / Top3 / Top4-10)
//   SKOR     = F*20  + G*40  + H*80          (Each / +10 / +20 Elimination)
const PTS = {
  wwcd: 100,
  wwcd2x: 150,
  top3: 50,
  top4_10: 30,
  elim: 20,
  elim10: 40,
  elim20: 80
};

function readTeamRow(r) {
  return {
    team: r[0],
    sira: num(r[1]) * PTS.wwcd
        + num(r[2]) * PTS.wwcd2x
        + num(r[3]) * PTS.top3
        + num(r[4]) * PTS.top4_10,
    skor: num(r[5]) * PTS.elim
        + num(r[6]) * PTS.elim10
        + num(r[7]) * PTS.elim20
  };
}

function extractData(rows) {
  // Stage 1: satır 2..16 → CSV indeksleri 1..TEAM_COUNT
  const stage1 = {};
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const t = readTeamRow(r);
    stage1[t.team] = t;
  }

  // Stage 2 başlangıcını bul: "Stage 2" yazan satır + 2 (başlık satırını da atla)
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

  // Sağdaki "Leaderboard Team" (M, idx 12) / "Total Points" (N, idx 13) — varsa onu kullan
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
    const s1 = stage1[name] || { skor: 0, sira: 0 };
    const s2 = stage2[name] || { skor: 0, sira: 0 };
    const total = totalMap[name] !== undefined
      ? totalMap[name]
      : s1.skor + s1.sira + s2.skor + s2.sira;
    teams.push({
      team: name,
      s1Skor: s1.skor,
      s1Sira: s1.sira,
      s2Skor: s2.skor,
      s2Sira: s2.sira,
      total
    });
  });

  teams.sort((a, b) => b.total - a.total);
  return teams;
}

// M (idx 12) kolonunda "TURKEY REGION / WEU REGION / CIS REGION" etiketlerini ara,
// N (idx 13) kolonundan puanı oku. Satır kayarsa kırılmaması için tüm CSV'yi tarar.
function extractRegions(rows) {
  const wanted = {
    'TURKEY REGION': 'TÜRKİYE',
    'WEU REGION': 'WEU',
    'CIS REGION': 'CIS'
  };
  const found = {};
  for (const r of rows) {
    if (!r) continue;
    const label = (r[12] || '').toUpperCase();
    if (wanted[label] !== undefined && found[label] === undefined) {
      found[label] = num(r[13]);
    }
  }
  const list = Object.keys(wanted).map(key => ({
    name: wanted[key],
    points: found[key] || 0
  }));
  list.sort((a, b) => b.points - a.points);
  return list;
}

function getTopClass(index) {
  if (index === 0) return 'top-1';
  if (index === 1) return 'top-2';
  if (index === 2) return 'top-3';
  return '';
}

function tableRow(item, index) {
  return `
    <div class="row ${getTopClass(index)}">
      <div class="cell rank">#${index + 1}</div>
      <div class="cell team"><span class="team-text">${item.team}</span></div>
      <div class="cell">${item.s1Skor}</div>
      <div class="cell">${item.s1Sira}</div>
      <div class="cell">${item.s2Skor}</div>
      <div class="cell">${item.s2Sira}</div>
      <div class="cell total">${item.total}</div>
    </div>
  `;
}

function renderRegions(regions) {
  const leader = document.getElementById('region-leader');
  const rest = document.getElementById('region-rest');
  if (!leader || !rest) return;
  if (!regions.length) return;

  const [first, ...others] = regions;
  leader.querySelector('.region-leader-name').textContent = first.name;
  leader.querySelector('.rl-points').textContent = first.points;

  const ordinals = ['2ND', '3RD'];
  rest.innerHTML = others.map((r, i) => `
    <li class="region-row">
      <span class="region-rank">${ordinals[i] || `${i + 2}TH`}</span>
      <span class="region-name">${r.name}</span>
      <span class="region-points">${r.points}</span>
    </li>
  `).join('');
}

function render(teams, regions) {
  const app = document.getElementById('app');
  const rows = teams.map(tableRow).join('');
  renderRegions(regions || []);

  app.innerHTML = `
    <div class="leaderboard">
      <div class="group-header">
        <div class="gh-spacer"></div>
        <div class="gh-group">STAGE 1</div>
        <div class="gh-group">STAGE 2</div>
        <div class="gh-spacer end"></div>
      </div>

      <div class="col-header">
        <div class="cell rank">RANK</div>
        <div class="cell team">TEAM</div>
        <div class="cell">KILLS</div>
        <div class="cell">PLACEMENT</div>
        <div class="cell">KILLS</div>
        <div class="cell">PLACEMENT</div>
        <div class="cell total">TOTAL</div>
      </div>

      <div class="rows-list">
        ${rows}
      </div>
    </div>
  `;

}

let lastCSV = '';

async function fetchData() {
  const res = await fetch(CSV_URL + '&_t=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function init() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Veriler yükleniyor</div>';

  try {
    const text = await fetchData();
    lastCSV = text;
    const parsed = parseCSV(text);
    render(extractData(parsed), extractRegions(parsed));
  } catch (err) {
    console.error('Error loading data:', err);
    app.innerHTML = `<div class="error">Failed to load data. Please refresh the page.<br><small>${err.message}</small></div>`;
  }

  setInterval(async () => {
    try {
      const text = await fetchData();
      if (text !== lastCSV) {
        lastCSV = text;
        const parsed = parseCSV(text);
        render(extractData(parsed), extractRegions(parsed));
      }
    } catch (e) {}
  }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
