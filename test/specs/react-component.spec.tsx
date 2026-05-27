import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { test, expect } from '@qavajs/tx';

function Counter({ initialCount = 0 }) {
  // const [count, setCount] = useState(initialCount);
  // return (
  //   <div>
  //     <p id="count">Count: {count}</p>
  //     <button id="inc" onClick={() => setCount(count + 1)}>Increment</button>
  //     <button id="dec" onClick={() => setCount(count - 1)}>Decrement</button>
  //   </div>
  // );

    return (
    <div>
      <p id="count">Count: 1</p>
      <button id="inc" onClick={() => console.log(1)}>Increment</button>
      <button id="dec" onClick={() => console.log(2)}>Decrement</button>
    </div>
  );
}

test.describe('React Component Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.registerMount(async (Component: any, container: HTMLElement, options: any) => {
      const root = createRoot(container);
      root.render(<Component {...options.props} />);
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
