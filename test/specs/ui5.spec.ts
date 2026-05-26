import { test, expect } from '@qavajs/tx';

test.describe('UI5', () => {
    test('ui5 cart functionality', async ({ page }) => {
        await page.goto('https://ui5.sap.com/test-resources/sap/m/demokit/cart/webapp/index.html?sap-ui-theme=sap_horizon_dark#');
        await page.locator('[role="listitem"][id*=category][title="Open category Keyboards"]').click();
        await page.locator('[title="Open details for Internet Keyboard"]').click();
        await page.locator('[aria-label="Product Footer"] button').click();
        await page.locator('[aria-label="Product Header"] [aria-label="Show Shopping Cart"]').click();
        await page.locator('[data-sap-ui="container-cart---cartView--proceedButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--contentsStep-nextButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--paymentTypeStep-nextButton"]').click();
        await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').fill('John Doe');
        await page.locator('#container-cart---checkoutView--creditCardNumber-inner').fill('4111 1111 1111 1111');
        await page.locator('#container-cart---checkoutView--creditCardExpirationDate-inner').fill('12/2030');
        await page.locator('#container-cart---checkoutView--creditCardSecurityNumber-inner').fill('123');
        await page.locator('#container-cart---checkoutView--creditCardHolderName-inner').focus();
        await page.locator('[data-sap-ui="container-cart---checkoutView--creditCardStep-nextButton"]').click();
        await page.locator('#container-cart---checkoutView--invoiceAddressAddress-inner').fill('Main St 123');
        await page.locator('#container-cart---checkoutView--invoiceAddressZip-inner').fill('12345');
        await page.locator('#container-cart---checkoutView--invoiceAddressCity-inner').fill('Anytown');
        await page.locator('#container-cart---checkoutView--invoiceAddressCountry-inner').fill('USA');
        await page.locator('#container-cart---checkoutView--invoiceAddressAddress-inner').focus();
        await page.locator('[data-sap-ui="container-cart---checkoutView--invoiceStep-nextButton"]').click();
        await page.locator('[data-sap-ui="container-cart---checkoutView--deliveryTypeStep-nextButton"]').click();
        await expect(page.locator('#container-cart---checkoutView--totalPriceTitle-inner')).toHaveText('Total: 16,00 EUR');
        await page.locator('#container-cart---checkoutView--submitOrder').click();
        await page.locator('footer button:has-text("Yes")').click();
        await expect(page.locator('[aria-label="Order Completed"]')).toBeVisible();
        await expect(page.locator('[aria-label="Order Completed"]')).toContainText('Thank you for your order!');
    });
});