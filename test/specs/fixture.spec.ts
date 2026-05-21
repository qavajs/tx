type Credentials = { username: string; password: string };
type ServerData = { data: number };

const myTest = test.extend<{
  credentials: Credentials;
  serverData: ServerData;
  loggedInPage: typeof page;
}>({
  credentials: async ({}, use) => {
    await use({ username: 'standard_user', password: 'secret_sauce' });
  },

  serverData: async ({ browser }, use) => {
    const raw = await (browser.task as Function)('readFile', { path: './test/serverFile.json' }) as string;
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

describe('Fixtures', () => {
  myTest('credentials fixture provides login data', async ({ credentials }) => {
    expect(credentials.username).toBe('standard_user');
    expect(credentials.password).toBe('secret_sauce');
  });

  myTest('serverData fixture reads file via browser.task', async ({ serverData }) => {
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
