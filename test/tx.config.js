const { ConsoleReporter } = require('../dist/reporter');

module.exports = {
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: false,
  testFiles: ['./specs/**/*.spec.[js,ts]'],
  viewport: { width: 1920, height: 1080 },
  reporters: [new ConsoleReporter()],
};
