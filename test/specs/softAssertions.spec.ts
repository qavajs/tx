import { test, expect } from '@qavajs/tx';

// Tests for expect.soft() — non-fatal assertion variant.
// Happy-path tests verify that passing soft assertions don't interfere with
// normal test flow. The failure-accumulation path (soft errors aggregated into
// a single throw at the end of the test body) is exercised by the test runner
// unit tests and the implementation in assertions.ts / testRunner.ts.

test.describe('expect.soft — value matchers', () => {
    test('passes when value assertion holds', () => {
        expect.soft('hello').toBe('hello');
        expect.soft(42).toBeGreaterThan(0);
        expect.soft([1, 2, 3]).toContain(2);
        expect.soft({ a: 1 }).toEqual({ a: 1 });
        // reaching this hard assertion confirms no premature throw occurred
        expect(true).toBe(true);
    });

    test('negation: passes when value does not match', () => {
        expect.soft('hello').not.toBe('world');
        expect.soft(0).not.toBeGreaterThan(1);
        expect.soft('text').not.toBeNull();
        expect(true).toBe(true);
    });

    test('toBeTruthy / toBeFalsy', () => {
        expect.soft(1).toBeTruthy();
        expect.soft(0).toBeFalsy();
        expect.soft('').not.toBeTruthy();
        expect(true).toBe(true);
    });

    test('toBeNull / toBeUndefined', () => {
        expect.soft(null).toBeNull();
        expect.soft(undefined).toBeUndefined();
        expect.soft('value').not.toBeNull();
        expect(true).toBe(true);
    });

    test('toMatch with RegExp', () => {
        expect.soft('hello world').toMatch(/world/);
        expect.soft('hello world').not.toMatch(/xyz/);
        expect(true).toBe(true);
    });

    test('toLessThan', () => {
        expect.soft(3).toBeLessThan(10);
        expect.soft(10).not.toBeLessThan(3);
        expect(true).toBe(true);
    });

    test('toContain with string', () => {
        expect.soft('foobar').toContain('bar');
        expect.soft('foobar').not.toContain('baz');
        expect(true).toBe(true);
    });
});

test.describe('expect.soft — locator matchers', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/forms.html');
    });

    test('passes for a visible element', async ({ page }) => {
        await expect.soft(page.locator('#text-input')).toBeVisible();
        expect(true).toBe(true);
    });

    test('negation: passes for an absent element', async ({ page }) => {
        await expect.soft(page.locator('#does-not-exist-xyz')).not.toBeVisible();
        expect(true).toBe(true);
    });

    test('toBeEnabled / toBeDisabled', async ({ page }) => {
        await expect.soft(page.locator('#text-input')).toBeEnabled();
        await expect.soft(page.locator('#disabled-input')).toBeDisabled();
        expect(true).toBe(true);
    });

    test('toHaveValue after fill', async ({ page }) => {
        await page.locator('#text-input').fill('soft-test');
        await expect.soft(page.locator('#text-input')).toHaveValue('soft-test');
        expect(true).toBe(true);
    });

    test('multiple soft locator assertions run sequentially', async ({ page }) => {
        const input     = page.locator('#text-input');
        const disabled  = page.locator('#disabled-input');

        await expect.soft(input).toBeVisible();
        await expect.soft(input).toBeEnabled();
        await expect.soft(disabled).toBeVisible();
        await expect.soft(disabled).toBeDisabled();

        expect(true).toBe(true);
    });
});
