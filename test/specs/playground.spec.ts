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
        const select = page.locator('#fileUpload');
        await select.setInputFiles('test/specs/playground.spec.ts');
        await expect(select).toHaveValue('test/specs/playground.spec.ts');
    });

    it('drag and drop', async () => {
        await page.evaluate(() => {
            const dragItem = document.getElementById('dragItem')!;
            const dropZone = document.getElementById('dropZone')!;
            const dt = new DataTransfer();
            dragItem.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
            dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
            dragItem.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        });
        await expect(page.locator('#dragResult')).toHaveText('Dropped successfully');
    });

    it('scroll into view', async () => {
        const scrollTarget = page.locator('#scrollTarget');
        await scrollTarget.scrollIntoViewIfNeeded();
        await expect(scrollTarget).toBeVisible();
    });

    it('alert dialog', async () => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept();
        });
        await page.getByRole('button', { name: 'Alert' }).click();
        expect(message).toBe('Alert dialog');
    });

    it('confirm dialog', async () => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept();
        });
        await page.getByRole('button', { name: 'Confirm' }).click();
        expect(message).toBe('Confirm dialog?');
    });

    it('prompt dialog', async () => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept('my answer');
        });
        await page.getByRole('button', { name: 'Prompt' }).click();
        expect(message).toBe('Enter text');
    });

    it('toggle visibility', async () => {
        const target = page.locator('#visibilityTarget');
        await expect(target).toBeVisible();
        await page.locator('#toggleVisibility').click();
        await expect(target).toBeHidden();
        await page.locator('#toggleVisibility').click();
        await expect(target).toBeVisible();
    });

    it('toggle enabled', async () => {
        const btn = page.locator('#disabledBtn');
        await expect(btn).toBeDisabled();
        await page.locator('#toggleEnabled').click();
        await expect(btn).toBeEnabled();
    });

    it('iframe button', async () => {
        const frame = page.frameLocator('iframe');
        await frame.locator('#frameBtn').click();
        const clicked = await page.evaluate(() => {
            const iframe = document.querySelector('iframe') as HTMLIFrameElement;
            return iframe?.contentDocument?.body.dataset.clicked;
        });
        expect(clicked).toBe('true');
    });

    it('link navigation', async () => {
        await page.locator('#linkNav').click();
        await expect(page.locator('#bottom')).toBeVisible();
    });

    it('page reload', async () => {
        await page.locator('#clickBtn').click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
        await page.reload();
        await expect(page.locator('#mouseResult')).toHaveText('', { exact: true });
    });

    it('delayed element appears', async () => {
        const delayed = page.locator('#delayedElement');
        await expect(delayed).toBeHidden();
        await page.locator('#showDelayed').click();
        await delayed.waitFor({ state: 'visible', timeout: 3000 });
        await expect(delayed).toBeVisible();
    });

    it('keyboard press', async () => {
        await page.locator('#textInput').press('Tab');
        await expect(page.locator('#lastKey')).toHaveText('Tab');
    });
});

describe('nth/first/last verify', () => {
    beforeEach(async () => {
        const dirname = await browser.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
    });

    it('first() returns the first card heading', async () => {
        const first = page.locator('.card h2').first();
        await expect(first).toHaveText('Mouse / Pointer');
    });

    it('last() returns the last card heading', async () => {
        const last = page.locator('.card h2').last();
        await expect(last).toHaveText('Hidden / Dynamic Element');
    });

    it('nth(0) is same as first()', async () => {
        const byNth = page.locator('.card h2').nth(0);
        await expect(byNth).toHaveText('Mouse / Pointer');
    });

    it('nth(1) returns the second card heading', async () => {
        const second = page.locator('.card h2').nth(1);
        await expect(second).toHaveText('Keyboard & Inputs');
    });

    it('nth(2) returns the third card heading', async () => {
        const third = page.locator('.card h2').nth(2);
        await expect(third).toHaveText('Form Controls');
    });

    it('nth() out of range returns empty (count = 0)', async () => {
        const oob = page.locator('.card h2').nth(999);
        await expect(oob).toHaveCount(0);
    });

    it('count() matches total cards', async () => {
        const all = page.locator('.card h2');
        await expect(all).toHaveCount(10);
    });
});
