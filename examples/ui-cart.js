/**
 * UI Tests: Cart and Checkout — https://www.saucedemo.com/
 *
 * End-to-end flows. Each test logs in, sets up its own state,
 * and drives through a complete user journey.
 *
 * Run in Browser via the Test Runner panel.
 */

async function login() {
  await page.goto('https://www.saucedemo.com/');
  await page.getByTestId('username').fill('standard_user');
  await page.getByTestId('password').fill('secret_sauce');
  await page.getByTestId('login-button').click();
  await page.waitForURL(/inventory/, { timeout: 5000 });
}

describe('Cart and Checkout', () => {
  it('completes a full purchase from inventory to order confirmation', async () => {
    await login();

    await page.getByTestId('add-to-cart-sauce-labs-backpack').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1', { timeout: 3000 });

    await page.getByTestId('shopping-cart-link').click();
    await page.waitForURL(/cart/, { timeout: 5000 });
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    expect(await page.locator('[data-test="cart-item"]').count()).toBeGreaterThan(0);

    await page.getByTestId('checkout').click();
    await page.waitForURL(/checkout-step-one/, { timeout: 5000 });
    await expect(page.getByTestId('title')).toHaveText('Checkout: Your Information');

    await page.getByTestId('firstName').fill('Jane');
    await page.getByTestId('lastName').fill('Doe');
    await page.getByTestId('postalCode').fill('12345');
    await page.getByTestId('continue').click();
    await page.waitForURL(/checkout-step-two/, { timeout: 5000 });
    await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');
    expect(await page.locator('[data-test="cart-item"]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-test="total-label"], .summary_total_label')).toBeVisible();

    await page.getByTestId('finish').click();
    await page.waitForURL(/checkout-complete/, { timeout: 5000 });
    await expect(page.getByTestId('complete-header')).toContainText('Thank you');
  });

  it('removes an item from the cart before checkout', async () => {
    await login();

    await page.getByTestId('add-to-cart-sauce-labs-backpack').click();
    await page.getByTestId('add-to-cart-sauce-labs-bike-light').click();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('2', { timeout: 3000 });

    await page.getByTestId('shopping-cart-link').click();
    await page.waitForURL(/cart/, { timeout: 5000 });
    expect(await page.locator('[data-test="cart-item"]').count()).toBe(2);

    await page.locator('[data-test^="remove-"]').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('[data-test="cart-item"]').count()).toBe(1);
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');
  });

  it('shows a validation error when checkout fields are empty', async () => {
    await login();

    await page.getByTestId('add-to-cart-sauce-labs-backpack').click();
    await page.getByTestId('shopping-cart-link').click();
    await page.waitForURL(/cart/, { timeout: 5000 });
    await page.getByTestId('checkout').click();
    await page.waitForURL(/checkout-step-one/, { timeout: 5000 });

    await page.getByTestId('continue').click();
    await expect(page.getByTestId('error')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('error')).toContainText('First Name is required');
  });
});
