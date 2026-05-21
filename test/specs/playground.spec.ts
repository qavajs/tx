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

    it('hover', async () => {
        const clickElement = page.locator('#hoverTarget');
        await clickElement.hover();
        await expect(clickElement).toHaveAttribute('data-hammerhead-hovered');
    });

    it('type to input', async () => {
        const typeElement = page.locator('#textInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    it('type to textarea', async () => {
        const typeElement = page.locator('#textareaInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    it('type to password', async () => {
        const typeElement = page.locator('#passwordInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    it('check checkbox', async () => {
        const checkbox = page.locator('#checkbox');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    });

    it('check radio', async () => {
        const radio = page.locator('[name=role][value=user]');
        await radio.check();
        await expect(radio).toBeChecked();
    });

    it('select option', async () => {
        const select = page.locator('#countrySelect');
        await select.selectOption('Latvia');
        await expect(select).toHaveValue('Latvia');
    });

    it('select date', async () => {
        const select = page.locator('#datePicker');
        await select.fill('2026-05-04');
        await expect(select).toHaveValue('2026-05-04');
    });

    it('select file', async () => {
        const select = page.locator('#fileInput');
        await select.setInputFiles('path/to/file.txt');
        await expect(select).toHaveValue('path/to/file.txt');
    });
});