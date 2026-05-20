/**
 * UI Tests: Cart and Checkout flow — https://www.saucedemo.com/
 *
 * Assumes the user is already logged in. The tests set up their own cart state
 * by adding items before navigating to the cart page.
 *
 * Upload via the Test Runner panel → "Run in Browser"
 */

describe('Cart page', () => {
  it('navigates to cart when cart icon is clicked', async () => {
    // Ensure at least one item is in the cart first
    if (!cy.find('[data-test="remove-sauce-labs-backpack"]')) {
      cy.click('[data-test="add-to-cart-sauce-labs-backpack"]');
      await cy.waitForElement('[data-test="shopping-cart-badge"]', 3000);
    }
    cy.click('[data-test="shopping-cart-link"]');
    await cy.waitForUrl('cart', 5000);
    expect(cy.url()).toContain('cart');
  });

  it('shows the Your Cart heading', () => {
    expect(cy.text('[data-test="title"]')).toBe('Your Cart');
  });

  it('lists added items', () => {
    const items = cy.get('[data-test="cart-item"]') || cy.get('[data-test="cart-list-item"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('each cart item has a name', () => {
    const names = cy.get('[data-test="inventory-item-name"]');
    expect(names.length).toBeGreaterThan(0);
    names.forEach(n => expect(n.textContent.trim().length).toBeGreaterThan(0));
  });

  it('each cart item has a price', () => {
    const prices = cy.get('[data-test="inventory-item-price"]');
    expect(prices.length).toBeGreaterThan(0);
    prices.forEach(p => expect(p.textContent).toContain('$'));
  });

  it('has a Continue Shopping button', () => {
    const btn = cy.find('[data-test="continue-shopping"]');
    expect(btn).not.toBe(null);
  });

  it('has a Checkout button', () => {
    const btn = cy.find('[data-test="checkout"]');
    expect(btn).not.toBe(null);
  });

  it('removes item when Remove is clicked', async () => {
    const before = cy.get('[data-test="cart-item"]').length || cy.get('[data-test="cart-list-item"]').length;
    const removeBtn = cy.find('[data-test^="remove-"]');
    if (removeBtn) {
      removeBtn.click();
      await cy.wait(300);
      const after = cy.get('[data-test="cart-item"]').length || cy.get('[data-test="cart-list-item"]').length;
      expect(after).toBe(before - 1);
    }
  });

  it('Continue Shopping returns to inventory', async () => {
    cy.click('[data-test="continue-shopping"]');
    await cy.waitForUrl('inventory', 5000);
    expect(cy.url()).toContain('inventory');
  });
});

describe('Checkout step 1 — contact info', () => {
  it('navigates to checkout from the cart', async () => {
    // Add item and go to cart
    if (!cy.find('[data-test="shopping-cart-badge"]')) {
      cy.click('[data-test="add-to-cart-sauce-labs-backpack"]');
      await cy.waitForElement('[data-test="shopping-cart-badge"]', 3000);
    }
    cy.click('[data-test="shopping-cart-link"]');
    await cy.waitForUrl('cart', 5000);
    cy.click('[data-test="checkout"]');
    await cy.waitForUrl('checkout-step-one', 5000);
    expect(cy.url()).toContain('checkout-step-one');
  });

  it('shows the Checkout: Your Information heading', () => {
    expect(cy.text('[data-test="title"]')).toBe('Checkout: Your Information');
  });

  it('has first name, last name, and postal code fields', () => {
    expect(cy.find('[data-test="firstName"]')).not.toBe(null);
    expect(cy.find('[data-test="lastName"]')).not.toBe(null);
    expect(cy.find('[data-test="postalCode"]')).not.toBe(null);
  });

  it('shows error when Continue is clicked with empty fields', async () => {
    cy.click('[data-test="continue"]');
    const err = await cy.waitForElement('[data-test="error"]', 3000);
    expect(cy.text('[data-test="error"]')).toContain('First Name is required');
  });

  it('proceeds to step 2 with valid contact info', async () => {
    cy.type('[data-test="firstName"]', 'Jane');
    cy.type('[data-test="lastName"]', 'Doe');
    cy.type('[data-test="postalCode"]', '12345');
    cy.click('[data-test="continue"]');
    await cy.waitForUrl('checkout-step-two', 5000);
    expect(cy.url()).toContain('checkout-step-two');
  });
});

describe('Checkout step 2 — order summary', () => {
  it('shows the Checkout: Overview heading', () => {
    expect(cy.text('[data-test="title"]')).toBe('Checkout: Overview');
  });

  it('shows at least one item in the summary', () => {
    const items = cy.get('[data-test="cart-item"]') || cy.get('[data-test="cart-list-item"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows a total price line', () => {
    const total = cy.find('[data-test="total-label"]') || cy.find('.summary_total_label');
    expect(total).not.toBe(null);
    expect(total.textContent).toContain('$');
  });

  it('shows a tax line', () => {
    const tax = cy.find('[data-test="tax-label"]') || cy.find('.summary_tax_label');
    expect(tax).not.toBe(null);
  });

  it('has a Finish button', () => {
    expect(cy.find('[data-test="finish"]')).not.toBe(null);
  });

  it('completes the order when Finish is clicked', async () => {
    cy.click('[data-test="finish"]');
    await cy.waitForUrl('checkout-complete', 5000);
    expect(cy.url()).toContain('checkout-complete');
  });

  it('shows the Thank You confirmation', () => {
    expect(cy.text('[data-test="complete-header"]')).toContain('Thank you');
  });
});
