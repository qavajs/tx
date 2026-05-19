/**
 * Advanced Examples - Complex testing scenarios
 */

import { CypressSafariWrapper } from '../wrapper';
import { TestSuite, Assert } from '../types';

/**
 * Example 1: Test Suite Pattern
 */
class SauceDemoTestSuite extends TestSuite {
  private cyInstance: any;
  private wrapperInstance: any;

  async beforeAll() {
    console.log('\n📦 Setting up test suite...');
    this.wrapperInstance = new CypressSafariWrapper({
      targetUrl: 'https://www.saucedemo.com/',
    });
    this.cyInstance = await this.wrapperInstance.start();
    await this.cyInstance.wait(5000);
  }

  async afterAll() {
    console.log('\n🛑 Tearing down test suite...');
    await this.wrapperInstance.stop();
  }

  async beforeEach() {
    // Reload before each test
    this.cyInstance.reload();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async testPageLoads() {
    console.log('  → Testing page loads...');
    const title = this.cyInstance.title();
    Assert.includes(title, 'Swag Labs', 'Page title should contain "Swag Labs"');
  }

  async testLoginFieldsExist() {
    console.log('  → Testing login fields exist...');
    const username = this.cyInstance.find('[data-test="username"]');
    Assert.truthy(username, 'Username field should exist');

    const password = this.cyInstance.find('[data-test="password"]');
    Assert.truthy(password, 'Password field should exist');

    const loginBtn = this.cyInstance.find('[data-test="login-button"]');
    Assert.truthy(loginBtn, 'Login button should exist');
  }

  async testSuccessfulLogin() {
    console.log('  → Testing successful login...');
    this.cyInstance.type('[data-test="username"]', 'standard_user');
    this.cyInstance.type('[data-test="password"]', 'secret_sauce');
    this.cyInstance.click('[data-test="login-button"]');

    await this.cyInstance.waitForElement('[data-test="inventory-list"]', 5000);

    const url = this.cyInstance.url();
    Assert.includes(url, 'inventory', 'URL should contain "inventory"');
  }

  async testProductsDisplay() {
    console.log('  → Testing products display...');
    // First login
    this.cyInstance.type('[data-test="username"]', 'standard_user');
    this.cyInstance.type('[data-test="password"]', 'secret_sauce');
    this.cyInstance.click('[data-test="login-button"]');
    await this.cyInstance.waitForElement('[data-test="inventory-list"]', 5000);

    // Then check products
    const products = this.cyInstance.get('[data-test="inventory-item"]');
    Assert.greater(products.length, 0, 'Should display at least one product');
  }
}

/**
 * Example 2: Form Validation Testing
 */
async function testFormValidation() {
  console.log('\n📋 Testing form validation...\n');

  const wrapper = new CypressSafariWrapper({
    targetUrl: 'https://httpbin.org/forms/post',
    headless: true,
  });

  try {
    const cy = await wrapper.start();
    await cy.wait(5000);

    // Test 1: Form fields exist
    console.log('✓ Verifying form fields...');
    const inputs = cy.get('input');
    Assert.greater(inputs.length, 0, 'Form should have input fields');

    // Test 2: Submit button exists
    console.log('✓ Verifying submit button...');
    const submitBtn = cy.find('button[type="submit"]');
    Assert.truthy(submitBtn, 'Submit button should exist');

    console.log('\n✨ Form validation tests passed!\n');

    await wrapper.stop();
  } catch (error) {
    console.error('❌ Test failed:', error);
    await wrapper.stop();
  }
}

/**
 * Example 3: Multi-step User Flow
 */
async function testComplexUserFlow() {
  console.log('\n🔄 Testing complex user flow...\n');

  const wrapper = new CypressSafariWrapper({
    targetUrl: 'https://www.saucedemo.com/',
  });

  try {
    const cy = await wrapper.start();
    await cy.wait(5000);

    const steps = [
      {
        name: 'Login',
        action: async () => {
          cy.type('[data-test="username"]', 'standard_user');
          cy.type('[data-test="password"]', 'secret_sauce');
          cy.click('[data-test="login-button"]');
          await cy.waitForElement('[data-test="inventory-list"]', 5000);
          console.log('✓ Logged in successfully');
        },
      },
      {
        name: 'Add item to cart',
        action: async () => {
          const addButtons = cy.get('[data-test*="add-to-cart"]');
          Assert.greater(addButtons.length, 0, 'Should have items to add');
          cy.click('[data-test="add-to-cart-sauce-labs-backpack"]');
          console.log('✓ Item added to cart');
        },
      },
      {
        name: 'Go to cart',
        action: async () => {
          cy.click('[data-test="shopping-cart-link"]');
          await cy.waitForElement('[data-test="checkout"]', 5000);
          console.log('✓ Navigated to cart');
        },
      },
      {
        name: 'Verify cart contents',
        action: async () => {
          const cartItems = cy.get('[data-test="inventory-item"]');
          Assert.greater(cartItems.length, 0, 'Cart should have items');
          console.log(`✓ Cart has ${cartItems.length} item(s)`);
        },
      },
    ];

    for (const step of steps) {
      console.log(`Step: ${step.name}`);
      await step.action();
    }

    console.log('\n✨ Complex flow test passed!\n');

    await wrapper.stop();
  } catch (error) {
    console.error('❌ Test failed:', error);
    await wrapper.stop();
  }
}

/**
 * Example 4: Performance Testing
 */
async function testPagePerformance() {
  console.log('\n⏱️  Testing page performance...\n');

  const wrapper = new CypressSafariWrapper({
    targetUrl: 'https://www.saucedemo.com/',
    headless: true,
  });

  try {
    const cy = await wrapper.start();

    const startTime = Date.now();
    await cy.wait(5000);
    const loadTime = Date.now() - startTime;

    console.log(`📊 Page load time: ${loadTime}ms`);

    if (loadTime > 5000) {
      console.warn('⚠️  Page took longer than expected to load');
    } else {
      console.log('✓ Page loaded within acceptable time');
    }

    // Test DOM size
    const allElements = cy.get('*');
    console.log(`📊 DOM elements: ${allElements.length}`);

    if (allElements.length > 10000) {
      console.warn('⚠️  Large DOM tree detected');
    }

    console.log('\n✨ Performance test completed!\n');

    await wrapper.stop();
  } catch (error) {
    console.error('❌ Test failed:', error);
    await wrapper.stop();
  }
}

/**
 * Run examples
 */
async function runExamples() {
  const examples = [
    { name: 'Test Suite Pattern', fn: testSuitePattern },
    { name: 'Form Validation', fn: testFormValidation },
    { name: 'Complex Flow', fn: testComplexUserFlow },
    { name: 'Performance', fn: testPagePerformance },
  ];

  console.log('\n╔════════════════════════════════════╗');
  console.log('║  Cypress Safari - Advanced Examples ║');
  console.log('╚════════════════════════════════════╝');

  for (const example of examples) {
    try {
      await example.fn();
    } catch (error) {
      console.error(`Error in ${example.name}:`, error);
    }
  }

  console.log('\n✨ All examples completed!\n');
}

async function testSuitePattern() {
  const suite = new SauceDemoTestSuite();
  const results = await suite.run();

  console.log('\n📊 Test Results:');
  console.log(`   ✓ Passed: ${results.passed}`);
  console.log(`   ✗ Failed: ${results.failed}`);
  console.log(`   ⏱️  Duration: ${results.duration}ms\n`);
}

// Export for use in other files
export {
  SauceDemoTestSuite,
  testFormValidation,
  testComplexUserFlow,
  testPagePerformance,
  testSuitePattern,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
