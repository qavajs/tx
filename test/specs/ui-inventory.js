/**
 * UI Tests: Inventory page — https://www.saucedemo.com/inventory.html
 *
 * Assumes the user is already logged in (run ui-login.js first).
 *
 * Run in Browser via the Test Runner panel.
 */

describe('Inventory page layout', () => {
  it('shows the Products heading', async () => {
    await page.goto('https://www.saucedemo.com/');
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
  it('add items to cart', async () => {
    await page.goto('https://www.saucedemo.com/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    await page.getByTestId('add-to-cart-sauce-labs-bike-light').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('2', { timeout: 3000 });
    await page.getByTestId('remove-sauce-labs-backpack').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');
  });
});
