module.exports = {
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
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
    ['./ConsoleReporter.ts', {}],
    ['./HtmlReporter.ts', { outputPath: 'report/report.html' }],
  ],
  tasks: {
    readFile: ({ path }) => require('fs').readFileSync(path, 'utf-8'),
    dirname: () => __dirname,
  },
  profiles: {
    ci: {
      headless: true,
      browser: 'chromium',
      testMode: true,
    },
    debug: {
      headless: false,
      actionTimeout: 30000,
      testTimeout: 120000,
    },
  },
};
