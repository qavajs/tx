import { test, expect } from '@qavajs/tx';

test.describe('route', () => {
    test('fulfill', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        const calculateCost = page.locator('#calculateCost');
        await page.route(/\/webpark\/calculate-cost/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: `{
                    "reservation_id": "19d6d131664c4d72b2743e47",
                    "cost": 42,
                    "currency": "€",
                    "years": 0,
                    "days": 2,
                    "hours": 0,
                    "minutes": 0
                }`
            });
        });
        await calculateCost.click();
        await expect(page.locator('#result')).toContainText('42.00€');
    });

    test('abort', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        const calculateCost = page.locator('#calculateCost');
        await page.route(/\/webpark\/calculate-cost/, async route => {
            await route.abort();
        });
        await calculateCost.click();
        await expect(page.locator('#result')).toHaveText('An error occurred while processing your request.');
    });

    test('fetch: intercept, modify response, fulfill', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        await page.route(/\/webpark\/calculate-cost/, async route => {
            const resp = await route.fetch();
            const json = await resp.json();
            json.cost = 777;
            await route.fulfill({ json });
        });
        await page.locator('#calculateCost').click();
        await expect(page.locator('#result')).toContainText('777');
    });

    test('continue: modifies request headers before forwarding', async ({ page }) => {
        await page.goto('https://practice.expandtesting.com/webpark');
        let intercepted = false;
        await page.route(/\/webpark\/calculate-cost/, async (route, req) => {
            intercepted = true;
            await route.continue({
                headers: { ...req.headers(), 'x-test-header': 'tx-test' },
            });
        });
        await page.locator('#calculateCost').click();
        // The page resolves normally (continue forwarded the request)
        await expect(page.locator('#result')).toBeVisible();
        expect(intercepted).toBe(true);
    });
});