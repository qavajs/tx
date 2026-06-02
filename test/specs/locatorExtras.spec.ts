import { test, expect } from '@qavajs/tx';

// Tests for locator.boundingBox(), locator.blur(), and expect().toHaveCSS().
// Uses https://apptesting.pl/pages/forms.html which has stable, well-known
// form elements with predictable properties.

test.describe('locator.boundingBox', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    test('returns an object with numeric x, y, width, height for a visible element', async ({ page }) => {
        const box = await page.locator('#text-input').boundingBox();
        expect(box).not.toBeNull();
        expect(typeof box!.x).toBe('number');
        expect(typeof box!.y).toBe('number');
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
    });

    test('width and height are positive for a rendered button', async ({ page }) => {
        const box = await page.getByRole('button').first().boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
    });

    test('y coordinate increases for elements lower on the page', async ({ page }) => {
        const boxes = await Promise.all([
            page.locator('#text-input').boundingBox(),
            page.locator('#disabled-input').boundingBox(),
        ]);
        expect(boxes[0]).not.toBeNull();
        expect(boxes[1]).not.toBeNull();
        // Both inputs are visible; the disabled one is below the text input
        expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
    });
});

test.describe('locator.blur', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    test('removes focus from an element after focus()', async ({ page }) => {
        const input = page.locator('#text-input');

        await input.focus();
        const focusedBefore = await input.evaluate((el) => el === document.activeElement);
        expect(focusedBefore).toBe(true);

        await input.blur();
        const focusedAfter = await input.evaluate((el) => el === document.activeElement);
        expect(focusedAfter).toBe(false);
    });

    test('does not throw when called on an already-unfocused element', async ({ page }) => {
        // No prior focus — blur should silently succeed
        await page.locator('#text-input').blur();
        expect(true).toBe(true);
    });
});

test.describe('expect().toHaveCSS', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('https://apptesting.pl/pages/forms.html');
    });

    test('matches an explicitly set background-color', async ({ page }) => {
        const input = page.locator('#text-input');
        await input.evaluate((el) => {
            (el as HTMLElement).style.backgroundColor = 'rgb(255, 0, 0)';
        });
        await expect(input).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    });

    test('negation: fails when CSS value does not match', async ({ page }) => {
        const input = page.locator('#text-input');
        await input.evaluate((el) => {
            (el as HTMLElement).style.backgroundColor = 'rgb(0, 128, 0)';
        });
        await expect(input).not.toHaveCSS('background-color', 'rgb(255, 0, 0)');
    });

    test('matches with a RegExp pattern', async ({ page }) => {
        const input = page.locator('#text-input');
        await input.evaluate((el) => {
            (el as HTMLElement).style.color = 'rgb(0, 0, 255)';
        });
        await expect(input).toHaveCSS('color', /rgb\(\d+, \d+, \d+\)/);
    });

    test('matches display property of a visible element', async ({ page }) => {
        // <input> elements have display: inline-block by default in browsers
        const input = page.locator('#text-input');
        await expect(input).toHaveCSS('display', /block/);
    });

    test('soft variant: does not throw on pass', async ({ page }) => {
        const input = page.locator('#text-input');
        await input.evaluate((el) => {
            (el as HTMLElement).style.opacity = '1';
        });
        await expect.soft(input).toHaveCSS('opacity', '1');
        expect(true).toBe(true);
    });
});
