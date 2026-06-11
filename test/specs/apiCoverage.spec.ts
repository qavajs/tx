import { test, expect } from '@qavajs/tx';

const API_BASE = 'http://localhost:3000';

async function loadTestPage({ page }: any) {
    await page.goto('http://localhost:3000/testPage.html');
}

// ── getBy* locator factories ───────────────────────────────────────────────────

test.describe('getByText', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('exact string clicks correct button', async ({ page }) => {
        await page.getByText('Click', { exact: true }).click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
    });

    test('regex finds element', async ({ page }) => {
        await expect(page.getByText(/double click/i)).toBeVisible();
    });
});

test.describe('getByLabel', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('finds wrapped checkbox input', async ({ page }) => {
        const checkbox = page.getByLabel('Checkbox');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    });
});

test.describe('getByPlaceholder', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('string finds input', async ({ page }) => {
        const input = page.getByPlaceholder('Type here');
        await input.fill('placeholder test');
        await expect(input).toHaveValue('placeholder test');
    });

    test('regex finds textarea', async ({ page }) => {
        const textarea = page.getByPlaceholder(/textarea/i);
        await textarea.fill('regex placeholder');
        await expect(textarea).toHaveValue('regex placeholder');
    });
});

test.describe('getByAltText', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('string finds image', async ({ page }) => {
        await expect(page.getByAltText('page logo')).toBeVisible();
    });

    test('regex finds image', async ({ page }) => {
        await expect(page.getByAltText(/logo/i)).toBeVisible();
    });
});

test.describe('getByTitle', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('string finds link', async ({ page }) => {
        await expect(page.getByTitle('bottom link')).toBeVisible();
    });

    test('regex finds link', async ({ page }) => {
        await expect(page.getByTitle(/bottom/i)).toBeVisible();
    });
});

// ── Locator chaining ───────────────────────────────────────────────────────────

test.describe('Locator chaining', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('locator().locator() chains child selector', async ({ page }) => {
        const mouseCard = page.locator('.card').filter({ hasText: 'Mouse / Pointer' });
        await mouseCard.locator('#clickBtn').click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
    });

    test('filter by hasText narrows results', async ({ page }) => {
        const cards = page.locator('.card').filter({ hasText: 'Drag' });
        await expect(cards).toHaveCount(1);
    });

    test('filter by hasNotText excludes matching cards', async ({ page }) => {
        const allCards = page.locator('.card');
        const filtered = page.locator('.card').filter({ hasNotText: 'Mouse' });
        const total = await allCards.count();
        const reduced = await filtered.count();
        expect(reduced).toBeLessThan(total);
    });

    test('filter by visible returns only visible elements', async ({ page }) => {
        const visibleButtons = page.locator('button').filter({ visible: true });
        const count = await visibleButtons.count();
        expect(count).toBeGreaterThan(0);
    });
});

// ── Locator query methods ──────────────────────────────────────────────────────

test.describe('Locator query methods', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('isHidden returns true for hidden element', async ({ page }) => {
        expect(await page.locator('#delayedElement').isHidden()).toBe(true);
    });

    test('isEnabled returns true for enabled input', async ({ page }) => {
        expect(await page.locator('#textInput').isEnabled()).toBe(true);
    });

    test('isDisabled returns true for disabled button', async ({ page }) => {
        expect(await page.locator('#disabledBtn').isDisabled()).toBe(true);
    });

    test('isChecked returns false then true after check', async ({ page }) => {
        const checkbox = page.locator('#checkbox');
        expect(await checkbox.isChecked()).toBe(false);
        await checkbox.check();
        expect(await checkbox.isChecked()).toBe(true);
    });

    test('isEditable returns true for enabled input', async ({ page }) => {
        expect(await page.locator('#textInput').isEditable()).toBe(true);
    });

    test('innerText returns button label', async ({ page }) => {
        expect(await page.locator('#clickBtn').innerText()).toBe('Click');
    });

    test('textContent returns element text', async ({ page }) => {
        expect(await page.locator('#clickBtn').textContent()).toBe('Click');
    });

    test('inputValue returns current value', async ({ page }) => {
        await page.locator('#textInput').fill('query value');
        expect(await page.locator('#textInput').inputValue()).toBe('query value');
    });

    test('getAttribute returns attribute value', async ({ page }) => {
        expect(await page.locator('#textInput').getAttribute('id')).toBe('textInput');
    });
});

// ── Locator actions ────────────────────────────────────────────────────────────

test.describe('Locator actions', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('clear empties a filled input', async ({ page }) => {
        const input = page.locator('#textInput');
        await input.fill('some text');
        await input.clear();
        await expect(input).toBeEmpty();
    });

    test('uncheck unchecks a checked checkbox', async ({ page }) => {
        const checkbox = page.locator('#checkbox');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await checkbox.uncheck();
        await expect(checkbox).not.toBeChecked();
    });
});

// ── Expect matchers – locator ──────────────────────────────────────────────────

test.describe('Expect matchers – locator', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('toBeChecked passes for checked checkbox', async ({ page }) => {
        const checkbox = page.locator('#checkbox');
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    });

    test('toBeEditable passes for enabled input', async ({ page }) => {
        await expect(page.locator('#textInput')).toBeEditable();
    });

    test('toBeEmpty passes for empty input', async ({ page }) => {
        await expect(page.locator('#textInput')).toBeEmpty();
    });

    test('toHaveClass passes when element has class', async ({ page }) => {
        await expect(page.locator('.card').first()).toHaveClass('card');
    });

    test('not.toBeChecked passes for unchecked checkbox', async ({ page }) => {
        await expect(page.locator('#checkbox')).not.toBeChecked();
    });

    test('not.toBeEmpty passes for filled input', async ({ page }) => {
        await page.locator('#textInput').fill('hello');
        await expect(page.locator('#textInput')).not.toBeEmpty();
    });

    test('not.toContainText passes when text is absent', async ({ page }) => {
        await expect(page.locator('#mouseResult')).not.toContainText('Clicked');
    });

    test('not.toHaveCount passes when count differs', async ({ page }) => {
        await expect(page.locator('.card')).not.toHaveCount(0);
    });
});

// ── Expect matchers – page ─────────────────────────────────────────────────────

test.describe('Expect matchers – page', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('toHaveURL matches regex', async ({ page }) => {
        await expect(page).toHaveURL(/testPage\.html/);
    });

    test('toHaveTitle matches page title', async ({ page }) => {
        await expect(page).toHaveTitle('UI Automation Verification Playground');
    });

    test('not.toHaveURL passes when URL does not match', async ({ page }) => {
        await expect(page).not.toHaveURL(/google\.com/);
    });
});

// ── Expect matchers – plain values ────────────────────────────────────────────

test.describe('Expect matchers – plain values', () => {
    test('toBeTruthy passes for truthy value', () => {
        expect('hello').toBeTruthy();
    });

    test('toBeFalsy passes for empty string', () => {
        expect('').toBeFalsy();
    });

    test('toBeNull passes for null', () => {
        const n: number | null = null;
        expect(n).toBeNull();
    });

    test('toBeUndefined passes for undefined', () => {
        const u: number | undefined = undefined;
        expect(u).toBeUndefined();
    });

    test('toBeLessThan passes when value is less', () => {
        expect(3).toBeLessThan(10);
    });

    test('toMatch passes when regex matches string', () => {
        expect('hello world').toMatch(/world/);
    });

    test('not.toBe passes when values differ', () => {
        expect('a').not.toBe('b');
    });

    test('not.toBeTruthy passes for zero', () => {
        expect(0).not.toBeTruthy();
    });

    test('not.toBeFalsy passes for truthy value', () => {
        expect(1).not.toBeFalsy();
    });

    test('not.toBeNull passes for non-null', () => {
        expect('value').not.toBeNull();
    });

    test('not.toContain passes when item absent from array', () => {
        expect([1, 2, 3]).not.toContain(4);
    });

    test('not.toContain passes when substring absent from string', () => {
        expect('hello').not.toContain('xyz');
    });
});

// ── Page APIs ──────────────────────────────────────────────────────────────────

test.describe('Page APIs', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('title returns page title', async ({ page }) => {
        const title = await page.title();
        expect(title).toBe('UI Automation Verification Playground');
    });

    test('waitForSelector resolves when element is visible', async ({ page }) => {
        const loc = await page.waitForSelector('#clickBtn');
        await expect(loc).toBeVisible();
    });

    test('setViewportSize does not break page', async ({ page }) => {
        page.setViewportSize({ width: 1280, height: 720 });
        await expect(page.locator('#clickBtn')).toBeVisible();
    });

    test('addInitScript string form injects on navigation', async ({ page, node }) => {
        const handle = page.addInitScript('window.__initFlag = "injected";');
        const dirname = await node.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
        const val = await page.evaluate(() => (window as any).__initFlag);
        expect(val).toBe('injected');
        handle.dispose();
    });

    test('addInitScript function form injects on navigation', async ({ page, node }) => {
        const handle = page.addInitScript(() => { (window as any).__initFn = 99; });
        const dirname = await node.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
        const val = await page.evaluate(() => (window as any).__initFn);
        expect(val).toBe(99);
        handle.dispose();
    });

    test('screenshot returns a non-empty data URL', async ({ page }) => {
        const shot = await page.screenshot();
        expect(typeof shot).toBe('string');
        expect(shot.length).toBeGreaterThan(0);
    });

    test('page.off removes event listener', async ({ page, node }) => {
        let count = 0;
        const handler = () => { count++; };
        page.on('load', handler);
        page.off('load', handler);
        const dirname = await node.task('dirname');
        await page.goto(`file://${dirname}/app/testPage.html`);
        expect(count).toBe(0);
    });

    test('resetSession navigates to blank page', async ({ page }) => {
        await page.resetSession();
        await expect(page.locator('#clickBtn')).toHaveCount(0);
    });
});

// ── Route APIs ─────────────────────────────────────────────────────────────────

test.describe('Route APIs', () => {
    test('route.continue passes request through unmodified', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        await page.route(/\/webpark\/calculate-cost/, async route => {
            await route.continue();
        });
        await page.locator('#calculateCost').click();
        await page.waitForTimeout(4000);
        const result = await page.locator('#result').textContent();
        expect(result).not.toContain('An error occurred while processing your request');
    });

    test('unroute removes handler so real request proceeds', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        const pattern = /\/webpark\/calculate-cost/;
        const abortHandler = async (route: any) => { await route.abort(); };
        await page.route(pattern, abortHandler);
        await page.unroute(pattern, abortHandler);
        await page.locator('#calculateCost').click();
        await page.waitForTimeout(4000);
        const result = await page.locator('#result').textContent();
        expect(result).not.toContain('An error occurred while processing your request');
    });
});

// ── waitForRequest / waitForResponse ──────────────────────────────────────────

test.describe('waitForRequest and waitForResponse', () => {
    test('waitForRequest resolves on matching request', async ({ page, request }) => {
        const reqPromise = page.waitForRequest(`${API_BASE}/get`, { timeout: 15000 });
        await request.fetch(`${API_BASE}/get`);
        const req = await reqPromise;
        expect(req.url()).toContain('localhost:3000');
    });

    test('waitForResponse resolves with matching response', async ({ page, request }) => {
        const respPromise = page.waitForResponse(`${API_BASE}/get`, { timeout: 15000 });
        await request.fetch(`${API_BASE}/get`);
        const resp = await respPromise;
        expect(resp.status()).toBe(200);
    });
});

// ── Keyboard API ───────────────────────────────────────────────────────────────

test.describe('Keyboard API', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('keyboard.type types into focused input', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.type('typed text');
        await expect(page.locator('#textInput')).toHaveValue('typed text');
    });

    test('keyboard.insertText inserts into focused input', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.insertText('inserted');
        await expect(page.locator('#textInput')).toHaveValue('inserted');
    });

    test('keyboard.down dispatches keydown event', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.down('Enter');
        await expect(page.locator('#lastKey')).toHaveText('Enter');
    });

    test('keyboard.up releases key after down', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.down('Shift');
        await page.keyboard.up('Shift');
        await expect(page.locator('#textInput')).toBeVisible();
    });
});

// ── Mouse API ──────────────────────────────────────────────────────────────────

test.describe('Mouse API', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('mouse.wheel dispatches wheel event', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__wheelFired = false;
            document.getElementById('scrollBox')!.addEventListener('wheel', () => {
                (window as any).__wheelFired = true;
            });
        });
        const scrollBox = page.locator('#scrollBox');
        await scrollBox.scrollIntoViewIfNeeded();
        const rect = await scrollBox.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        });
        await page.mouse.move(rect.left + 10, rect.top + 10);
        await page.mouse.wheel(0, 100);
        const fired = await page.evaluate(() => (window as any).__wheelFired);
        expect(fired).toBe(true);
    });

    test('mouse.dblclick triggers dblclick event', async ({ page }) => {
        const btn = page.locator('#dblClickBtn');
        const rect = await btn.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
        });
        await page.mouse.dblclick(rect.left + rect.width / 2, rect.top + rect.height / 2);
        await expect(page.locator('#mouseResult')).toHaveText('Double clicked');
    });
});

// ── Locator handlers ───────────────────────────────────────────────────────────

test.describe('Locator handlers', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('addLocatorHandler fires when locator is visible', async ({ page }) => {
        let handlerCalled = false;
        const alwaysVisible = page.locator('#clickBtn');

        page.addLocatorHandler(alwaysVisible, async () => {
            handlerCalled = true;
        }, { noWaitAfter: true, times: 1 });

        await page.locator('#dblClickBtn').click();

        expect(handlerCalled).toBe(true);
    });

    test('removeLocatorHandler prevents handler from firing', async ({ page }) => {
        let callCount = 0;
        const alwaysVisible = page.locator('#clickBtn');

        page.addLocatorHandler(alwaysVisible, async () => {
            callCount++;
        }, { noWaitAfter: true });

        page.removeLocatorHandler(alwaysVisible);

        await page.locator('#dblClickBtn').click();

        expect(callCount).toBe(0);
    });
});

// ── Locator chaining – nth / last ──────────────────────────────────────────────

test.describe('Locator chaining – nth / last', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('nth returns element at given index', async ({ page }) => {
        const second = page.locator('.card h2').nth(1);
        await expect(second).toHaveText('Keyboard & Inputs');
    });

    test('last returns final matching element', async ({ page }) => {
        const last = page.locator('.card h2').last();
        await expect(last).toHaveText('Hidden / Dynamic Element');
    });
});

// ── Locator actions – extended ─────────────────────────────────────────────────

test.describe('Locator actions – extended', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('dblclick triggers double-click event', async ({ page }) => {
        await page.locator('#dblClickBtn').dblclick();
        await expect(page.locator('#mouseResult')).toHaveText('Double clicked');
    });

    test('rightClick triggers contextmenu event', async ({ page }) => {
        await page.locator('#rightClickBtn').rightClick();
        await expect(page.locator('#mouseResult')).toHaveText('Right clicked');
    });

    test('type enters text character by character', async ({ page }) => {
        await page.locator('#textInput').type('hello');
        await expect(page.locator('#textInput')).toHaveValue('hello');
    });

    test('press fires key event on focused element', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.locator('#textInput').press('Tab');
        await expect(page.locator('#lastKey')).toHaveText('Tab');
    });

    test('selectOption sets dropdown value', async ({ page }) => {
        await page.locator('#countrySelect').selectOption('Latvia');
        await expect(page.locator('#countrySelect')).toHaveValue('Latvia');
    });

    test('hover triggers mouseenter on element', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__hovered = false;
            document.getElementById('hoverTarget')!.addEventListener('mouseenter', () => {
                (window as any).__hovered = true;
            });
        });
        await page.locator('#hoverTarget').hover();
        const hovered = await page.evaluate(() => (window as any).__hovered);
        expect(hovered).toBe(true);
    });

    test('setInputFiles sets file input value', async ({ page }) => {
        await page.locator('#fileUpload').setInputFiles('test/specs/api-coverage.spec.ts');
        await expect(page.locator('#fileUpload')).toHaveValue('test/specs/api-coverage.spec.ts');
    });
});

// ── Locator evaluate ───────────────────────────────────────────────────────────

test.describe('Locator evaluate', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('evaluate reads element property via function', async ({ page }) => {
        const tagName = await page.locator('#clickBtn').evaluate((el: Element) => el.tagName.toLowerCase());
        expect(tagName).toBe('button');
    });
});

// ── Locator waitFor ────────────────────────────────────────────────────────────

test.describe('Locator waitFor', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('waitFor resolves when element becomes visible', async ({ page }) => {
        const delayed = page.locator('#delayedElement');
        await page.locator('#showDelayed').click();
        await delayed.waitFor({ state: 'visible', timeout: 4000 });
        await expect(delayed).toBeVisible();
    });
});

// ── Locator isVisible ──────────────────────────────────────────────────────────

test.describe('Locator isVisible', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('isVisible returns true for a visible element', async ({ page }) => {
        expect(await page.locator('#clickBtn').isVisible()).toBe(true);
    });

    test('isVisible returns false for a hidden element', async ({ page }) => {
        expect(await page.locator('#delayedElement').isVisible()).toBe(false);
    });
});

// ── Expect matchers – locator extended ────────────────────────────────────────

test.describe('Expect matchers – locator extended', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('toBeHidden passes for hidden element', async ({ page }) => {
        await expect(page.locator('#delayedElement')).toBeHidden();
    });

    test('toBeEnabled passes for enabled input', async ({ page }) => {
        await expect(page.locator('#textInput')).toBeEnabled();
    });

    test('toBeDisabled passes for disabled button', async ({ page }) => {
        await expect(page.locator('#disabledBtn')).toBeDisabled();
    });

    test('toHaveAttribute passes for exact attribute value', async ({ page }) => {
        await expect(page.locator('#textInput')).toHaveAttribute('id', 'textInput');
    });

    test('toHaveAttribute passes for regex attribute value', async ({ page }) => {
        await expect(page.locator('#textInput')).toHaveAttribute('placeholder', /type here/i);
    });
});

// ── Expect matchers – toEqual ─────────────────────────────────────────────────

test.describe('Expect matchers – toEqual', () => {
    test('toEqual passes for deep-equal objects', () => {
        expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
    });
});

// ── Page navigation – extended ─────────────────────────────────────────────────

test.describe('Page navigation – extended', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('reload resets page state', async ({ page }) => {
        await page.locator('#clickBtn').click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
        await page.reload();
        await expect(page.locator('#mouseResult')).toHaveText('');
    });

    test('url returns current page URL', async ({ page }) => {
        expect(page.url()).toContain('testPage.html');
    });

    test('waitForURL resolves when URL matches', async ({ page, node }) => {
        const dirname = await node.task('dirname');
        const urlPromise = page.waitForURL(/testPage\.html/, { timeout: 5000 });
        page.goto(`file://${dirname}/app/testPage.html`);
        await urlPromise;
        expect(page.url()).toContain('testPage.html');
    });
});

// ── Page locator factories – extended ─────────────────────────────────────────

test.describe('Page locator factories – extended', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('getByRole finds button by accessible name', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Click', exact: true })).toBeVisible();
    });

    test('getByTestId finds element by data-testid attribute', async ({ page }) => {
        await expect(page.getByTestId('click-button')).toBeVisible();
    });

    test('frameLocator reaches inside iframe', async ({ page }) => {
        const frame = page.frameLocator('iframe');
        await expect(frame.locator('#frameBtn')).toBeVisible();
    });
});

// ── page.once ─────────────────────────────────────────────────────────────────

test.describe('page.once', () => {
    test('once fires the handler exactly once across two navigations', async ({ page, node }) => {
        const dirname = await node.task('dirname');
        let count = 0;
        page.once('load', () => { count++; });
        page.goto(`file://${dirname}/app/testPage.html`);
        await page.waitForEvent('load');
        page.goto(`file://${dirname}/app/testPage.html`);
        await page.waitForEvent('load');
        expect(count).toBe(1);
    });
});

// ── page.waitForEvent ─────────────────────────────────────────────────────────

test.describe('page.waitForEvent', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('waitForEvent resolves on dialog event', async ({ page }) => {
        const dialogPromise = page.waitForEvent('dialog', { timeout: 5000 });
        page.getByRole('button', { name: 'Alert' }).click();
        const dialog = await dialogPromise;
        expect(dialog.message()).toBe('Alert dialog');
        dialog.accept();
    });

    test('waitForEvent resolves on console message', async ({ page }) => {
        const msgPromise = page.waitForEvent('console', { timeout: 5000 });
        page.locator('#clickBtn').click();
        const msg = await msgPromise;
        expect(msg.text().length).toBeGreaterThan(0);
    });
});

// ── Browser multi-page ─────────────────────────────────────────────────────────

test.describe('Browser multi-page', () => {
    test('newPage opens an additional tab', async ({ browser }) => {
        await browser.newPage();
        const tabs = browser.tabs();
        expect(tabs.length).toBeGreaterThan(1);
    });

    test('switchTab does not throw', async ({ browser }) => {
        await browser.newPage();
        browser.switchTab(t => !t.active);
    });
});

// ── Mouse API – extended ───────────────────────────────────────────────────────

test.describe('Mouse API - extended', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('mouse.click at coordinates triggers click event', async ({ page }) => {
        const btn = page.locator('#clickBtn');
        const rect = await btn.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.mouse.click(rect.x, rect.y);
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
    });

    test('mouse.down and mouse.up dispatch press and release events', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__mouseEvents = [] as string[];
            const btn = document.getElementById('clickBtn')!;
            btn.addEventListener('mousedown', () => { (window as any).__mouseEvents.push('down'); });
            btn.addEventListener('mouseup',   () => { (window as any).__mouseEvents.push('up'); });
        });
        const rect = await page.locator('#clickBtn').evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.mouse.move(rect.x, rect.y);
        await page.mouse.down();
        await page.mouse.up();
        const events = await page.evaluate(() => (window as any).__mouseEvents as string[]);
        expect(events).toContain('down');
        expect(events).toContain('up');
    });
});

// ── Keyboard – press ──────────────────────────────────────────────────────────

test.describe('Keyboard press', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('keyboard.press fires keydown event', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#lastKey')).toHaveText('Enter');
    });

    test('keyboard.press with Shift modifier fires uppercase key', async ({ page }) => {
        await page.locator('#textInput').focus();
        await page.keyboard.press('Shift+A');
        await expect(page.locator('#lastKey')).toHaveText('A');
    });
});

// ── Route – fulfill / route.request() ────────────────────────────────────────

test.describe('Route – fulfill and request()', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('route.fulfill returns a synthetic response', async ({ page }) => {
        await page.route(`${API_BASE}/get`, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ mocked: true }),
            });
        });
        const result = await page.evaluate((url: string) =>
            fetch(url).then(r => r.json()), `${API_BASE}/get`
        );
        expect((result as any).mocked).toBe(true);
    });

    test('route.request() exposes the intercepted request URL', async ({ page }) => {
        let capturedUrl = '';
        await page.route(`${API_BASE}/get`, async route => {
            capturedUrl = route.request().url();
            await route.abort();
        });
        await page.evaluate((url: string) =>
            fetch(url).catch(() => {}), `${API_BASE}/get`
        );
        expect(capturedUrl).toContain('localhost:3000/get');
    });
});

// ── Fixtures – log and attach ─────────────────────────────────────────────────

test.describe('Fixtures – log and attach', () => {
    test('log writes a message without throwing', ({ log }) => {
        log('info message', { type: 'info', cmd: 'test' });
    });

    test('log.open creates a pending entry resolved with success', ({ log }) => {
        const handle = log.open('pending step', 'test');
        handle.success();
    });

    test('log.open entry can be resolved with fail', ({ log }) => {
        const handle = log.open('failing step', 'test');
        handle.fail('intentional failure marker');
    });

    test('attach adds labelled content to the test result', ({ attach }) => {
        attach('coverage-data', 'some content', 'text/plain');
    });
});

// ── Page events – navigation lifecycle ────────────────────────────────────────

test.describe('Page events – load / domcontentloaded', () => {
    test('load fires after navigation', async ({ page, node }) => {
        const dirname = await node.task('dirname');
        let fired = false;
        page.on('load', () => { fired = true; });
        await page.goto(`file://${dirname}/app/testPage.html`);
        expect(fired).toBe(true);
    });

    test('domcontentloaded fires during navigation', async ({ page, node }) => {
        const dirname = await node.task('dirname');
        let fired = false;
        page.on('domcontentloaded', () => { fired = true; });
        await page.goto(`file://${dirname}/app/testPage.html`);
        expect(fired).toBe(true);
    });
});

// ── Page events – network ─────────────────────────────────────────────────────

test.describe('Page events – request / response / requestfinished / requestfailed', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('request fires for a page-initiated fetch', async ({ page }) => {
        const urls: string[] = [];
        page.on('request', req => { urls.push(req.url()); });
        await page.evaluate((url: string) => fetch(url).catch(() => {}), `${API_BASE}/get`);
        await page.waitForTimeout(3000);
        expect(urls.some(u => u.includes('localhost:3000'))).toBe(true);
    });

    test('response fires when a fetch response arrives', async ({ page }) => {
        const statuses: number[] = [];
        page.on('response', resp => { statuses.push(resp.status()); });
        await page.evaluate((url: string) => fetch(url).catch(() => {}), `${API_BASE}/get`);
        await page.waitForTimeout(3000);
        expect(statuses.some(s => s === 200)).toBe(true);
    });

    test('requestfinished fires after a successful request', async ({ page }) => {
        const finished: string[] = [];
        page.on('requestfinished', req => { finished.push(req.url()); });
        await page.evaluate((url: string) => fetch(url).catch(() => {}), `${API_BASE}/get`);
        await page.waitForTimeout(3000);
        expect(finished.some(u => u.includes('localhost:3000'))).toBe(true);
    });

    test('requestfailed fires when route.abort() cancels a request', async ({ page }) => {
        let failedUrl = '';
        page.on('requestfailed', req => { failedUrl = req.url(); });
        await page.route(`${API_BASE}/get`, async route => { await route.abort(); });
        await page.evaluate((url: string) => fetch(url).catch(() => {}), `${API_BASE}/get`);
        await page.waitForTimeout(1000);
        expect(failedUrl).toContain('localhost:3000');
    });
});

// ── Page events – pageerror ───────────────────────────────────────────────────

test.describe('Page events – pageerror', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('pageerror fires on an uncaught exception in the page', async ({ page }) => {
        let capturedError: Error | null = null;
        page.on('pageerror', err => { capturedError = err; });
        await page.evaluate(() => {
            setTimeout(() => { throw new Error('uncaught test error'); }, 0);
        });
        await page.waitForTimeout(300);
        expect(capturedError).not.toBeNull();
        expect((capturedError as unknown as Error).message).toContain('uncaught test error');
    });
});

// ── Page events – frame ───────────────────────────────────────────────────────

test.describe('Page events – frameattached / framenavigated / framedetached', () => {
    test('frameattached fires when a page with an iframe is loaded', async ({ page }) => {
        const attached: any[] = [];
        page.on('frameattached', frame => { attached.push(frame); });
        await page.goto('http://localhost:3000/testPage.html');
        expect(attached.length).toBeGreaterThan(0);
    });

    test('framenavigated fires during page navigation', async ({ page }) => {
        let navigated = false;
        page.on('framenavigated', () => { navigated = true; });
        await page.goto('http://localhost:3000/testPage.html');
        expect(navigated).toBe(true);
    });

    test('framedetached fires when an iframe is removed from the DOM', async ({ page, browser, node }) => {
        await loadTestPage({ page, node });
        let detached = false;
        page.on('framedetached', () => { detached = true; });
        await page.evaluate(() => {
            const iframe = document.querySelector('iframe');
            if (iframe) iframe.remove();
        });
        await page.waitForTimeout(200);
        expect(detached).toBe(true);
    });
});

// ── Page events – popup ───────────────────────────────────────────────────────

test.describe('Page events - popup', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('popup fires when window.open is called', async ({ page }) => {
        const popupPromise = page.waitForEvent('popup', { timeout: 5000 });
        await page.evaluate(() => { window.open('about:blank', '_blank'); });
        const popup = await popupPromise;
        expect(popup.url()).not.toBeNull();
        await popup.close();
    });
});

// ── Page events – filechooser ─────────────────────────────────────────────────

test.describe('Page events – filechooser', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('filechooser fires when a file input is activated', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#fileUpload').click();
        const chooser = await chooserPromise;
        expect(typeof chooser.isMultiple()).toBe('boolean');
    });
});

// ── Page events – close ───────────────────────────────────────────────────────

test.describe('Page events - close', () => {
    test('close fires on a popup page when it is closed', async ({ browser, page }) => {
        let closed = false;
        await browser.newPage();
        await page.waitForTimeout(500);
        const secondTab = browser.tabs()[1];
        browser.switchTab(t => t.id === secondTab.id);
        page.on('close', () => { closed = true; });
        await page.close();
        expect(closed).toBe(true);
    });
});

// ── Page events – download ────────────────────────────────────────────────────

test.describe('Page events – download', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('download fires when a file download is triggered', async ({ page }) => {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'data:text/plain,hello';
            a.download = 'test.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await downloadPromise;
        expect(dl.suggestedFilename()).toBe('test.txt');
    });
});

// ── FileChooser – full API ────────────────────────────────────────────────────

test.describe('FileChooser – full API', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('element() returns the file HTMLInputElement', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#fileUpload').click();
        const fc = await chooserPromise;
        const el = fc.element() as HTMLInputElement;
        expect(el.tagName).toBe('INPUT');
        expect(el.type).toBe('file');
    });

    test('isMultiple() returns false for a standard file input', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#fileUpload').click();
        const fc = await chooserPromise;
        expect(fc.isMultiple()).toBe(false);
    });

    test('isMultiple() returns true for an input with the multiple attribute', async ({ page }) => {
        await page.evaluate(() => {
            const input = document.createElement('input');
            input.type = 'file';
            (input as any).multiple = true;
            input.id = '__multiInput';
            document.body.appendChild(input);
        });
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#__multiInput').click();
        const fc = await chooserPromise;
        expect(fc.isMultiple()).toBe(true);
    });

    test('accept() returns empty string when no accept attribute is set', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#fileUpload').click();
        const fc = await chooserPromise;
        expect(fc.accept()).toBe('');
    });

    test('accept() returns the value of the accept attribute', async ({ page }) => {
        await page.evaluate(() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg';
            input.id = '__acceptInput';
            document.body.appendChild(input);
        });
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#__acceptInput').click();
        const fc = await chooserPromise;
        expect(fc.accept()).toBe('image/png,image/jpeg');
    });

    test('setFiles() sets the file on the input and fires a change event', async ({ page }) => {
        const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
        await page.locator('#fileUpload').click();
        const fc = await chooserPromise;

        await page.evaluate(() => {
            (window as any).__fcChanges = 0;
            document.getElementById('fileUpload')!.addEventListener('change', () => {
                (window as any).__fcChanges++;
            });
        });

        fc.setFiles([new File(['hello world'], 'greet.txt', { type: 'text/plain' })]);

        const changes = await page.evaluate(() => (window as any).__fcChanges as number);
        expect(changes).toBe(1);

        const name = await page.evaluate(() => {
            const input = document.getElementById('fileUpload') as HTMLInputElement;
            return input.files?.[0]?.name ?? null;
        });
        expect(name).toBe('greet.txt');
    });
});

// ── Download – full API ───────────────────────────────────────────────────────

test.describe('Download – full API', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('url() returns the href of the triggering link', async ({ page }) => {
        const dlPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'data:text/plain,url-test';
            a.download = 'url-test.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await dlPromise;
        expect(dl.url()).toBe('data:text/plain,url-test');
    });

    test('suggestedFilename() returns the download attribute value when set', async ({ page }) => {
        const dlPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'data:text/plain,content';
            a.download = 'my-report.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await dlPromise;
        expect(dl.suggestedFilename()).toBe('my-report.csv');
    });

    test('suggestedFilename() falls back to the last URL path segment when download attribute is empty', async ({ page }) => {
        const dlPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'https://example.com/files/archive.zip';
            a.setAttribute('download', '');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await dlPromise;
        expect(dl.suggestedFilename()).toBe('archive.zip');
    });

    test('createReadStream() returns a ReadableStream of the file bytes', async ({ page }) => {
        const dlPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'data:text/plain,stream-content';
            a.download = 'stream.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await dlPromise;
        const stream = await dl.createReadStream();
        expect(typeof stream).toBe('object');
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
            const { value, done: d } = await reader.read();
            if (d) { done = true; } else { chunks.push(value!); }
        }
        const text = new TextDecoder().decode(
            chunks.reduce((acc, c) => { const merged = new Uint8Array(acc.length + c.length); merged.set(acc); merged.set(c, acc.length); return merged; }, new Uint8Array(0))
        );
        expect(text).toBe('stream-content');
    });

    test('saveAs() writes the file to the given path on disk', async ({ page, node }) => {
        const dirname = await node.task('dirname');
        const dlPromise = page.waitForEvent('download', { timeout: 5000 });
        await page.evaluate(() => {
            const a = document.createElement('a');
            a.href = 'data:text/plain,saved-content';
            a.download = 'saved.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        const dl = await dlPromise;
        const savePath = `${dirname}/../__tx_download_test__.txt`;
        await dl.saveAs(savePath);
        const content = await node.task('readFile', { path: savePath });
        expect(content).toBe('saved-content');
        await node.task('deleteFile', { path: savePath });
    });
});

// ── XPath locators ─────────────────────────────────────────────────────────────

test.describe('XPath locators', () => {
    test.beforeEach(async ({ page, node }) => { await loadTestPage({ page, node }); });

    test('// prefix finds element by tag and id attribute', async ({ page }) => {
        await expect(page.locator(`//button[@id='clickBtn']`)).toBeVisible();
    });

    test('xpath= prefix finds element', async ({ page }) => {
        await expect(page.locator(`xpath=//button[@id='clickBtn']`)).toBeVisible();
    });

    test('XPath text() predicate matches element text', async ({ page }) => {
        await expect(page.locator(`//button[text()='Click']`)).toBeVisible();
    });

    test('XPath contains() matches partial attribute value', async ({ page }) => {
        await expect(page.locator(`//input[contains(@placeholder,'here')]`)).toBeVisible();
    });

    test('XPath click triggers action', async ({ page }) => {
        await page.locator(`//button[@id='clickBtn']`).click();
        await expect(page.locator('#mouseResult')).toHaveText('Clicked');
    });

    test('XPath fill types into input', async ({ page }) => {
        await page.locator(`//input[@id='textInput']`).fill('xpath fill');
        await expect(page.locator('#textInput')).toHaveValue('xpath fill');
    });

    test('XPath count returns number of matched elements', async ({ page }) => {
        const count = await page.locator(`//section[@class='card']`).count();
        expect(count).toBeGreaterThan(0);
    });

    test('chained .locator() with XPath narrows within CSS root', async ({ page }) => {
        const heading = page.locator('.card').locator(`//h2[text()='Mouse / Pointer']`);
        await expect(heading).toBeVisible();
    });

    test('chained CSS then xpath= prefix form', async ({ page }) => {
        const btn = page.locator('.card').locator(`xpath=//button[@id='dblClickBtn']`);
        await expect(btn).toBeVisible();
    });
});

