import { test, expect } from '@qavajs/tx';

test.describe('browser.newWindow', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
        const mainTitle = page.locator('h1');
        await expect(mainTitle).toHaveText('Forms');
    });

    test('should open a new window and control it', async ({ browser, page }) => {
        const mainTitle = page.locator('h1');
        await expect(mainTitle).toHaveText('Forms');

        await browser.newWindow('https://apptesting.pl/pages/interactions.html');

        // Now page should be controlling the popup
        const popupTitle = page.locator('h1');
        await expect(popupTitle).toHaveText('Interactions');
        
        const button = page.locator('#single-click-btn');
        await button.click();
        await expect(page.locator('#single-click-output')).toContainText('Button clicked at')

        // Switch back to the first tab
        browser.switchTab(t => t.url.includes('forms.html'));
        await expect(mainTitle).toHaveText('Forms');

        // Switch back to the popup
        browser.switchTab(t => t.url.includes('interactions.html'));
        await expect(popupTitle).toHaveText('Interactions');
    });

    test('should handle navigation in popup', async ({ browser, page }) => {
        await page.goto('https://apptesting.pl/pages/widgets.html');
        await expect(page.locator('h1')).toHaveText('Widgets');
    });
});
