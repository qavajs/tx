"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// iframeInjector.ts
var IframeInjector = class {
  constructor(config) {
    this.iframe = null;
    this.config = config;
  }
  /**
   * Inject the target site into an iframe
   */
  inject(containerId = this.config.containerId || "iframe-container") {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id '${containerId}' not found`);
    }
    this.iframe = document.createElement("iframe");
    this.iframe.id = "cy-virtual-browser";
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";
    this.iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-presentation");
    container.appendChild(this.iframe);
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.location.href = this.config.proxyUrl;
    }
    return this.iframe;
  }
  /**
   * Get the iframe document
   */
  getDocument() {
    return this.iframe?.contentDocument || null;
  }
  /**
   * Get the iframe window
   */
  getWindow() {
    return this.iframe?.contentWindow || null;
  }
  /**
   * Remove the iframe
   */
  remove() {
    this.iframe?.remove();
    this.iframe = null;
  }
  /**
   * Reload the iframe
   */
  reload() {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.location.reload();
    }
  }
  /**
   * Navigate to a new URL
   */
  navigate(url) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.location.href = url;
    }
  }
};

// testApi.ts
var TestApi = class {
  constructor(injector) {
    this.doc = null;
    this.win = null;
    this.injector = injector;
  }
  /**
   * Wait for iframe to be ready
   */
  async waitForIframe(timeout = 5e3) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      this.doc = this.injector.getDocument();
      this.win = this.injector.getWindow();
      if (this.doc && this.win && this.doc.readyState === "complete") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Iframe failed to load within timeout");
  }
  /**
   * Get elements (cy.get equivalent)
   */
  get(selector) {
    if (!this.doc) {
      throw new Error("Iframe not ready. Call wait() first");
    }
    return Array.from(this.doc.querySelectorAll(selector));
  }
  /**
   * Find a single element
   */
  find(selector) {
    if (!this.doc) {
      throw new Error("Iframe not ready");
    }
    return this.doc.querySelector(selector);
  }
  /**
   * Click an element
   */
  click(selector) {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    element.click();
  }
  /**
   * Type text into an element
   */
  type(selector, text) {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  /**
   * Get text content of an element
   */
  text(selector) {
    const element = this.find(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element.textContent || "";
  }
  /**
   * Check if element is visible
   */
  isVisible(selector) {
    const element = this.find(selector);
    if (!element) {
      return false;
    }
    const style = this.win?.getComputedStyle(element);
    return !!(style && style.display !== "none" && style.visibility !== "hidden");
  }
  /**
   * Get attribute value
   */
  attr(selector, attrName) {
    const element = this.find(selector);
    if (!element) {
      return null;
    }
    return element.getAttribute(attrName);
  }
  /**
   * Wait for element to be present
   */
  async waitForElement(selector, timeout = 5e3) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = this.find(selector);
      if (element) {
        return element;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Element not found within timeout: ${selector}`);
  }
  /**
   * Wait for element to disappear
   */
  async waitForElementToDisappear(selector, timeout = 5e3) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = this.find(selector);
      if (!element) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Element still present after timeout: ${selector}`);
  }
  /**
   * Execute script in iframe context
   */
  execute(fn, ...args) {
    if (!this.win) {
      throw new Error("Iframe not ready");
    }
    return fn.apply(this.win, args);
  }
  /**
   * Take a screenshot (return element as data)
   */
  screenshot(selector) {
    let element;
    if (selector) {
      const el = this.find(selector);
      if (!el) throw new Error(`Element not found: ${selector}`);
      element = el;
    } else if (this.doc) {
      element = this.doc.documentElement;
    } else {
      throw new Error("Iframe not ready");
    }
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left
    };
  }
  /**
   * Get page title
   */
  title() {
    return this.doc?.title || "";
  }
  /**
   * Get current URL
   */
  url() {
    return this.win?.location.href || "";
  }
  /**
   * Wait for iframe to load
   */
  async wait(timeout = 5e3) {
    await this.waitForIframe(timeout);
  }
  /**
   * Reload page
   */
  reload() {
    this.injector.reload();
  }
  /**
   * Visit URL
   */
  visit(url) {
    this.injector.navigate(url);
  }
};

// server.ts
var http = __toESM(require("http"));
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// controlPanel.ts
function generateControlPanelHTML(proxyUrl, targetUrl, controlPanelPort = 3e3) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cypress Safari - Virtual Browser</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f0f0;
        }
        
        .container {
            display: flex;
            height: 100vh;
        }
        
        .toolbar {
            width: 350px;
            background: white;
            border-right: 1px solid #ddd;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        
        .toolbar-header {
            padding: 16px;
            border-bottom: 1px solid #ddd;
            background: #fafafa;
        }
        
        .toolbar-header h2 {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
        }
        
        .url-display {
            font-size: 11px;
            color: #666;
            word-break: break-all;
            font-family: monospace;
            background: #f5f5f5;
            padding: 8px;
            border-radius: 4px;
        }
        
        .toolbar-content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }
        
        .control-section {
            margin-bottom: 24px;
        }
        
        .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #999;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
        }
        
        .control-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        input[type="text"], input[type="number"], select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            font-family: monospace;
            background: white;
            color: #333;
        }
        
        input[type="text"]:focus, input[type="number"]:focus, select:focus {
            outline: none;
            border-color: #0099ff;
            box-shadow: 0 0 0 2px rgba(0, 153, 255, 0.1);
        }
        
        button {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            color: #333;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        button:hover {
            background: #f5f5f5;
            border-color: #999;
        }
        
        button.primary {
            background: #0099ff;
            color: white;
            border-color: #0099ff;
        }
        
        button.primary:hover {
            background: #0077cc;
            border-color: #0077cc;
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .selector-input {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        }
        
        .selector-input input {
            flex: 1;
        }
        
        .selector-input button {
            flex: 0 0 auto;
            width: 36px;
            padding: 8px;
        }
        
        .console {
            border-top: 1px solid #ddd;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 12px;
            max-height: 200px;
            overflow-y: auto;
            line-height: 1.4;
        }
        
        .console-line {
            margin-bottom: 4px;
        }
        
        .console-line.error {
            color: #f48771;
        }
        
        .console-line.success {
            color: #89d185;
        }
        
        .console-line.info {
            color: #75beff;
        }
        
        .iframe-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: white;
        }
        
        .iframe-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-bottom: 1px solid #ddd;
            background: #fafafa;
        }
        
        .iframe-toolbar input {
            flex: 1;
            max-width: 300px;
        }
        
        .iframe-toolbar button {
            flex: 0 0 auto;
        }
        
        #iframe-container {
            flex: 1;
            overflow: hidden;
            background: white;
            position: relative;
        }
        
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        
        .inspector-element {
            background: rgba(0, 153, 255, 0.1);
            border: 2px solid #0099ff;
        }
        
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #999;
            margin-right: 6px;
        }
        
        .status-indicator.ready {
            background: #4caf50;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* \u2500\u2500 Test list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
        .test-file-card {
            border: 1px solid #e8e8e8;
            border-radius: 6px;
            margin-bottom: 8px;
            overflow: hidden;
        }

        .test-file-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            background: #f7f7f7;
            cursor: pointer;
            user-select: none;
            gap: 8px;
        }

        .test-file-header:hover {
            background: #efefef;
        }

        .test-file-name {
            font-size: 12px;
            font-weight: 600;
            font-family: monospace;
            color: #333;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .test-file-run {
            flex-shrink: 0;
            padding: 3px 8px;
            font-size: 11px;
            background: #7b1fa2;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-weight: 600;
        }

        .test-file-run:hover {
            background: #6a1b8a;
        }

        .test-file-body {
            padding: 6px 10px 8px;
            display: none;
        }

        .test-file-card.open .test-file-body {
            display: block;
        }

        .test-suite-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 6px;
            gap: 6px;
        }

        .test-suite-name {
            font-size: 11px;
            font-weight: 600;
            color: #555;
            flex: 1;
        }

        .test-suite-run {
            flex-shrink: 0;
            padding: 2px 6px;
            font-size: 10px;
            background: white;
            color: #7b1fa2;
            border: 1px solid #ce93d8;
            border-radius: 3px;
            cursor: pointer;
        }

        .test-suite-run:hover {
            background: #f3e5f5;
        }

        .test-item-name {
            font-size: 11px;
            color: #888;
            padding: 2px 0 2px 10px;
            line-height: 1.4;
        }

        .test-item-name::before {
            content: '\xB7';
            margin-right: 4px;
            color: #bbb;
        }

        .test-list-empty {
            font-size: 12px;
            color: #999;
            text-align: center;
            padding: 12px 0;
        }

        .upload-divider {
            border: none;
            border-top: 1px dashed #e0e0e0;
            margin: 12px 0 10px;
        }

        .upload-label {
            font-size: 11px;
            color: #aaa;
            margin-bottom: 6px;
        }

        .upload-row {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
        }

        .upload-row input[type="file"] {
            flex: 1;
            font-size: 11px;
            min-width: 0;
        }

        #testRunnerStatus {
            font-size: 11px;
            margin-top: 6px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-header">
                <h2>\u{1F9EA} Test Controls</h2>
                <div class="url-display" id="targetUrl">${targetUrl}</div>
                <div style="margin-top: 8px; font-size: 11px; color: #666;">
                    <span class="status-indicator" id="statusIndicator"></span>
                    <span id="statusText">Initializing...</span>
                </div>
            </div>
            
            <div class="toolbar-content">
                <!-- Test Runner -->
                <div class="control-section">
                    <div class="section-title">Test Runner</div>

                    <!-- Parsed test list -->
                    <div id="testList"><div class="test-list-empty">Loading tests\u2026</div></div>

                    <!-- Upload fallback -->
                    <hr class="upload-divider">
                    <div class="upload-label">Upload custom file</div>
                    <div class="upload-row">
                        <input type="file" id="testFileInput" accept=".js">
                        <button onclick="runTestInBrowser()" title="Run in browser" style="padding:4px 8px;font-size:11px;background:#7b1fa2;color:white;border-color:#7b1fa2;">\u25B6</button>
                        <button onclick="runTestOnServer()" title="Run on server" style="padding:4px 8px;font-size:11px;">\u2B06</button>
                    </div>
                    <div id="testRunnerStatus"></div>
                </div>

                <!-- Console -->
                <div class="console" id="console"></div>
            </div>
        </div>
        
        <div class="iframe-wrapper">
            <div class="iframe-toolbar">
                <button onclick="window.testApi && window.testApi.reload()">\u{1F504}</button>
                <input type="text" id="navUrl" placeholder="URL" value="${targetUrl}">
                <button onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                <span id="status" style="flex: 1; font-size: 12px; color: #666;"></span>
            </div>
            <div id="iframe-container"></div>
        </div>
    </div>
    
    <script>
        window.__CONFIG__ = {
            proxyUrl: "${proxyUrl}",
            targetUrl: "${targetUrl}",
            port: ${controlPanelPort}
        };
    </script>
    <script src="/panel.js"></script>
</body>
</html>
`;
}

// testRunner.ts
var vm = __toESM(require("vm"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function createExpect(actual) {
  const assert = (ok, msg) => {
    if (!ok) throw new Error(msg);
  };
  const fmt = (v) => JSON.stringify(v);
  const matchers = {
    toBe: (e) => assert(actual === e, `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toEqual: (e) => assert(JSON.stringify(actual) === JSON.stringify(e), `Expected ${fmt(e)}, got ${fmt(actual)}`),
    toContain: (e) => Array.isArray(actual) ? assert(actual.includes(e), `Array does not contain ${fmt(e)}`) : assert(String(actual).includes(String(e)), `"${actual}" does not contain "${e}"`),
    toBeTruthy: () => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeFalsy: () => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeNull: () => assert(actual === null, `Expected null, got ${fmt(actual)}`),
    toBeUndefined: () => assert(actual === void 0, `Expected undefined, got ${fmt(actual)}`),
    toBeGreaterThan: (n) => assert(actual > n, `Expected ${fmt(actual)} > ${n}`),
    toBeLessThan: (n) => assert(actual < n, `Expected ${fmt(actual)} < ${n}`),
    toMatch: (r) => {
      const re = typeof r === "string" ? new RegExp(r) : r;
      assert(re.test(String(actual)), `"${actual}" does not match ${re}`);
    },
    not: {}
  };
  matchers.not = {
    toBe: (e) => assert(actual !== e, `Expected not ${fmt(e)}`),
    toEqual: (e) => assert(JSON.stringify(actual) !== JSON.stringify(e), `Expected values not to be equal`),
    toBeTruthy: () => assert(!actual, `Expected falsy, got ${fmt(actual)}`),
    toBeFalsy: () => assert(!!actual, `Expected truthy, got ${fmt(actual)}`),
    toBeNull: () => assert(actual !== null, `Expected not null`),
    toContain: (e) => Array.isArray(actual) ? assert(!actual.includes(e), `Array should not contain ${fmt(e)}`) : assert(!String(actual).includes(String(e)), `"${actual}" should not contain "${e}"`)
  };
  return matchers;
}
function parseTestCode(code) {
  const tests = [];
  const suiteStack = [];
  const it = (name) => {
    tests.push({ suite: suiteStack.join(" > "), name: String(name) });
  };
  const describe = (name, fn) => {
    suiteStack.push(String(name));
    try {
      fn();
    } catch {
    }
    suiteStack.pop();
  };
  const noop = () => ({});
  const sandbox = vm.createContext({
    describe,
    it,
    test: it,
    expect: () => noop,
    cy: new Proxy({}, { get: () => noop }),
    console: { log: noop, error: noop, warn: noop },
    setTimeout: noop,
    clearTimeout: noop,
    Promise: { resolve: () => ({ then: noop }) }
  });
  try {
    vm.runInContext(code, sandbox);
  } catch {
  }
  return tests;
}
function parseTestFile(filePath) {
  const filename = path.basename(filePath);
  try {
    const code = fs.readFileSync(filePath, "utf-8");
    return { filename, tests: parseTestCode(code) };
  } catch (err) {
    return { filename, tests: [], error: err.message };
  }
}
var TestRunner = class {
  /**
   * Execute a JS test code string. The sandbox exposes describe/it/test/expect
   * plus any extra context values (e.g. { cy: mockApi }).
   */
  async runCode(code, extraContext = {}) {
    const queue = [];
    const suiteStack = [];
    const it = (name, fn) => {
      const full = suiteStack.length ? `${suiteStack.join(" > ")} > ${name}` : name;
      queue.push({ name: full, fn });
    };
    const describe = (name, fn) => {
      suiteStack.push(name);
      try {
        fn();
      } finally {
        suiteStack.pop();
      }
    };
    const cypressStub = new Proxy({}, {
      get: (_t, prop) => (..._args) => {
        if (prop === "url" || prop === "title" || prop === "text" || prop === "attr") return "";
        if (prop === "get") return [];
        if (prop === "find") return null;
        if (prop === "isVisible") return false;
        if (prop === "wait" || prop === "waitForElement" || prop === "waitForUrl") return Promise.resolve(null);
        return void 0;
      }
    });
    const sandbox = vm.createContext({
      describe,
      it,
      test: it,
      expect: createExpect,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      cy: cypressStub,
      ...extraContext
    });
    try {
      vm.runInContext(code, sandbox);
    } catch (err) {
      return {
        passed: 0,
        failed: 1,
        total: 1,
        duration: 0,
        tests: [{ name: "(parse/compile error)", passed: false, error: err.message, duration: 0 }]
      };
    }
    const results = [];
    const suiteStart = Date.now();
    for (const t of queue) {
      const start = Date.now();
      try {
        await Promise.resolve(t.fn());
        results.push({ name: t.name, passed: true, duration: Date.now() - start });
      } catch (err) {
        results.push({ name: t.name, passed: false, error: err.message, duration: Date.now() - start });
      }
    }
    const passed = results.filter((r) => r.passed).length;
    return {
      passed,
      failed: results.length - passed,
      total: results.length,
      duration: Date.now() - suiteStart,
      tests: results
    };
  }
  /** Load a JS file from disk and run it. */
  async runFile(filePath, extraContext = {}) {
    const code = fs.readFileSync(filePath, "utf-8");
    return this.runCode(code, extraContext);
  }
  /** Pretty-print results to stdout. */
  report(results) {
    console.log("\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    for (const t of results.tests) {
      if (t.passed) {
        console.log(`  \u2705  ${t.name} (${t.duration}ms)`);
      } else {
        console.log(`  \u274C  ${t.name} (${t.duration}ms)`);
        if (t.error) console.log(`       ${t.error}`);
      }
    }
    console.log("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    console.log(`  ${results.passed} passed, ${results.failed} failed, ${results.total} total (${results.duration}ms)
`);
  }
};

// server.ts
var TestServer = class {
  constructor(port = 3e3) {
    this.server = null;
    this.port = port;
  }
  start(proxyUrl, targetUrl) {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.url === "/" && req.method === "GET") {
          const html = generateControlPanelHTML(proxyUrl, targetUrl, this.port);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
        if (req.url === "/panel.js" && req.method === "GET") {
          const candidates = [
            path2.join(__dirname, "panel.js"),
            path2.join(__dirname, "dist", "panel.js")
          ];
          const panelPath = candidates.find((p) => fs2.existsSync(p));
          if (!panelPath) {
            res.writeHead(503, { "Content-Type": "text/plain" });
            res.end("panel.js not found \u2014 run: npm run build");
            return;
          }
          res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
          res.end(fs2.readFileSync(panelPath));
          return;
        }
        if (req.url === "/api/run-test" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => body += chunk);
          req.on("end", async () => {
            try {
              const { code } = JSON.parse(body);
              const runner = new TestRunner();
              const results = await runner.runCode(code);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(results));
            } catch (err) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
        if (req.url === "/api/tests" && req.method === "GET") {
          const examplesDir = path2.join(__dirname, "examples");
          try {
            const files = fs2.readdirSync(examplesDir).filter((f) => f.endsWith(".js")).sort().map((f) => parseTestFile(path2.join(examplesDir, f)));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(files));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (req.url?.startsWith("/api/test-source") && req.method === "GET") {
          const qs = new URL(req.url, `http://localhost`).searchParams;
          const file = qs.get("file") ?? "";
          if (!file || file.includes("/") || file.includes("\\") || !file.endsWith(".js")) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Invalid filename");
            return;
          }
          const filePath = path2.join(__dirname, "examples", file);
          try {
            const content = fs2.readFileSync(filePath, "utf-8");
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(content);
          } catch {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
          }
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });
      this.server.listen(this.port, "localhost", () => {
        console.log(`
\u{1F9EA} Test Control Panel: http://localhost:${this.port}`);
        resolve();
      });
    });
  }
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
  getPort() {
    return this.port;
  }
};

// wrapper.ts
var hammerhead = require("testcafe-hammerhead");
var CypressSafariWrapper = class {
  constructor(config = {}) {
    this.config = config;
    this.proxyUrl = "";
    this.controlPanelProxyUrl = "";
    this.targetUrl = "";
    this.testApi = null;
    this.server = null;
    this.injector = null;
    this.targetUrl = config.targetUrl || "https://www.saucedemo.com/";
    config.proxyHost = config.proxyHost || "localhost";
    config.port1 = config.port1 || 1337;
    config.port2 = config.port2 || 1338;
    config.controlPanelPort = config.controlPanelPort || 3e3;
  }
  /**
   * Initialize the proxy and create sessions
   */
  initializeProxy() {
    class ProxySession extends hammerhead.Session {
      getAuthCredentials() {
        return null;
      }
      handleFileDownload() {
      }
      handleAttachment() {
      }
      handlePageError(_ctx, err) {
        console.error("Page error:", err);
      }
      async getPayloadScript() {
        return "";
      }
      async getIframePayloadScript() {
        return "";
      }
    }
    this.proxy = new hammerhead.Proxy({});
    this.proxy.start({
      hostname: this.config.proxyHost || "localhost",
      port1: this.config.port1 || 1337,
      port2: this.config.port2 || 1338
    });
    this.session = new ProxySession([], {});
    this.proxyUrl = this.proxy.openSession(this.targetUrl, this.session);
    this.controlPanelSession = new ProxySession([], {});
    const controlPanelLocalUrl = `http://localhost:${this.config.controlPanelPort}`;
    this.controlPanelProxyUrl = this.proxy.openSession(controlPanelLocalUrl, this.controlPanelSession);
  }
  /**
   * Start the wrapper
   */
  async start() {
    console.log("\n\u{1F680} Starting Cypress Safari Wrapper...");
    try {
      this.initializeProxy();
      console.log(`\u2705 Proxy initialized at ${this.proxyUrl}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.injector = new IframeInjector({
        proxyUrl: this.proxyUrl,
        targetUrl: this.targetUrl
      });
      this.testApi = new TestApi(this.injector);
      this.server = new TestServer(this.config.controlPanelPort);
      await this.server.start(this.proxyUrl, this.targetUrl);
      console.log(`\u2705 Control Panel server started at http://localhost:${this.config.controlPanelPort}`);
      console.log(`\u2705 Control Panel via proxy at ${this.controlPanelProxyUrl}`);
      console.log(`\u{1F4E6} Target proxy URL: ${this.proxyUrl}`);
      console.log(`\u{1F3AF} Target URL: ${this.targetUrl}`);
      if (!this.config.headless) {
        const { exec } = require("child_process");
        console.log(`
\u{1F310} Opening browser...`);
        exec(`open "${this.controlPanelProxyUrl}"`, (err) => {
          if (err) {
            console.error("Failed to open browser:", err.message);
            console.log(`
\u{1F4CD} Visit via proxy: ${this.controlPanelProxyUrl}`);
            console.log(`\u{1F4CD} Or visit locally: http://localhost:${this.config.controlPanelPort}`);
          } else {
            console.log(`\u2705 Browser opened successfully`);
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
      console.log(`
\u2728 Control Panel ready for use`);
      console.log(`
\u{1F4A1} Open via proxy: ${this.controlPanelProxyUrl}`);
      console.log(`\u{1F4A1} Or locally: http://localhost:${this.config.controlPanelPort}
`);
      return this.testApi;
    } catch (error) {
      console.error("\u274C Failed to start wrapper:", error);
      await this.stop();
      throw error;
    }
  }
  /**
   * Stop the wrapper
   */
  async stop() {
    console.log("\n\u{1F6D1} Stopping Cypress Safari Wrapper...");
    if (this.injector) {
      this.injector.remove();
    }
    if (this.server) {
      await this.server.stop();
    }
    if (this.proxy) {
      this.proxy.close();
    }
    console.log("\u2705 Wrapper stopped");
  }
  /**
   * Get the test API
   */
  getTestApi() {
    if (!this.testApi) {
      throw new Error("Wrapper not started. Call start() first.");
    }
    return this.testApi;
  }
  /**
   * Get the proxy URL
   */
  getProxyUrl() {
    return this.proxyUrl;
  }
  /**
   * Get target URL
   */
  getTargetUrl() {
    return this.targetUrl;
  }
};

// start.ts
async function main() {
  const targetUrl = process.argv[2] || "https://www.saucedemo.com/";
  const wrapper = new CypressSafariWrapper({
    targetUrl,
    proxyHost: "localhost",
    port1: 1337,
    port2: 1338,
    controlPanelPort: 3e3,
    headless: process.env.HEADLESS === "true"
  });
  try {
    await wrapper.start();
    console.log("\u{1F3AF} Virtual browser is now running!");
    console.log("\u{1F4CD} Use the control panel to interact with the site");
    console.log("\u2328\uFE0F  Press Ctrl+C to stop\n");
    process.on("SIGINT", async () => {
      console.log("\n\n\u{1F6D1} Shutting down...");
      await wrapper.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", error);
    await wrapper.stop();
    process.exit(1);
  }
}
main().catch(console.error);
//# sourceMappingURL=index.js.map
