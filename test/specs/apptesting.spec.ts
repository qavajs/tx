describe('apptesting forms', () => {
    beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    it('simple input', async ({ page, expect }) => {
        const input = page.locator('#text-input');
        await input.fill('test input');
        await expect(input).toHaveValue('test input');
    });

    test('slider input', async ({ page, expect }) => {
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

describe('apptesting interactions', () => {
    beforeEach(async ({ page }) => {
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

describe('apptesting widgets', () => {
    beforeEach(async ({ page }) => {
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