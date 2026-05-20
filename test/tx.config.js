const { ConsoleReporter } = require('../dist/ConsoleReporter');
const { HtmlReporter } = require('../dist/HtmlReporter');

module.exports = {
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: false,
  testFiles: ['./specs/**/*.spec.ts'],
  viewport: { width: 1600, height: 900 },
  reporters: [new ConsoleReporter(), new HtmlReporter('report.html')],
};
