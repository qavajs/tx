/**
 * UI Tests: Login page — https://www.saucedemo.com/
 *
 * Upload via the Test Runner panel → "Run in Browser"
 * (the page must already be loaded in the iframe)
 */

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
