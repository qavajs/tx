import { test } from '@qavajs/tx';

test.describe('testauto.app', () => {

    test('create task', async ({ page, expect }) => {
        await page.goto('https://testauto.app/task-manager');
        const addTaskButton = page.locator('.btn-add-task');
        await addTaskButton.click();
        const title = page.locator('#task-form-title');
        await title.fill('Test Automation 42');
        const description = page.locator('#task-form-description');
        await description.fill('This is a test automation task.');
        const staus = page.locator('#task-form-status');
        await staus.selectOption('In Progress');
        const radio = page.locator('input[type="radio"][value="LOW"]');
        await radio.click();
        const dateField = page.locator('#task-form-due-date');
        await dateField.fill('2026-05-19');
        const labels = page.locator('#task-form-labels');
        await labels.fill('automation, testing');
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        const searchInput = page.locator('[aria-label="Search tasks"]');
        await searchInput.fill('Test Automation 42');
        await expect(page.locator('tr:has-text("Test Automation 42")')).toBeVisible();
    });

    test('delete task', async ({ page, expect }) => {
        const name = `Test Automation ${Date.now()}`;
        await page.goto('https://testauto.app/task-manager');
        const addTaskButton = page.locator('.btn-add-task');
        await addTaskButton.click();
        const title = page.locator('#task-form-title');
        await title.fill(name);
        const description = page.locator('#task-form-description');
        await description.fill('This is a test automation task.');
        const staus = page.locator('#task-form-status');
        await staus.selectOption('In Progress');
        const radio = page.locator('input[type="radio"][value="LOW"]');
        await radio.click();
        const dateField = page.locator('#task-form-due-date');
        await dateField.fill('2026-05-19');
        const labels = page.locator('#task-form-labels');
        await labels.fill('automation, testing');
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        const searchInput = page.locator('[aria-label="Search tasks"]');
        await searchInput.fill(name);
        await expect(page.locator(`tr`)).toHaveCount(2);
        await expect(page.locator(`tr:has-text("${name}")`)).toBeVisible();
        await page.on('dialog', async dialog => {
            await dialog.accept();
        });
        const deleteButton = page.locator(`tr:nth-child(1) [aria-label="Delete task"]`);
        await deleteButton.click();
        await expect(page.locator(`tr:has-text("${name}")`)).not.toBeVisible();
    });
});