/**
 * Configuration Examples
 * Copy and customize these configurations for your needs
 */

import { CypressSafariWrapper } from '../wrapper';

/**
 * Configuration 1: Local Development
 * Best for: Testing local development servers
 */
const localDevConfig = {
  targetUrl: 'http://localhost:3000',        // Your local dev server
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3001,                   // Avoid conflicts
  headless: false,
};

/**
 * Configuration 2: Production Testing
 * Best for: Testing production websites
 */
const productionConfig = {
  targetUrl: 'https://www.example.com',
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: false,
};

/**
 * Configuration 3: CI/CD Pipeline
 * Best for: Automated testing in CI/CD
 */
const cicdConfig = {
  targetUrl: process.env.TEST_URL || 'https://staging.example.com',
  proxyHost: 'localhost',
  port1: parseInt(process.env.PROXY_PORT1 || '1337'),
  port2: parseInt(process.env.PROXY_PORT2 || '1338'),
  controlPanelPort: parseInt(process.env.PANEL_PORT || '3000'),
  headless: true,                           // No browser UI
};

/**
 * Configuration 4: Headless Testing
 * Best for: Server-side testing without UI
 */
const headlessConfig = {
  targetUrl: 'https://www.example.com',
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: true,                           // No browser opens
};

/**
 * Configuration 5: Multiple Instances
 * Best for: Parallel testing with different ports
 */
const parallelConfig1 = {
  targetUrl: 'https://www.example.com/test1',
  proxyHost: 'localhost',
  port1: 2337,                              // Different port
  port2: 2338,
  controlPanelPort: 4000,
  headless: true,
};

const parallelConfig2 = {
  targetUrl: 'https://www.example.com/test2',
  proxyHost: 'localhost',
  port1: 3337,                              // Different port
  port2: 3338,
  controlPanelPort: 4001,
  headless: true,
};

/**
 * Configuration 6: Debugging
 * Best for: Detailed debugging and inspection
 */
const debugConfig = {
  targetUrl: 'https://www.example.com',
  proxyHost: 'localhost',
  port1: 1337,
  port2: 1338,
  controlPanelPort: 3000,
  headless: false,                          // See the browser
};

// Example: Using configurations
async function exampleUsage() {
  // Development
  const devWrapper = new CypressSafariWrapper(localDevConfig);
  const devCy = await devWrapper.start();
  // ... run tests
  await devWrapper.stop();

  // Production
  const prodWrapper = new CypressSafariWrapper(productionConfig);
  const prodCy = await prodWrapper.start();
  // ... run tests
  await prodWrapper.stop();

  // Parallel testing
  const test1 = new CypressSafariWrapper(parallelConfig1);
  const test2 = new CypressSafariWrapper(parallelConfig2);

  const [cy1, cy2] = await Promise.all([
    test1.start(),
    test2.start(),
  ]);

  // ... run parallel tests
  await Promise.all([
    test1.stop(),
    test2.stop(),
  ]);
}

export {
  localDevConfig,
  productionConfig,
  cicdConfig,
  headlessConfig,
  parallelConfig1,
  parallelConfig2,
  debugConfig,
};
