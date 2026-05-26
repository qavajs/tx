import { test } from '@qavajs/tx';

test.describe('Playground', () => {

    test.beforeEach(async ({ page, node }) => {
        const dirname = await node.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
    });

    test('click', async ({ page, expect }) => {
        const clickElement = page.locator('#clickBtn');
        await clickElement.click();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Clicked');
    });

    test('double click', async ({ page, expect }) => {
        const clickElement = page.locator('#dblClickBtn');
        await clickElement.dblclick();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Double clicked');
    });

    test('right click', async ({ page, expect }) => {
        const clickElement = page.locator('#rightClickBtn');
        await clickElement.rightClick();
        const actionLabel = page.locator('#mouseResult');
        await expect(actionLabel).toHaveText('Right clicked');
    });

    test('hover', async ({ page, expect }) => {
        const clickElement = page.locator('#hoverTarget');
        await clickElement.hover();
        await expect(clickElement).toHaveAttribute('data-hammerhead-hovered');
    });

    test('type to input', async ({ page, expect }) => {
        const typeElement = page.locator('#textInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    test('type to textarea', async ({ page, expect }) => {
        const typeElement = page.locator('#textareaInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    test('type to password', async ({ page, expect }) => {
        const typeElement = page.locator('#passwordInput');
        await typeElement.type('type smth!');
        await expect(typeElement).toHaveValue('type smth!');
    });

    test('check checkbox', async ({ page, expect }) => {
        const checkbox = page.locator('#checkbox');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    });

    test('check radio', async ({ page, expect }) => {
        const radio = page.locator('[name=role][value=user]');
        await radio.check();
        await expect(radio).toBeChecked();
    });

    test('select option', async ({ page, expect }) => {
        const select = page.locator('#countrySelect');
        await select.selectOption('Latvia');
        await expect(select).toHaveValue('Latvia');
    });

    test('select date', async ({ page, expect }) => {
        const select = page.locator('#datePicker');
        await select.fill('2026-05-04');
        await expect(select).toHaveValue('2026-05-04');
    });

    test('select file', async ({ page, expect }) => {
        const select = page.locator('#fileUpload');
        await select.setInputFiles('test/specs/playground.spec.ts');
        await expect(select).toHaveValue('test/specs/playground.spec.ts');
    });

    test('drag and drop', async ({ page, expect }) => {
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

    test('scroll into view', async ({ page, expect }) => {
        const scrollTarget = page.locator('#scrollTarget');
        await scrollTarget.scrollIntoViewIfNeeded();
        await expect(scrollTarget).toBeVisible();
    });

    test('alert dialog', async ({ page, expect }) => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept();
        });
        await page.getByRole('button', { name: 'Alert' }).click();
        expect(message).toBe('Alert dialog');
    });

    test('confirm dialog', async ({ page, expect }) => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept();
        });
        await page.getByRole('button', { name: 'Confirm' }).click();
        expect(message).toBe('Confirm dialog?');
    });

    test('prompt dialog', async ({ page, expect }) => {
        let message = '';
        page.once('dialog', dialog => {
            message = dialog.message();
            dialog.accept('my answer');
        });
        await page.getByRole('button', { name: 'Prompt' }).click();
        expect(message).toBe('Enter text');
    });

    test('toggle visibility', async ({ page, expect }) => {
        const target = page.locator('#visibilityTarget');
        await expect(target).toBeVisible();
        await page.locator('#toggleVisibility').click();
        await expect(target).toBeHidden();
        await page.locator('#toggleVisibility').click();
        await expect(target).toBeVisible();
    });

    test('toggle enabled', async ({ page, expect }) => {
        const btn = page.locator('#disabledBtn');
        await expect(btn).toBeDisabled();
        await page.locator('#toggleEnabled').click();
        await expect(btn).toBeEnabled();
    });

    test('iframe button', async ({ page, expect }) => {
        const frame = page.frameLocator('iframe');
        await frame.locator('#frameBtn').click();
    });

    test('link navigation', async ({ page, expect }) => {
        await page.locator('#linkNav').click();
        await expect(page.locator('#bottom')).toBeVisible();
    });

    test('page reload', async ({ page, expect }) => {
        await page.locator('#clickBtn').click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
        await page.reload();
        await expect(page.locator('#mouseResult')).toHaveText('', { exact: true });
    });

    test('delayed element appears', async ({ page, expect }) => {
        const delayed = page.locator('#delayedElement');
        await expect(delayed).toBeHidden();
        await page.locator('#showDelayed').click();
        await delayed.waitFor({ state: 'visible', timeout: 3000 });
        await expect(delayed).toBeVisible();
    });

    test('keyboard press', async ({ page, expect }) => {
        await page.locator('#textInput').press('Tab');
        await expect(page.locator('#lastKey')).toHaveText('Tab');
    });
});

test.describe('nth/first/last verify', () => {
    test.beforeEach(async ({ page, node }) => {
        const dirname = await node.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
    });

    test('first() returns the first card heading', async ({ page, expect }) => {
        const first = page.locator('.card h2').first();
        await expect(first).toHaveText('Mouse / Pointer');
    });

    test('last() returns the last card heading', async ({ page, expect }) => {
        const last = page.locator('.card h2').last();
        await expect(last).toHaveText('Hidden / Dynamic Element');
    });

    test('nth(0) is same as first()', async ({ page, expect }) => {
        const byNth = page.locator('.card h2').nth(0);
        await expect(byNth).toHaveText('Mouse / Pointer');
    });

    test('nth(1) returns the second card heading', async ({ page, expect }) => {
        const second = page.locator('.card h2').nth(1);
        await expect(second).toHaveText('Keyboard & Inputs');
    });

    test('nth(2) returns the third card heading', async ({ page, expect }) => {
        const third = page.locator('.card h2').nth(2);
        await expect(third).toHaveText('Form Controls');
    });

    test('nth() out of range returns empty (count = 0)', async ({ page, expect }) => {
        const oob = page.locator('.card h2').nth(999);
        await expect(oob).toHaveCount(0);
    });

    test('count() matches total cards', async ({ page, expect }) => {
        const all = page.locator('.card h2');
        await expect(all).toHaveCount(10);
    });
});
