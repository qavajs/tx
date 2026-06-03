const http = require('http');
const fs = require('fs');
const path = require('path');

const APP_PORT = 3000;
const APP_DIR = path.join(__dirname, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};

const appServer = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const filePath = path.join(APP_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(APP_DIR + path.sep) && filePath !== APP_DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});
appServer.on('error', err => { if (err.code !== 'EADDRINUSE') console.error('[app-server]', err.message); });
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
    ['../src/reporters/JUnitReporter.ts', { outputPath: 'report/report.xml' }],
    ['../src/reporters/HtmlReporter.ts', { outputPath: 'report/report.html' }],
  ],
  tasks: {
    readFile: ({ path }) => require('fs').readFileSync(path, 'utf-8'),
    deleteFile: ({ path }) => require('fs').unlinkSync(path),
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
