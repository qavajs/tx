/**
 * UI Tests: Inventory page — https://www.saucedemo.com/inventory.html
 *
 * Assumes the user is already logged in (run ui-login.js first, or click
 * "Demo Login" in the control panel).
 *
 * Upload via the Test Runner panel → "Run in Browser"
 */

describe('Inventory page layout', () => {
  it('shows the Products heading', () => {
    expect(cy.text('[data-test="title"]')).toBe('Products');
  });

  it('renders at least one product card', () => {
    const cards = cy.get('[data-test="inventory-item"]');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('shows exactly 6 products', () => {
    const cards = cy.get('[data-test="inventory-item"]');
    expect(cards.length).toBe(6);
  });

  it('every product card has a name', () => {
    const names = cy.get('[data-test="inventory-item-name"]');
    expect(names.length).toBeGreaterThan(0);
    names.forEach(n => expect(n.textContent.trim().length).toBeGreaterThan(0));
  });

  it('every product card has a price', () => {
    const prices = cy.get('[data-test="inventory-item-price"]');
    expect(prices.length).toBeGreaterThan(0);
    prices.forEach(p => expect(p.textContent).toContain('$'));
  });

  it('every product card has an Add to Cart button', () => {
    const buttons = cy.get('[data-test^="add-to-cart"]');
    expect(buttons.length).toBe(6);
  });

  it('shows the shopping cart icon', () => {
    const cart = cy.find('[data-test="shopping-cart-link"]');
    expect(cart).not.toBe(null);
  });

  it('cart badge is absent when cart is empty', () => {
    const badge = cy.find('[data-test="shopping-cart-badge"]');
    expect(badge).toBe(null);
  });
});

describe('Product sorting', () => {
  it('has a sort dropdown', () => {
    const select = cy.find('[data-test="product-sort-container"]');
    expect(select).not.toBe(null);
  });

  it('default sort option is Name (A to Z)', () => {
    const select = cy.find('[data-test="product-sort-container"]');
    expect(select).not.toBe(null);
    expect(select.value).toBe('az');
  });
});

describe('Adding items to cart', () => {
  it('cart badge appears after adding an item', async () => {
    cy.click('[data-test="add-to-cart-sauce-labs-backpack"]');
    const badge = await cy.waitForElement('[data-test="shopping-cart-badge"]', 3000);
    expect(badge).not.toBe(null);
    expect(cy.text('[data-test="shopping-cart-badge"]')).toBe('1');
  });

  it('button label changes to Remove after adding', () => {
    const btn = cy.find('[data-test="remove-sauce-labs-backpack"]');
    expect(btn).not.toBe(null);
    expect(btn.textContent.trim()).toBe('Remove');
  });

  it('cart badge increments when a second item is added', async () => {
    cy.click('[data-test="add-to-cart-sauce-labs-bike-light"]');
    await cy.waitForElement('[data-test="shopping-cart-badge"]', 3000);
    expect(cy.text('[data-test="shopping-cart-badge"]')).toBe('2');
  });

  it('removes item from cart and badge decrements', async () => {
    cy.click('[data-test="remove-sauce-labs-backpack"]');
    await cy.wait(300);
    expect(cy.text('[data-test="shopping-cart-badge"]')).toBe('1');
  });
});
