describe('inventree', () => {

    beforeEach(async ({ page }) => {
        await page.goto('https://demo.inventree.org/');
    });

    it('should load the page and display the title', async ({ page, expect }) => {
        await page.goto('https://demo.inventree.org/');
        await page.locator('[aria-label="login-username"]').fill('allaccess');
        await page.locator('[aria-label="login-password"]').fill('nolimits');
        await page.locator('[type="submit"]').click();
        await expect(page.locator('.mantine-Tabs-list')).toBeVisible();
        expect(page).toHaveTitle('InvenTree Demo Server');
    });
});