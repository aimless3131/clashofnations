const SHEET_ID = '1mz19RnMb4vWJ5OegSxVjHj323Gv7dQdJULObm_sIsRk';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

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

function extractData(rows) {
  // 1. Aşama: rows 1-10 (index 1-10, header at 0)
  const stage1 = [];
  for (let i = 1; i <= 10; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    stage1.push({
      team: r[0],
      total: parseInt(r[5], 10) || 0
    });
  }
  stage1.sort((a, b) => b.total - a.total);

  // Final Maçı: find "Final Maçı" row, then skip "Teams" header, take 10 rows
  let finalStart = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].toLowerCase().includes('final')) {
      finalStart = i + 2; // skip "Final Maçı" and "Teams" rows
      break;
    }
  }

  const finalMatch = [];
  if (finalStart > 0) {
    for (let i = finalStart; i < finalStart + 10 && i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[0]) continue;
      finalMatch.push({
        team: r[0],
        total: parseInt(r[5], 10) || 0
      });
    }
  }
  finalMatch.sort((a, b) => b.total - a.total);

  // Canlı Sıralama: columns 7-8 (index 7, 8) from rows 1-10
  const liveRanking = [];
  for (let i = 1; i <= 10; i++) {
    const r = rows[i];
    if (!r || !r[7]) continue;
    liveRanking.push({
      team: r[7],
      total: parseInt(r[8], 10) || 0
    });
  }
  // Already sorted in sheet, but ensure sort
  liveRanking.sort((a, b) => b.total - a.total);

  return { stage1, finalMatch, liveRanking };
}

function getTopClass(index) {
  if (index === 0) return 'top-1';
  if (index === 1) return 'top-2';
  if (index === 2) return 'top-3';
  return '';
}

function renderRankRow(item, index, showPts) {
  const ptsLabel = showPts ? '<span>PTS</span>' : '';
  return `
    <div class="rank-row ${getTopClass(index)}">
      <div class="rank-number">${index + 1}</div>
      <div class="team-name">${item.team}</div>
      <div class="points">${item.total}${ptsLabel}</div>
    </div>
  `;
}

function render(data) {
  const app = document.getElementById('app');

  const liveRows = data.liveRanking.map((item, i) => renderRankRow(item, i, true)).join('');
  const stage1Rows = data.stage1.map((item, i) => renderRankRow(item, i, false)).join('');
  const finalRows = data.finalMatch.map((item, i) => renderRankRow(item, i, false)).join('');

  app.innerHTML = `
    <div class="columns-grid">
      <div class="panel">
        <div class="panel-header">
          <h2>1. AŞAMA</h2>
          <div class="accent-line"></div>
        </div>
        <div class="ranking-list">
          ${stage1Rows}
        </div>
      </div>

      <div class="panel live-panel">
        <div class="panel-header">
          <h2>CANLI SIRALAMA</h2>
          <div class="accent-line"></div>
        </div>
        <div class="ranking-list">
          ${liveRows}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>FİNAL MAÇI</h2>
          <div class="accent-line"></div>
        </div>
        <div class="ranking-list">
          ${finalRows}
        </div>
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
    const rows = parseCSV(text);
    const data = extractData(rows);
    render(data);
  } catch (err) {
    console.error('Veri yüklenirken hata:', err);
    app.innerHTML = `<div class="error">Veri yüklenemedi. Sayfayı yenileyin.<br><small>${err.message}</small></div>`;
  }

  // 10 saniyede bir kontrol et, sadece veri değiştiyse güncelle
  setInterval(async () => {
    try {
      const text = await fetchData();
      if (text !== lastCSV) {
        lastCSV = text;
        const rows = parseCSV(text);
        const data = extractData(rows);
        render(data);
      }
    } catch (e) {
      // sessizce devam et, bağlantı koparsa mevcut veriyi göstermeye devam eder
    }
  }, 10000);
}

document.addEventListener('DOMContentLoaded', init);
