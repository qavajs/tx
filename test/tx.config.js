module.exports = {
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: false,
  testFiles: ['./specs/**/*.spec.ts'],
  viewport: { width: 1600, height: 900 },
  reporters: [
    ['./ConsoleReporter.ts', {}],
    ['./HtmlReporter.ts', { outputPath: 'report.html' }],
  ],
};
