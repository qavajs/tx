describe('apptesting', () => {

    beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    it('simple input', async ({ page, expect }) => {
        const input = page.locator('#text-input');
        await input.fill('test input');
        await expect(input).toHaveValue('test input');
    });
});