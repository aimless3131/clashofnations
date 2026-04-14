const SHEET_ID = '1mz19RnMb4vWJ5OegSxVjHj323Gv7dQdJULObm_sIsRk';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

// Takım logoları — yeni takım eklendikçe buraya ekle
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
  'GIRL POWER': 'assets/teams/GIRL_POWER.png',
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

function extractData(rows) {
  // 1. Aşama: Team(0), Toplam Skor Puanı(3), WWCD Puanı(4), Total(5)
  const stage1 = {};
  for (let i = 1; i <= 10; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    stage1[r[0]] = {
      skorPuani: num(r[3]),
      wwcdPuani: num(r[4]),
      total: num(r[5])
    };
  }

  // Final: Team(0), Kill(3), Placement(4), Total(5)
  let finalStart = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toLowerCase().includes('final')) {
      finalStart = i + 2;
      break;
    }
  }
  const final = {};
  if (finalStart > 0) {
    for (let i = finalStart; i < finalStart + 10 && i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      final[r[0]] = {
        kill: num(r[3]),
        placement: num(r[4]),
        total: num(r[5])
      };
    }
  }

  // Canlı sıralama (total points): Team(7), Total(8)
  const liveMap = {};
  for (let i = 1; i <= 10; i++) {
    const r = rows[i];
    if (!r || !r[7]) continue;
    liveMap[r[7]] = num(r[8]);
  }

  // Merge into single rows per team, sorted by total
  const teams = [];
  const teamNames = new Set([
    ...Object.keys(stage1),
    ...Object.keys(final),
    ...Object.keys(liveMap)
  ]);

  teamNames.forEach(name => {
    const s1 = stage1[name] || { kills: 0, wwcd: 0 };
    const f = final[name] || { kill: 0, placement: 0 };
    const total = liveMap[name] !== undefined
      ? liveMap[name]
      : (s1.total || 0) + (f.total || 0);
    teams.push({
      team: name,
      s1Skor: s1.skorPuani || 0,
      s1Wwcd: s1.wwcdPuani || 0,
      fKill: f.kill,
      fPlacement: f.placement,
      total
    });
  });

  teams.sort((a, b) => b.total - a.total);
  return teams;
}

function getTopClass(index) {
  if (index === 0) return 'top-1';
  if (index === 1) return 'top-2';
  if (index === 2) return 'top-3';
  return '';
}

function tableRow(item, index) {
  const logoSrc = TEAM_LOGOS[item.team.toUpperCase()] || TEAM_LOGOS[item.team];
  const teamSlug = item.team.replace(/\s+/g, '-').toUpperCase();
  const logoHTML = logoSrc
    ? `<span class="team-logo logo-${teamSlug}"><img src="${logoSrc}" alt=""></span>`
    : `<div class="team-logo-placeholder"></div>`;
  return `
    <div class="row ${getTopClass(index)}">
      <div class="cell rank">#${index + 1}</div>
      <div class="cell team">${logoHTML}<span class="team-text">${item.team}</span></div>
      <div class="cell">${item.s1Skor}</div>
      <div class="cell">${item.s1Wwcd}</div>
      <div class="cell">${item.fKill}</div>
      <div class="cell">${item.fPlacement}</div>
      <div class="cell total">${item.total}</div>
    </div>
  `;
}

function render(teams) {
  const app = document.getElementById('app');
  const rows = teams.map(tableRow).join('');

  app.innerHTML = `
    <div class="leaderboard">
      <div class="board-title">ANTİK GİZEM YÜKSELİŞ</div>

      <div class="group-header">
        <div class="gh-spacer"></div>
        <div class="gh-group">1. AŞAMA</div>
        <div class="gh-group">ŞOV MAÇI</div>
        <div class="gh-spacer end"></div>
      </div>

      <div class="col-header">
        <div class="cell rank">SIRA</div>
        <div class="cell team">TAKIM</div>
        <div class="cell">TOTAL SKOR</div>
        <div class="cell">WWCD</div>
        <div class="cell">SKOR</div>
        <div class="cell">SIRALAMA</div>
        <div class="cell total">TOPLAM</div>
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
    const teams = extractData(parseCSV(text));
    render(teams);
  } catch (err) {
    console.error('Veri yüklenirken hata:', err);
    app.innerHTML = `<div class="error">Veri yüklenemedi. Sayfayı yenileyin.<br><small>${err.message}</small></div>`;
  }

  setInterval(async () => {
    try {
      const text = await fetchData();
      if (text !== lastCSV) {
        lastCSV = text;
        render(extractData(parseCSV(text)));
      }
    } catch (e) {}
  }, 5000);
}

document.addEventListener('DOMContentLoaded', init);
