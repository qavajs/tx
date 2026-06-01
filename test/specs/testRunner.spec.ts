import { test, expect, type Page, type NodeContext } from '@qavajs/tx';

// ── afterEach registered after test ──────────────────────────────────────────

let afterEachLateFlag = false;

test.describe('afterEach registered after test', () => {
    test.beforeEach(() => {
        expect('before each').toEqual('before each');
    });

    test('simple test', () => {
        expect('test').toEqual('test');
    });

    test.afterEach(() => {
        afterEachLateFlag = true;
    });

    test('verify afterEach was executed', () => {
        expect(afterEachLateFlag).toBe(true);
    });
});

// ── beforeAll runs once ───────────────────────────────────────────────────────

let beforeAllCount = 0;

test.describe('beforeAll runs once', () => {
    test.beforeAll(() => { beforeAllCount++; });

    test('first test — beforeAll ran', () => {
        expect(beforeAllCount).toBe(1);
    });

    test('second test — beforeAll did not re-run', () => {
        expect(beforeAllCount).toBe(1);
    });
});

// ── beforeAll registered after tests ─────────────────────────────────────────

let beforeAllLateFlag = false;

test.describe('beforeAll registered after tests', () => {
    test('beforeAll ran before first test', () => {
        expect(beforeAllLateFlag).toBe(true);
    });

    test.beforeAll(() => { beforeAllLateFlag = true; });

    test('beforeAll ran only once', () => {
        expect(beforeAllLateFlag).toBe(true);
    });
});

// ── afterAll runs after all tests ────────────────────────────────────────────

let afterAllFlag = false;

test.describe('afterAll registered after tests', () => {
    test('afterAll not yet executed — first test', () => {
        expect(afterAllFlag).toBe(false);
    });

    test.afterAll(() => { afterAllFlag = true; });

    test('afterAll not yet executed — last test', () => {
        expect(afterAllFlag).toBe(false);
    });
});

test.describe('afterAll ran after previous suite', () => {
    test('verify afterAll executed', () => {
        expect(afterAllFlag).toBe(true);
    });
});

// ── multiple beforeEach run in registration order ─────────────────────────────

const beforeEachOrder: string[] = [];

test.describe('multiple beforeEach run in registration order', () => {
    test.beforeEach(() => { beforeEachOrder.push('first'); });
    test.beforeEach(() => { beforeEachOrder.push('second'); });

    test('verify order', () => {
        expect(beforeEachOrder.slice(-2)).toEqual(['first', 'second']);
    });
});

// ── multiple afterEach run in reverse registration order ─────────────────────

let afterEachOrder: string[] = [];

test.describe('multiple afterEach run in reverse registration order', () => {
    test.afterEach(() => { afterEachOrder.push('first'); });
    test.afterEach(() => { afterEachOrder.push('second'); });

    test('reset', () => { afterEachOrder = []; });

    test('verify order', () => {
        expect(afterEachOrder).toEqual(['second', 'first']);
    });
});

// ── nested describe: outer beforeEach runs before inner ──────────────────────

const nestedBeforeOrder: string[] = [];

test.describe('nested beforeEach outer', () => {
    test.beforeEach(() => { nestedBeforeOrder.push('outer'); });

    test.describe('nested beforeEach inner', () => {
        test.beforeEach(() => { nestedBeforeOrder.push('inner'); });

        test('outer beforeEach runs before inner', () => {
            expect(nestedBeforeOrder.slice(-2)).toEqual(['outer', 'inner']);
        });
    });
});

// ── nested describe: inner afterEach runs before outer ───────────────────────

let nestedAfterOrder: string[] = [];

test.describe('nested afterEach outer', () => {
    test.afterEach(() => { nestedAfterOrder.push('outer'); });

    test.describe('nested afterEach inner', () => {
        test.afterEach(() => { nestedAfterOrder.push('inner'); });

        test('reset', () => { nestedAfterOrder = []; });

        test('inner afterEach runs before outer', () => {
            expect(nestedAfterOrder).toEqual(['inner', 'outer']);
        });
    });
});

// ── fixtures: simple value via test.extend ────────────────────────────────────

const simpleFixTest = test.extend<{ greeting: string }>({
    greeting: async ({}, use) => { await use('hello'); },
});

simpleFixTest.describe('simple fixture', () => {
    simpleFixTest('fixture provides value to test', async ({ greeting }) => {
        expect(greeting).toBe('hello');
    });
});

// ── fixtures: teardown runs after the test ────────────────────────────────────

let fixtureTeardownRan = false;

const teardownFixTest = test.extend<{ marker: string }>({
    marker: async ({}, use) => {
        await use('active');
        fixtureTeardownRan = true;
    },
});

teardownFixTest.describe('fixture teardown timing', () => {
    teardownFixTest('teardown has not run during the test', async ({ marker }) => {
        expect(marker).toBe('active');
        expect(fixtureTeardownRan).toBe(false);
    });
});

test.describe('fixture teardown ran after previous test', () => {
    test('teardown executed before next suite', () => {
        expect(fixtureTeardownRan).toBe(true);
    });
});

// ── fixtures: fixture-to-fixture dependency ───────────────────────────────────

const depFixTest = test.extend<{ base: number; doubled: number }>({
    base:    async ({}, use)          => { await use(7); },
    doubled: async ({ base }, use)    => { await use(base * 2); },
});

depFixTest.describe('fixture dependency', () => {
    depFixTest('derived fixture receives upstream fixture value', async ({ base, doubled }) => {
        expect(base).toBe(7);
        expect(doubled).toBe(14);
    });
});

// ── fixtures: multiple independent fixtures in one test ───────────────────────

const multiFixTest = test.extend<{ x: string; y: string }>({
    x: async ({}, use) => { await use('X'); },
    y: async ({}, use) => { await use('Y'); },
});

multiFixTest.describe('multiple fixtures', () => {
    multiFixTest('all fixtures are injected', async ({ x, y }) => {
        expect(x).toBe('X');
        expect(y).toBe('Y');
    });
});

// ── fixtures: .extend() overrides an existing fixture ─────────────────────────

const baseFixTest = test.extend<{ color: string }>({
    color: async ({}, use) => { await use('red'); },
});

const overrideFixTest = baseFixTest.extend<{ color: string }>({
    color: async ({}, use) => { await use('blue'); },
});

overrideFixTest.describe('fixture override', () => {
    overrideFixTest('override replaces the base fixture value', async ({ color }) => {
        expect(color).toBe('blue');
    });
});

// ── built-in fixture override: page ───────────────────────────────────────────

const mockPage = { url: () => 'https://mock.example' } as unknown as Page;

const overridePageTest = test.extend<{ page: Page }>({
    page: async ({}, use) => { await use(mockPage); },
});

overridePageTest.describe('override built-in page fixture', () => {
    overridePageTest('page fixture is replaced by mock', async ({ page }) => {
        expect(page === mockPage).toBe(true);
        expect(page.url()).toBe('https://mock.example');
    });
});

// ── built-in fixture override: node ───────────────────────────────────────────

const mockNode = { task: async () => 'mocked-task-result' } as unknown as NodeContext;

const overrideNodeTest = test.extend<{ node: NodeContext }>({
    node: async ({}, use) => { await use(mockNode); },
});

overrideNodeTest.describe('override built-in node fixture', () => {
    overrideNodeTest('node fixture is replaced by mock', async ({ node }) => {
        expect(node).toBe(mockNode);
        expect(await node.task<string>('any')).toBe('mocked-task-result');
    });
});

// ── override multiple built-in fixtures in one extend call ────────────────────

const mockPage2 = { url: () => 'https://page2.mock' } as unknown as Page;
const mockNode2 = { task: async () => 'node2-result' } as unknown as NodeContext;

const overrideBothTest = test.extend<{ page: Page; node: NodeContext }>({
    page: async ({}, use) => { await use(mockPage2); },
    node: async ({}, use) => { await use(mockNode2); },
});

overrideBothTest.describe('override multiple built-in fixtures together', () => {
    overrideBothTest('page and node are both replaced', async ({ page, node }) => {
        expect(page.url()).toBe('https://page2.mock');
        expect(await node.task<string>('any')).toBe('node2-result');
    });
});
