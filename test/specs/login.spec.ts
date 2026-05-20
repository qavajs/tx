/**
 * UI Tests: Login page — https://www.saucedemo.com/
 *
 * Run in Browser via the Test Runner panel.
 * The iframe must be pointing at https://www.saucedemo.com/ before running.
 */

describe('Successful login', () => {
  it('navigates to inventory after valid credentials', async () => {
    await page.goto('https://www.saucedemo.com/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    expect(page.url()).toContain('inventory');
    await expect(page.getByTestId('title')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('title')).toHaveText('Products');
  });
});

describe('Failed login', () => {
  it('shows error message for locked out user', async () => {
    await page.goto('https://www.saucedemo.com/');
    await page.getByTestId('username').fill('locked_out_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('error')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('error')).toContainText('locked out');
  });

  it('shows error for wrong password', async () => {
    await page.goto('https://www.saucedemo.com/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('wrong_password');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('error')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('error')).toContainText('Username and password do not match');
  });
});

describe('Cookie-based login', () => {
  it('uses existing session cookie', async () => {
    await page.goto('https://www.saucedemo.com/');
    await page.addInitScript(() => {
      document.cookie = 'session-username=standard_user; domain=saucedemo.com; path=/;';
    });
    await page.goto('https://www.saucedemo.com/inventory.html');
    // await page.getByTestId('username').fill('standard_user');
    // await page.getByTestId('password').fill('secret_sauce');
    // await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    expect(page.url()).toContain('inventory');
    await expect(page.getByTestId('title')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('title')).toHaveText('Products');
  });
});
