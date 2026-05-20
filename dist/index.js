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
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>cypress-safari</title>
    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --jade:        #00d084;
            --jade-bg:     rgba(0, 208, 132, 0.10);
            --jade-glow:   rgba(0, 208, 132, 0.25);
            --pass:        #22c55e;
            --pass-bg:     rgba(34, 197, 94, 0.10);
            --fail:        #ef4444;
            --fail-bg:     rgba(239, 68, 68, 0.10);
            --warn:        #f59e0b;
            --bg-app:      #161618;
            --bg-topbar:   #111113;
            --bg-panel:    #1c1c1e;
            --bg-card:     #242426;
            --bg-hover:    #2c2c2f;
            --bg-active:   #343437;
            --border:      rgba(255,255,255,0.055);
            --border-s:    rgba(255,255,255,0.09);
            --text:        #d4d4d8;
            --text-dim:    #71717a;
            --text-muted:  #52525b;
            --radius:      5px;
            --font-ui:     -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-mono:   'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Fira Code', monospace;
        }

        html, body { height: 100%; overflow: hidden; }

        body {
            font-family: var(--font-ui);
            font-size: 13px;
            background: var(--bg-app);
            color: var(--text);
            display: flex;
            flex-direction: column;
        }

        /* \u2550\u2550 Topbar \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

        .cy-topbar {
            height: 44px;
            background: var(--bg-topbar);
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            padding: 0 14px;
            gap: 10px;
            flex-shrink: 0;
        }

        .cy-logo {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .cy-logo-mark {
            width: 24px;
            height: 24px;
            border-radius: 5px;
            background: var(--jade);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: 10px;
            letter-spacing: -0.5px;
            color: #000;
            flex-shrink: 0;
        }

        .cy-logo-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            letter-spacing: 0.1px;
        }

        .cy-topbar-div {
            width: 1px;
            height: 20px;
            background: var(--border-s);
            flex-shrink: 0;
        }

        .cy-run-all-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 14px;
            background: var(--jade);
            color: #000;
            border: none;
            border-radius: var(--radius);
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.12s, box-shadow 0.12s;
            letter-spacing: 0.1px;
        }

        .cy-run-all-btn:hover  { background: #00c07a; box-shadow: 0 0 12px var(--jade-glow); }
        .cy-run-all-btn:active { background: #00a96c; }
        .cy-run-all-btn:disabled {
            background: var(--bg-card);
            color: var(--text-muted);
            cursor: not-allowed;
            box-shadow: none;
        }

        .cy-topbar-right {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .cy-status-pill {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 4px 11px;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: 20px;
            font-size: 11px;
            color: var(--text-dim);
        }

        .cy-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--text-muted);
            flex-shrink: 0;
            transition: background 0.3s;
        }
        .cy-status-dot.ready   { background: var(--jade); box-shadow: 0 0 5px var(--jade); }
        .cy-status-dot.running { background: var(--warn); animation: cy-pulse 0.9s ease-in-out infinite; }
        .cy-status-dot.passed  { background: var(--pass); }
        .cy-status-dot.failed  { background: var(--fail); }

        @keyframes cy-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }

        /* \u2550\u2550 3-column body \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

        .cy-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* \u2550\u2550 Specs panel \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

        .cy-specs {
            width: 252px;
            flex-shrink: 0;
            background: var(--bg-panel);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .cy-panel-hdr {
            padding: 9px 14px 8px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: var(--text-dim);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .cy-specs-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .cy-specs-scroll::-webkit-scrollbar { width: 3px; }
        .cy-specs-scroll::-webkit-scrollbar-thumb { background: var(--border-s); border-radius: 2px; }

        /* spec card */
        .cy-spec-card { }

        .cy-spec-hdr {
            display: flex;
            align-items: center;
            padding: 6px 10px 6px 8px;
            gap: 5px;
            cursor: pointer;
            user-select: none;
            transition: background 0.1s;
        }
        .cy-spec-hdr:hover { background: var(--bg-hover); }
        .cy-spec-card.active .cy-spec-hdr { background: var(--bg-active); }

        .cy-spec-chevron {
            width: 12px;
            font-size: 10px;
            color: var(--text-muted);
            transition: transform 0.14s;
            flex-shrink: 0;
            text-align: center;
        }
        .cy-spec-card.open .cy-spec-chevron { transform: rotate(90deg); }

        .cy-spec-ext {
            font-size: 9px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;
            background: var(--bg-active);
            color: var(--text-muted);
            flex-shrink: 0;
            letter-spacing: 0.3px;
        }

        .cy-spec-filename {
            flex: 1;
            font-family: var(--font-mono);
            font-size: 11.5px;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cy-spec-badges { display: flex; gap: 4px; flex-shrink: 0; }

        .cy-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 10px;
            line-height: 1.5;
        }
        .cy-badge--pass { background: var(--pass-bg); color: var(--pass); }
        .cy-badge--fail { background: var(--fail-bg); color: var(--fail); }

        .cy-spec-run-btn {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-muted);
            font-size: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            opacity: 0;
            transition: opacity 0.1s, border-color 0.1s, color 0.1s;
        }
        .cy-spec-hdr:hover .cy-spec-run-btn { opacity: 1; border-color: var(--jade); color: var(--jade); }

        /* spec body: suites + test items */
        .cy-spec-body { display: none; padding: 0 0 4px; }
        .cy-spec-card.open .cy-spec-body { display: block; }

        .cy-suite-row {
            display: flex;
            align-items: center;
            padding: 4px 10px 3px 24px;
            gap: 6px;
        }
        .cy-suite-name {
            flex: 1;
            font-size: 11px;
            color: var(--text-dim);
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .cy-suite-run-btn {
            padding: 1px 6px;
            font-size: 9px;
            background: transparent;
            border: 1px solid var(--border-s);
            border-radius: 3px;
            color: var(--text-muted);
            cursor: pointer;
            flex-shrink: 0;
            opacity: 0;
            transition: opacity 0.1s, color 0.1s, border-color 0.1s;
        }
        .cy-suite-row:hover .cy-suite-run-btn { opacity: 1; color: var(--jade); border-color: var(--jade); }

        .cy-test-item {
            padding: 2px 10px 2px 36px;
            font-size: 11px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .cy-test-item::before {
            content: '';
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--text-muted);
            flex-shrink: 0;
        }

        /* upload footer */
        .cy-upload-footer {
            flex-shrink: 0;
            border-top: 1px solid var(--border);
            padding: 10px 12px 12px;
        }
        .cy-upload-footer-label {
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: 7px;
        }
        input[type="file"] {
            font-size: 10px;
            color: var(--text-dim);
            background: transparent;
            border: none;
            width: 100%;
            margin-bottom: 6px;
        }
        .cy-upload-btns { display: flex; gap: 5px; }
        .cy-upload-btn {
            flex: 1;
            padding: 5px 6px;
            font-size: 11px;
            font-weight: 600;
            background: var(--bg-card);
            color: var(--text-dim);
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            cursor: pointer;
            transition: all 0.1s;
            text-align: center;
        }
        .cy-upload-btn:hover { background: var(--bg-hover); color: var(--text); }
        .cy-upload-btn.primary {
            background: var(--jade-bg);
            color: var(--jade);
            border-color: rgba(0,208,132,0.3);
        }
        .cy-upload-btn.primary:hover { background: var(--jade); color: #000; }

        #testRunnerStatus {
            font-size: 10px;
            margin-top: 5px;
            color: var(--text-muted);
        }

        /* \u2550\u2550 Command log \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

        .cy-log-panel {
            width: 310px;
            flex-shrink: 0;
            background: var(--bg-app);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .cy-log-hdr {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 14px 8px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .cy-log-title {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: var(--text-dim);
        }
        .cy-log-clear {
            font-size: 10px;
            color: var(--text-muted);
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: all 0.1s;
        }
        .cy-log-clear:hover { background: var(--bg-card); color: var(--text); }

        #console {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0 8px;
        }
        #console::-webkit-scrollbar { width: 3px; }
        #console::-webkit-scrollbar-thumb { background: var(--border-s); border-radius: 2px; }

        /* log entries */
        .cy-cmd {
            display: flex;
            align-items: baseline;
            padding: 3px 14px 3px 10px;
            gap: 6px;
            font-family: var(--font-mono);
            font-size: 11px;
            line-height: 1.55;
            border-left: 2px solid transparent;
        }
        .cy-cmd:hover { background: var(--bg-card); }

        .cy-cmd.pass { border-left-color: var(--pass); }
        .cy-cmd.fail { border-left-color: var(--fail); }
        .cy-cmd.info { border-left-color: transparent; }

        .cy-cmd-icon {
            font-size: 9px;
            width: 13px;
            text-align: center;
            flex-shrink: 0;
        }
        .cy-cmd-icon.pass { color: var(--pass); }
        .cy-cmd-icon.fail { color: var(--fail); }
        .cy-cmd-icon.info { color: var(--text-muted); }

        .cy-cmd-label {
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.3px;
            flex-shrink: 0;
            min-width: 32px;
        }
        .cy-cmd-label.pass { color: var(--pass); }
        .cy-cmd-label.fail { color: var(--fail); }
        .cy-cmd-label.info { color: var(--text-muted); }

        .cy-cmd-msg {
            flex: 1;
            color: var(--text);
            word-break: break-word;
        }
        .cy-cmd.info .cy-cmd-msg { color: var(--text-dim); }

        .cy-cmd-dur {
            font-size: 10px;
            color: var(--text-muted);
            flex-shrink: 0;
        }

        .cy-log-section {
            padding: 7px 14px 3px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--text-muted);
            border-top: 1px solid var(--border);
            margin-top: 3px;
        }

        /* \u2550\u2550 Browser panel \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

        .cy-browser {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #fff;
            overflow: hidden;
            min-width: 0;
        }

        .cy-browser-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            background: var(--bg-panel);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }

        .cy-nav-btn {
            width: 28px;
            height: 28px;
            border-radius: var(--radius);
            background: transparent;
            border: 1px solid var(--border-s);
            color: var(--text-dim);
            font-size: 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.1s;
            line-height: 1;
        }
        .cy-nav-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-s); }

        .cy-url-bar {
            flex: 1;
            display: flex;
            align-items: center;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            overflow: hidden;
            transition: border-color 0.12s;
        }
        .cy-url-bar:focus-within { border-color: var(--jade); }

        .cy-url-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: var(--text);
            font-size: 12px;
            font-family: var(--font-mono);
            padding: 5px 10px;
        }
        .cy-url-input::placeholder { color: var(--text-muted); }

        .cy-go-btn {
            padding: 5px 11px;
            background: transparent;
            border: none;
            border-left: 1px solid var(--border-s);
            color: var(--text-dim);
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.1s;
            white-space: nowrap;
        }
        .cy-go-btn:hover { background: var(--jade-bg); color: var(--jade); }

        .cy-viewport-tag {
            font-size: 10px;
            color: var(--text-muted);
            font-family: var(--font-mono);
            white-space: nowrap;
            padding: 4px 9px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            flex-shrink: 0;
        }

        #iframe-container { flex: 1; overflow: hidden; background: #fff; }
        iframe { width: 100%; height: 100%; border: none; display: block; }

        .cy-empty {
            padding: 24px 14px;
            text-align: center;
            color: var(--text-muted);
            font-size: 11px;
            line-height: 1.6;
        }
    </style>
</head>
<body>

    <header class="cy-topbar">
        <div class="cy-logo">
            <div class="cy-logo-mark">CS</div>
            <span class="cy-logo-name">cypress\u2011safari</span>
        </div>
        <div class="cy-topbar-div"></div>
        <button class="cy-run-all-btn" id="runAllBtn" onclick="window.runAll && window.runAll()">
            &#9654;&nbsp; Run all specs
        </button>
        <div class="cy-topbar-right">
            <div class="cy-status-pill">
                <span class="cy-status-dot" id="statusIndicator"></span>
                <span id="statusText">Initializing\u2026</span>
            </div>
        </div>
    </header>

    <div class="cy-body">

        <!-- \u2500\u2500 Specs \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
        <nav class="cy-specs">
            <div class="cy-panel-hdr">Specs</div>
            <div class="cy-specs-scroll" id="testList">
                <div class="cy-empty">Loading specs\u2026</div>
            </div>
            <div class="cy-upload-footer">
                <div class="cy-upload-footer-label">Custom file</div>
                <input type="file" id="testFileInput" accept=".js">
                <div class="cy-upload-btns">
                    <button class="cy-upload-btn primary" onclick="window.runTestInBrowser && window.runTestInBrowser()">&#9654; Browser</button>
                    <button class="cy-upload-btn"         onclick="window.runTestOnServer  && window.runTestOnServer()">&#8679; Server</button>
                </div>
                <div id="testRunnerStatus"></div>
            </div>
        </nav>

        <!-- \u2500\u2500 Command Log \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
        <aside class="cy-log-panel">
            <div class="cy-log-hdr">
                <span class="cy-log-title">Command Log</span>
                <button class="cy-log-clear" onclick="document.getElementById('console').innerHTML=''">Clear</button>
            </div>
            <div id="console"></div>
        </aside>

        <!-- \u2500\u2500 Browser \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
        <main class="cy-browser">
            <div class="cy-browser-toolbar">
                <button class="cy-nav-btn" onclick="window.testApi && window.testApi.reload()" title="Reload">&#8635;</button>
                <div class="cy-url-bar">
                    <input type="text" id="navUrl" class="cy-url-input" placeholder="Enter URL\u2026" value="${targetUrl}">
                    <button class="cy-go-btn" onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                </div>
                <span class="cy-viewport-tag" id="viewportTag">\u2014</span>
            </div>
            <div id="iframe-container"></div>
        </main>

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
</html>`;
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
