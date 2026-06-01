import { test, expect } from '@qavajs/tx';

test.describe('component', () => {
  test('mount a plain DOM element', async ({ page }) => {
    await page.mount(async (container) => {
      const el = document.createElement('div');
      el.id = 'my-component';
      el.textContent = 'Hello Component';
      container.appendChild(el);
    });

    const component = page.locator('#my-component');
    await expect(component).toBeVisible();
    await expect(component).toHaveText('Hello Component');
  });

  test('mount using a function that creates elements', async ({ page }) => {
    const MyComponent = (container: HTMLElement, options: { props: { name: string } }) => {
      container.innerHTML = `<button id="btn">Hello ${options.props.name}</button>`;
    };

    await page.mount(MyComponent, { props: { name: 'Tx' } });

    const btn = page.locator('#btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Hello Tx');
    await btn.click();
  });

  test('mount using registerMount', async ({ page }) => {
    await page.registerMount((Component: any, container: HTMLElement, options: any) => {
      container.innerHTML = `<button id="reg-btn">${Component} ${options.props.name}</button>`;
    });

    await page.mount('Hello', { props: { name: 'World' } });

    const btn = page.locator('#reg-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Hello World');
  });

  test('check if __tx_mount is set', async ({ page }) => {
    await page.registerMount(() => { (window as any).__reg_called = true; });
    const isSet = await page.evaluate(() => typeof (window as any).__tx_mount === 'function');
    await expect(isSet).toBe(true);
  });

});
