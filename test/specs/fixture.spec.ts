import { test, expect, type Page } from '@qavajs/tx';

type Credentials = { username: string; password: string };
type ServerData = { data: number };

const myTest = test.extend<{
  credentials: Credentials;
  serverData: ServerData;
  loggedInPage: Page;
}>({
  credentials: async ({}, use) => {
    await use({ username: 'standard_user', password: 'secret_sauce' });
  },

  serverData: async ({ node }, use) => {
    const raw = await node.task<string>('readFile', { path: './test/serverFile.json' });
    await use(JSON.parse(raw));
  },

  loggedInPage: async ({ page, credentials }, use) => {
    await page.goto('https://www.saucedemo.com');
    await page.getByTestId('username').fill(credentials.username);
    await page.getByTestId('password').fill(credentials.password);
    await page.getByTestId('login-button').click();
    await page.waitForURL(/inventory/, { timeout: 5000 });
    await use(page);
    await page.goto('https://www.saucedemo.com');
  },
});

myTest.describe('Fixtures', () => {
  myTest('credentials fixture provides login data', async ({ credentials }) => {
    expect(credentials.username).toBe('standard_user');
    expect(credentials.password).toBe('secret_sauce');
  });

  myTest('serverData fixture reads file via node.task', async ({ serverData }) => {
    expect(serverData).toEqual({ data: 42 });
    expect(serverData.data).toBeGreaterThan(0);
  });

  myTest('loggedInPage fixture lands on inventory', async ({ loggedInPage }) => {
    expect(loggedInPage.url()).toContain('inventory');
    await expect(loggedInPage.getByTestId('title')).toHaveText('Products');
  });

  myTest('loggedInPage fixture shows correct item count', async ({ loggedInPage }) => {
    await expect(loggedInPage.locator('[data-test="inventory-item"]')).toHaveCount(6);
  });

});

const API_BASE = 'http://localhost:3000';

test.describe('API', () => {
  test('request fixture fetches JSON from an API', async ({ request }) => {
    const resp = await request.fetch(`${API_BASE}/get`);
    expect(resp.status()).toBe(200);
    expect(resp.ok()).toBe(true);
    const body = await resp.json() as { url: string };
    expect(body.url).toContain('localhost:3000');
  });

  test('request fixture posts JSON body', async ({ request }) => {
    const resp = await request.fetch(`${API_BASE}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { json: { hello: string } };
    expect(body.json.hello).toBe('world');
  });
});
