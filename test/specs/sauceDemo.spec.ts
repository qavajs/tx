import { test, describe } from 'tx';
import { LoginPage } from '../pages/LoginPage';

describe('Successful login', () => {
  test('navigates to inventory after valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('standard_user', 'secret_sauce');
    await loginPage.waitForInventory();
    await loginPage.expectInventoryLoaded();
  });
});

describe('Failed login', () => {
  test('shows error message for locked out user', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('locked_out_user', 'secret_sauce');
    await loginPage.expectError('locked out');
  });

  test('shows error for wrong password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('standard_user', 'wrong_password');
    await loginPage.expectError(
      'Username and password do not match'
    );
  });
});

describe('Cookie-based login', () => {
  test('uses existing session cookie', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.loginWithCookie();
    await loginPage.waitForInventory();
    await loginPage.expectInventoryLoaded();
  });
});

describe('Inventory page layout', () => {
  test('shows the Products heading', async ({ page, expect }) => {
    await page.goto('https://www.saucedemo.com');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    expect(page.url()).toContain('inventory');
    await expect(page.getByTestId('title')).toHaveText('Products');
    const count = await page.locator('[data-test="inventory-item"]').count();
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(6);
  });
});

describe('Adding items to cart', () => {
  test('add items to cart', async ({ page, expect }) => {
    await page.goto('https://www.saucedemo.com/');
    await page.evaluate(() => localStorage.clear());
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();
    await page.locator('[data-test="add-to-cart-sauce-labs-bolt-t-shirt"]').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('2', { timeout: 3000 });
    await page.locator('[data-test="remove-sauce-labs-bike-light"]').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');
  });
});
