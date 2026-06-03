import { test, expect } from '@qavajs/tx';

const URL = 'http://localhost:3000/aria.html';

test.describe('page.ariaSnapshot', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(URL);
    });

    test('returns a non-empty string', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(typeof yaml).toBe('string');
        expect(yaml.length).toBeGreaterThan(0);
    });

    test('includes the h1 heading with level', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- heading "ARIA Test Page" [level=1]');
    });

    test('includes the h2 heading with level', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- heading "Form Section" [level=2]');
    });

    test('includes navigation with accessible name', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- navigation "Site Navigation":');
    });

    test('includes links inside navigation', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- link "Home"');
        expect(yaml).toContain('- link "About"');
    });

    test('includes disabled button with [disabled]', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- button "Cancel" [disabled]');
    });

    test('excludes elements hidden with display:none', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).not.toContain('Hidden Button');
    });

    test('excludes aria-hidden sections', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).not.toContain('Should Not Appear');
    });

    test('flattens role="none" children into parent scope', async ({ page }) => {
        const yaml = await page.ariaSnapshot();
        expect(yaml).toContain('- button "Floating Button"');
    });
});

test.describe('locator.ariaSnapshot', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(URL);
    });

    test('returns subtree for the navigation locator', async ({ page }) => {
        const yaml = await page.locator('#site-nav').ariaSnapshot();
        expect(yaml).toContain('- link "Home"');
        expect(yaml).toContain('- link "About"');
        expect(yaml).not.toContain('Submit');
    });

    test('returns form elements for the form locator', async ({ page }) => {
        const yaml = await page.locator('#test-form').ariaSnapshot();
        expect(yaml).toContain('- textbox "Full Name"');
        expect(yaml).toContain('- checkbox "Accept Terms"');
        expect(yaml).toContain('- button "Submit"');
        expect(yaml).toContain('- button "Cancel" [disabled]');
    });

    test('reflects a filled input value', async ({ page }) => {
        await page.locator('#name-input').fill('Alice');
        const yaml = await page.locator('#test-form').ariaSnapshot();
        expect(yaml).toContain('"Alice"');
    });

    test('reflects checked checkbox state', async ({ page }) => {
        await page.locator('#accept').check();
        const yaml = await page.locator('#test-form').ariaSnapshot();
        expect(yaml).toContain('[checked]');
    });

    test('reflects unchecked checkbox state', async ({ page }) => {
        const yaml = await page.locator('#test-form').ariaSnapshot();
        expect(yaml).toContain('[unchecked]');
    });

    test('returns list structure with nested links', async ({ page }) => {
        const yaml = await page.locator('#items-list').ariaSnapshot();
        expect(yaml).toContain('- listitem:');
        expect(yaml).toContain('- link "One"');
        expect(yaml).toContain('- link "Two"');
    });
});
