/**
 * UI Tests: Login page — https://www.saucedemo.com/
 *
 * Upload via the Test Runner panel → "Run in Browser"
 * (the page must already be loaded in the iframe)
 */

describe('Login page structure', () => {
  it('has a username field', () => {
    const el = cy.find('[data-test="username"]');
    expect(el).not.toBe(null);
  });

  it('has a password field', () => {
    const el = cy.find('[data-test="password"]');
    expect(el).not.toBe(null);
  });

  it('has a login button', () => {
    const el = cy.find('[data-test="login-button"]');
    expect(el).not.toBe(null);
  });

  it('shows the Swag Labs logo', () => {
    const logo = cy.find('.login_logo');
    expect(logo).not.toBe(null);
    expect(cy.text('.login_logo')).toContain('Swag Labs');
  });

  it('has accepted usernames listed on the page', () => {
    const hint = cy.find('[data-test="login-credentials"]') || cy.find('#login_credentials');
    expect(hint).not.toBe(null);
  });
});

describe('Login validation', () => {
  it('shows error when submitting empty credentials', async () => {
    cy.click('[data-test="login-button"]');
    const err = await cy.waitForElement('[data-test="error"]', 3000);
    expect(err).not.toBe(null);
    expect(cy.text('[data-test="error"]')).toContain('Username is required');
  });

  it('shows error for wrong password', async () => {
    cy.type('[data-test="username"]', 'standard_user');
    cy.type('[data-test="password"]', 'wrong_password');
    cy.click('[data-test="login-button"]');
    const err = await cy.waitForElement('[data-test="error"]', 3000);
    expect(cy.text('[data-test="error"]')).toContain('Username and password do not match');
  });

  it('shows error for locked-out user', async () => {
    cy.type('[data-test="username"]', 'locked_out_user');
    cy.type('[data-test="password"]', 'secret_sauce');
    cy.click('[data-test="login-button"]');
    const err = await cy.waitForElement('[data-test="error"]', 3000);
    expect(cy.text('[data-test="error"]')).toContain('locked out');
  });
});

describe('Successful login', () => {
  it('navigates to inventory after valid credentials', async () => {
    cy.type('[data-test="username"]', 'standard_user');
    cy.type('[data-test="password"]', 'secret_sauce');
    cy.click('[data-test="login-button"]');
    await cy.waitForUrl('inventory', 5000);
    expect(cy.url()).toContain('inventory');
  });

  it('shows inventory title after login', async () => {
    await cy.waitForElement('[data-test="title"]', 3000);
    expect(cy.text('[data-test="title"]')).toBe('Products');
  });
});
