import { createApp } from 'vue';
import { test, expect } from '@qavajs/tx';
import Counter from './Counter.vue';

test.describe('Vue Component Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.registerMount(async (Component: any, container: HTMLElement, options: any) => {
      createApp(Component, options.props).mount(container);
    });
  });

  test('should render and interact with counter', async ({ page }) => {
    await page.mount(Counter, { props: { initialCount: 10 } });

    const count = page.locator('#count');
    await expect(count).toHaveText('Count: 10');

    await page.locator('#inc').click();
    await expect(count).toHaveText('Count: 11');

    await page.locator('#dec').click();
    await expect(count).toHaveText('Count: 10');
  });
});
