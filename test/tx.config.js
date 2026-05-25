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
