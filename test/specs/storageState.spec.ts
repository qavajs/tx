import { test, expect } from '@qavajs/tx';

async function loadTestPage({ page, node }: any) {
    const dirname = await node.task('dirname');
    await page.goto(`file://${dirname}/app/testPage.html`);
}

const API_BASE = 'http://localhost:3000';
const CUSTOM_COOKIE_VALUE = 'custom_value_123';

const CUSTOM_COOKIE_STATE = {
    cookieJar: {
        version: 'tough-cookie@4.1.3',
        storeType: 'MemoryCookieStore',
        rejectPublicSuffixes: true,
        enableLooseMode: false,
        allowSpecialUseDomain: true,
        prefixSecurity: 'silent',
        cookies: [
            { key: 'tx_cookie', value: CUSTOM_COOKIE_VALUE, domain: 'localhost', path: '/', hostOnly: true },
        ],
    },
    origins: [],
};

test.describe('browser.storageState – cookies (localhost)', () => {
    test('saves and restores cookies via file path', async ({ page, browser, node }: any) => {
        const dirname = await node.task('dirname');
        const filePath = `${dirname}/.cookie-state-test.json`;

        await browser.loadStorageState(CUSTOM_COOKIE_STATE);
        await browser.storageState({ path: filePath });

        await browser.loadStorageState({ cookieJar: {}, origins: [] });

        await browser.loadStorageState(filePath);

        await page.goto(`${API_BASE}/cookies`);
        const text = await page.evaluate(() => document.body.innerText);
        expect(JSON.parse(text).cookies?.tx_cookie).toBe(CUSTOM_COOKIE_VALUE);

        await node.task('deleteFile', { path: filePath });
    });

    test('cookie roundtrip via storageState', async ({ page, browser }: any) => {
        await browser.loadStorageState(CUSTOM_COOKIE_STATE);

        await page.goto(`${API_BASE}/cookies`);
        const text1 = await page.evaluate(() => document.body.innerText);
        const json1 = JSON.parse(text1);
        expect(json1.cookies?.tx_cookie).toBe(CUSTOM_COOKIE_VALUE);

        await browser.loadStorageState({ cookieJar: {}, origins: [] });

        await page.goto(`${API_BASE}/cookies`);
        const text2 = await page.evaluate(() => document.body.innerText);
        const json2 = JSON.parse(text2);
        expect(Object.keys(json2.cookies ?? {}).length).toBe(0);
    });
});

test.describe('browser.storageState – localStorage', () => {
    test('loadStorageState injects item into current page', async ({ page, browser, node }: any) => {
        await loadTestPage({ page, node });

        const origin = await page.evaluate(() => location.origin);
        await browser.loadStorageState({
            cookieJar: {},
            origins: [{ origin, localStorage: [{ name: 'tx_injected', value: 'injected_value' }] }],
        });

        expect(await page.evaluate(() => localStorage.getItem('tx_injected'))).toBe('injected_value');
    });

    test('saves and restores localStorage item via file', async ({ page, browser, node }: any) => {
        const dirname = await node.task('dirname');
        const filePath = `${dirname}/.localStorage-state-test.json`;

        await loadTestPage({ page, node });
        await page.evaluate(() => { localStorage.setItem('tx_file_item', 'file_value'); });
        await browser.storageState({ path: filePath });

        await page.evaluate(() => { localStorage.removeItem('tx_file_item'); });
        expect(await page.evaluate(() => localStorage.getItem('tx_file_item'))).toBe(null);

        await browser.loadStorageState(filePath);

        expect(await page.evaluate(() => localStorage.getItem('tx_file_item'))).toBe('file_value');

        await node.task('deleteFile', { path: filePath });
    });
});