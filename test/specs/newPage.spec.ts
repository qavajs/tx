import { test, expect } from '@qavajs/tx';

test.describe('testauto.app', () => {

    test('new window', async ({ page }) => {
        await page.goto('https://qa-practice.razvanvancea.ro/window.html');
        const newTabButton = page.locator('#newWindowBtn');
        // const pagePromise = page.context().waitForEvent('page', { timeout: 5000 });
        await newTabButton.click();
        // const page2 = await pagePromise;
        await expect(page.locator('h2')).toHaveText('Table Example');
    });

});