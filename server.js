// Sector Heatmap – local proxy server
// Uses Yahoo Finance v8 chart API (no auth required)
// Run: node server.js  OR double-click start-server.bat

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT     = 3458;
const CSV_PATH = path.join(__dirname, 'data', 'sectors.csv');

/* ─── CSV parser ─── */
function parseCSVLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  fields.push(cur.trim());
  return fields;
}

function num(s) {
  if (!s || s === 'N/A') return 0;
  return parseFloat(s.replace(/[+%,$]/g, '')) || 0;
}

function parseSectorsCSV() {
  const raw   = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // Last line = Barchart metadata "Downloaded from..."
  const metaLine = lines[lines.length - 1];
  const dateMatch = metaLine.match(/as of\s+([^"]+)/i);
  const updatedAt = dateMatch ? dateMatch[1].trim() : '';

  // Skip header (index 0) and metadata (last)
  const dataLines = lines.slice(1, -1);

  const sectors = [];
  let   spy     = null;

  for (const line of dataLines) {
    const f = parseCSVLine(line);
    if (f.length < 22) continue;

    const row = {
      ticker:    f[0],
      name:      f[1],
      price:     num(f[3]),
      chg:       num(f[4]),
      alpha:     num(f[8]),
      w52:       num(f[9]),
      ma100:     num(f[10]),
      ma50:      num(f[11]),
      ma150:     num(f[12]),
      ma20:      num(f[13]),
      rsi:       num(f[14]),
      vs1y:      num(f[15]),
      vsYtd:     num(f[16]),
      stoch:     num(f[21]),
      trend:     f[6],
      opinion:   f[7],
      direction: f[19],
      strength:  f[20],
    };

    if (row.ticker === 'SPY') { spy = row; }
    else { sectors.push(row); }
  }

  return { sectors, spy, updatedAt };
}

/* ─── Live quote from Yahoo Finance v8 ─── */
function fetchQuote(symbol) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 8000,
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json   = JSON.parse(data);
          const meta   = json?.chart?.result?.[0]?.meta;
          if (!meta) return resolve(null);
          const price  = meta.regularMarketPrice;
          const prev   = meta.chartPreviousClose;
          const chgPct = prev ? ((price - prev) / prev) * 100 : 0;
          resolve({ symbol, price, chgPct });
        } catch { resolve(null); }
      });
    })
    .on('error', () => resolve(null))
    .on('timeout', function() { this.destroy(); resolve(null); });
  });
}

/* ─── HTTP server ─── */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // GET /api/sectors – parse CSV and return sector data + SPY + date
  if (reqUrl.pathname === '/api/sectors') {
    try {
      const data = parseSectorsCSV();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'CSV parse error: ' + e.message }));
    }

  // GET /api/quotes?symbols=SPY,XLE,... – live prices
  } else if (reqUrl.pathname === '/api/quotes') {
    const symbols = (reqUrl.searchParams.get('symbols') || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    if (!symbols.length) { res.writeHead(400); res.end('{"error":"no symbols"}'); return; }

    Promise.all(symbols.map(fetchQuote)).then(results => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ quotes: results.filter(Boolean) }));
    });

  // GET / – serve index.html
  } else {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://localhost:${PORT}`;
  console.log('');
  console.log('  Sector Heatmap server running');
  console.log(`  Open browser: ${addr}`);
  console.log('  Data file:   data/sectors.csv');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  try { require('child_process').exec(`start ${addr}`); } catch (_) {}
});
