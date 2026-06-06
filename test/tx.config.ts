import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_PORT = 3000;
const APP_DIR = path.join(__dirname, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

const appServer = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.method === 'GET' && pathname === '/get') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: `http://localhost:${APP_PORT}/get` }));
    return;
  }
  if (req.method === 'POST' && pathname === '/post') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let json: unknown = null;
      try { json = JSON.parse(body); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ json }));
    });
    return;
  }
  if (req.method === 'GET' && pathname === '/cookies') {
    const cookieHeader = req.headers.cookie || '';
    const cookies: Record<string, string> = {};
    if (cookieHeader) {
      for (const part of cookieHeader.split(';')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1);
        if (k) cookies[k] = v;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cookies }));
    return;
  }

  const filePath = path.join(APP_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(APP_DIR + path.sep) && filePath !== APP_DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const mime = MIME[path.extname(filePath).toLowerCase() as keyof typeof MIME] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});
appServer.on('error', (err: any) => {
  if (err.code !== 'EADDRINUSE') console.error('[app-server]', err.message);
});
appServer.listen(APP_PORT, 'localhost');

module.exports = {
  proxyHost: 'localhost',
  retries: 0,
  headless: false,
  testFiles: ['./specs/**/*.spec.ts'],
  //grep: 'login',
  viewport: { width: 1600, height: 900 },
  //snapshot: true,
  actionTimeout: 10000,   // 10s for actions
  expectTimeout: 8000,    // 8s for expect assertions
  testTimeout: 30000,     // 30s per test
  browser: 'chrome',
  reporters: [
    ['../src/reporters/ConsoleReporter.ts', {}],
    ['../src/reporters/JunitReporter.ts', { outputPath: 'report/report.xml' }],
    ['../src/reporters/HtmlReporter.ts', { outputPath: 'report/report.html' }],
  ],
  tasks: {
    readFile: ({ path }: { path: string }) => require('fs').readFileSync(path, 'utf-8'),
    deleteFile: ({ path }: { path: string }) => require('fs').unlinkSync(path),
    dirname: () => __dirname,
  },
  profiles: {
    ci: {
      headless: true,
      browser: 'chrome',
      testMode: true,
      retries: 1,
    },
    debug: {
      headless: false,
      actionTimeout: 30000,
      testTimeout: 120000,
    },
  },
};
