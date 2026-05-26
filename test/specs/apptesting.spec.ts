import { test } from '@qavajs/tx';
import { fail } from './testData';

test.describe('apptesting forms', { tag: ['@smoke'] }, () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    test('simple input', { tag: ['@tag1'] }, async ({ page, expect }) => {
        const input = page.locator('#text-input');
        await input.fill('test input');
        await expect(input).toHaveValue('test input');
    });

    test('slider input', { tag: ['@tag2'] }, async ({ page, expect }) => {
        const input = page.locator('#range-slider');
        await input.fill('42');
        await expect(input).toHaveValue('42');
    });

    test('color picker', async ({ page, expect }) => {
        const input = page.locator('#color-picker');
        await input.fill('#ff0000');
        await expect(input).toHaveValue('#ff0000');
    });

    test('disabled input', async ({ page, expect }) => {
        const input = page.locator('#disabled-input');
        await expect(input).toBeDisabled();
    });
});

test.describe('apptesting interactions', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/interactions.html');
    });

    test('press and hold', async ({ page, expect }) => {
        const button = page.locator('#longpress-btn');
        await button.scrollIntoViewIfNeeded();
        const { centerX, centerY } = await button.evaluate((element: HTMLElement) => {
            const rect = element.getBoundingClientRect();

            return {
                // viewport-relative coordinates
                x: rect.x,
                y: rect.y,
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,

                // viewport center (useful for clicking)
                centerX: rect.left + rect.width / 2,
                centerY: rect.top + rect.height / 2,

                // visible viewport info
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },

                // whether currently visible in viewport
                inViewport:
                    rect.bottom > 0 &&
                    rect.right > 0 &&
                    rect.top < window.innerHeight &&
                    rect.left < window.innerWidth
            };
        });
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.waitForTimeout(3000);
        await page.mouse.up();
        await expect(page.locator('#longpress-output')).toHaveText('Long press detected! Held for 2 seconds.');
    });
});

test.describe('apptesting widgets', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/widgets.html');
    });

    test('accordion', async ({ page, expect }) => {
        const accordionContent = page.locator('.active .accordion-content');

        const firstHeader = page.locator('#accordion-header-1');
        await firstHeader.click();
        await expect(accordionContent).toBeVisible();
        await expect(accordionContent).toHaveText('Content for section 1.');
        await firstHeader.click();
        const secondHeader = page.locator('#accordion-header-2');
        await secondHeader.click();
        await expect(accordionContent).toBeVisible();
        await expect(accordionContent).toHaveText('Content for section 2.');
    });

    test('tabs', async ({ page, expect }) => {
        const tabContent = page.locator('.tab-content.active');

        const tab2 = page.locator('#tab-btn-2');
        await tab2.click();
        await expect(tabContent).toBeVisible();
        await expect(tabContent).toContainText('Content for tab 2.');

        const tab1 = page.locator('#tab-btn-1');
        await tab1.click();
        await expect(tabContent).toBeVisible();
        await expect(tabContent).toContainText('Content for tab 1.');
    });

    test('modal', async ({ page, expect }) => {
        const openModal = page.locator('#modal-trigger');
        await openModal.click();
        await expect(page.locator('.modal')).toBeVisible();
        await expect(page.locator('.modal .modal-body')).toHaveText('This is modal content.');
    });

    test('tooltip', async ({ page, expect }) => {
        const tooltip = page.locator('#tooltip-btn');
        await tooltip.scrollIntoViewIfNeeded();
        await tooltip.hover();
        await expect(page.locator('.tooltip')).toBeVisible();
        await expect(page.locator('.tooltip')).toHaveText('Tooltip text!');
    });

    test('autocomplete', async ({ page, expect }) => {
        const input = page.locator('#autocomplete');
        await input.fill('java');
        const suggestions = page.locator('.autocomplete-item');
        await expect(suggestions).toHaveCount(2);
        await expect(suggestions.nth(0)).toHaveText('JavaScript');
        await expect(suggestions.nth(1)).toHaveText('Java');
        await suggestions.nth(0).click();
        await expect(input).toHaveValue('JavaScript');
    });
});

test.describe('apptesting windows', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/windows.html');
    });

    test('new tab', async ({ browser, page, expect }) => {
        const newTab = page.locator('#new-tab-link');
        await newTab.click();
        await expect(page.locator('textarea[aria-label]')).toBeVisible();
        browser.switchTab(t => t.url.includes('windows.html'));
        expect(page.locator('#new-tab-link')).toBeVisible();
    });

    test('popup window', async ({ browser, page, expect }) => {
        const newWindow = page.locator('#new-window-btn');
        await newWindow.click();
        const popupElement = page.locator('h1');
        await expect(popupElement).toBeVisible();
        await expect(popupElement).toHaveText('Popup Window');
        const popupButton = page.locator('button');
        await popupButton.click();
        browser.switchTab(t => t.url.includes('windows.html'));
        expect(page.locator('#new-tab-link')).toBeVisible();
    });

    test('iframe', async ({ page }) => {
        const iframe = page.frameLocator('[title="Test Iframe"]');
        await iframe.locator('#iframe-btn').click();
        await iframe.locator('#iframe-input').fill('iframe input');
    });

    test('nested iframe', async ({ page }) => {
        const outerIframe = page.frameLocator('[title="Nested Iframe"]');
        const iframe = outerIframe.frameLocator('#inner-iframe');
        await iframe.locator('#iframe-btn').click();
        await iframe.locator('#iframe-input').fill('iframe input');
    });
});

test.describe('apptesting alerts', { tag: ['@alerts'] }, () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/alerts.html');
    });

    test('alert', async ({ page, expect }) => {
        const button = page.locator('#alert-btn');
        const result = page.locator('#alert-output');
        const dialogPromise = page.waitForEvent('dialog');
        await button.click();
        const dialog = await dialogPromise;
        expect(dialog.type()).toBe('alert');
        dialog.accept();
        await expect(result).toHaveText('Alert was shown and dismissed.');
    });

    for (const testCase of [{action: 'accept', button: 'OK'}, { action: 'dismiss', button: 'Cancel' }]) {
        test(`confirm: ${testCase.action}`, async ({ page, expect }) => {
            const button = page.locator('#confirm-btn');
            const result = page.locator('#confirm-output');
            const dialogPromise = page.waitForEvent('dialog');
            await button.click();
            const dialog = await dialogPromise;
            expect(dialog.type()).toBe('confirm');
            dialog[testCase.action]();
            await expect(result).toHaveText('User clicked: Cancel');
        });
    }

    test('prompt', async ({ page, expect }) => {
        const button = page.locator('#prompt-btn');
        const result = page.locator('#prompt-output');
        page.on('dialog', dialog => dialog.accept('test value'))
        await button.click();
        await expect(result).toHaveText('User entered: test value');
    });

});