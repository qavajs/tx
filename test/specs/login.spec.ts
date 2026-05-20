import { LoginPage } from '../pages/LoginPage';

describe('Successful login', () => {
  it('navigates to inventory after valid credentials', async () => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('standard_user', 'secret_sauce');

    await loginPage.waitForInventory();
    await loginPage.expectInventoryLoaded();
  });
});

describe('Failed login', () => {
  it('shows error message for locked out user', async () => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('locked_out_user', 'secret_sauce');

    await loginPage.expectError('locked out');
  });

  it('shows error for wrong password', async () => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login('standard_user', 'wrong_password');

    await loginPage.expectError(
      'Username and password do not match'
    );
  });
});

describe('Cookie-based login', () => {
  it('uses existing session cookie', async () => {
    const loginPage = new LoginPage(page);

    await loginPage.loginWithCookie();

    await loginPage.waitForInventory();
    await loginPage.expectInventoryLoaded();
  });
});