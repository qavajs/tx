describe('Playground', () => {

    beforeEach(async () => {
        const dirname = await browser.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
    });

    it('click', async () => {
        const clickElement = page.locator('#clickBtn');
        await clickElement.click();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Clicked');
    });

    it('double click', async () => {
        const clickElement = page.locator('#dblClickBtn');
        await clickElement.dblclick();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Double clicked');
    });

    it('right click', async () => {
        const clickElement = page.locator('#rightClickBtn');
        await clickElement.rightClick();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Right clicked');
    });
});