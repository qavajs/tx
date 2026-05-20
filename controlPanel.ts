/**
 * Control Panel - HTML UI for managing the virtual browser
 */

export function generateControlPanelHTML(proxyUrl: string, targetUrl: string, controlPanelPort: number = 3000): string {
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
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-header">
                <h2>🧪 Test Controls</h2>
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
                    <div class="control-group">
                        <input type="file" id="testFileInput" accept=".js" style="font-size: 12px; padding: 4px 0;">
                        <button class="primary" onclick="runTestInBrowser()" style="background: #7b1fa2; border-color: #7b1fa2;">▶ Run in Browser</button>
                        <button onclick="runTestOnServer()">⬆ Run on Server</button>
                        <div id="testRunnerStatus" style="font-size: 11px; color: #666; margin-top: 4px;"></div>
                    </div>
                </div>

                <!-- Console -->
                <div class="console" id="console"></div>
            </div>
        </div>
        
        <div class="iframe-wrapper">
            <div class="iframe-toolbar">
                <button onclick="window.testApi && window.testApi.reload()">🔄</button>
                <input type="text" id="navUrl" placeholder="URL" value="${targetUrl}">
                <button onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                <span id="status" style="flex: 1; font-size: 12px; color: #666;"></span>
            </div>
            <div id="iframe-container"></div>
        </div>
    </div>
    
    <script>
        let iframe = null;
        
        // TestApi - Simplified browser-side version
        window.testApi = {
            visit(url) {
                if (!iframe) {
                    log('iframe not ready', 'error');
                    return;
                }
                iframe.src = url;
                log(\`Navigating to: \${url}\`, 'info');
            },
            
            reload() {
                if (!iframe) {
                    log('iframe not ready', 'error');
                    return;
                }
                iframe.contentWindow.location.reload();
                log('Page reloaded', 'info');
            },
            
            get(selector) {
                try {
                    if (!iframe || !iframe.contentDocument) return [];
                    return Array.from(iframe.contentDocument.querySelectorAll(selector));
                } catch (e) {
                    log('Cross-origin access blocked. Open via proxy URL, not localhost:3000 directly.', 'error');
                    return [];
                }
            },

            find(selector) {
                try {
                    if (!iframe || !iframe.contentDocument) return null;
                    return iframe.contentDocument.querySelector(selector);
                } catch (e) {
                    return null;
                }
            },
            
            text(selector) {
                const el = this.find(selector);
                return el ? el.textContent || '' : '';
            },
            
            click(selector) {
                const el = this.find(selector);
                if (!el) {
                    log(\`Element not found: \${selector}\`, 'error');
                    return;
                }
                el.click();
                log(\`Clicked: \${selector}\`, 'success');
            },
            
            type(selector, text) {
                const el = this.find(selector);
                if (!el) {
                    log(\`Element not found: \${selector}\`, 'error');
                    return;
                }
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    // Use the native setter so React controlled inputs pick up the change
                    const proto = el.tagName === 'INPUT'
                        ? iframe.contentWindow.HTMLInputElement.prototype
                        : iframe.contentWindow.HTMLTextAreaElement.prototype;
                    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                    el.focus();
                    el.dispatchEvent(new Event('focus', { bubbles: true }));
                    nativeSetter.call(el, text);
                    el.dispatchEvent(new Event('input',  { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur',   { bubbles: true }));
                    log(\`Typed: \${text}\`, 'success');
                }
            },

            isVisible(selector) {
                const el = this.find(selector);
                if (!el || !iframe || !iframe.contentWindow) return false;
                const style = iframe.contentWindow.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            },

            attr(selector, attrName) {
                const el = this.find(selector);
                return el ? el.getAttribute(attrName) : null;
            },

            waitForElement(selector, timeout = 5000) {
                return new Promise((resolve, reject) => {
                    const start = Date.now();
                    const check = () => {
                        const el = this.find(selector);
                        if (el) return resolve(el);
                        if (Date.now() - start >= timeout) return reject(new Error('Timeout waiting for: ' + selector));
                        setTimeout(check, 100);
                    };
                    check();
                });
            },

            waitForUrl(pattern, timeout = 5000) {
                return new Promise((resolve, reject) => {
                    const start = Date.now();
                    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
                    const check = () => {
                        if (re.test(this.url())) return resolve();
                        if (Date.now() - start >= timeout) return reject(new Error('Timeout waiting for URL: ' + pattern));
                        setTimeout(check, 100);
                    };
                    check();
                });
            },

            wait(ms = 500) {
                return new Promise(resolve => setTimeout(resolve, ms));
            },

            url() {
                try {
                    return iframe && iframe.contentWindow ? iframe.contentWindow.location.href : '';
                } catch (e) {
                    return '';
                }
            },

            title() {
                try {
                    return iframe && iframe.contentDocument ? iframe.contentDocument.title : '';
                } catch (e) {
                    return '';
                }
            }
        };
        
        // Logging utility
        function log(message, type = 'info') {
            const console = document.getElementById('console');
            const line = document.createElement('div');
            line.className = 'console-line ' + type;
            line.textContent = '> ' + message;
            console.appendChild(line);
            console.scrollTop = console.scrollHeight;
        }
        
        // Initialize iframe
        function initIframe() {
            const container = document.getElementById('iframe-container');
            container.innerHTML = '';
            
            iframe = document.createElement('iframe');
            iframe.id = 'cy-virtual-browser';
            iframe.sandbox.add('allow-same-origin');
            iframe.sandbox.add('allow-scripts');
            iframe.sandbox.add('allow-forms');
            iframe.sandbox.add('allow-popups');
            iframe.sandbox.add('allow-modals');
            iframe.sandbox.add('allow-top-navigation-by-user-activation');
            
            iframe.onload = () => {
                log('iframe loaded', 'success');
                document.getElementById('statusIndicator').className = 'status-indicator ready';
                document.getElementById('statusText').textContent = 'Ready';
            };
            
            iframe.onerror = () => {
                log('iframe error', 'error');
            };
            
            container.appendChild(iframe);
            iframe.src = '${proxyUrl}';
            log('iframe created and navigating to proxy...', 'info');
        }
        
        // ── Test Runner ────────────────────────────────────────────────

        const API_BASE = 'http://localhost:${controlPanelPort}';

        function testExpect(actual) {
            const fail = msg => { throw new Error(msg); };
            const fmt  = v   => JSON.stringify(v);
            const m = {
                toBe:            e => actual !== e   && fail('Expected ' + fmt(e) + ', got ' + fmt(actual)),
                toEqual:         e => JSON.stringify(actual) !== JSON.stringify(e) && fail('Expected ' + fmt(e) + ', got ' + fmt(actual)),
                toContain:       e => Array.isArray(actual)
                                        ? (!actual.includes(e)              && fail('Array does not contain ' + fmt(e)))
                                        : (!String(actual).includes(String(e)) && fail('"' + actual + '" does not contain "' + e + '"')),
                toBeTruthy:      () => !actual  && fail('Expected truthy, got ' + fmt(actual)),
                toBeFalsy:       () =>  actual  && fail('Expected falsy, got ' + fmt(actual)),
                toBeNull:        () => actual !== null      && fail('Expected null, got ' + fmt(actual)),
                toBeUndefined:   () => actual !== undefined && fail('Expected undefined, got ' + fmt(actual)),
                toBeGreaterThan: n  => actual <= n && fail(fmt(actual) + ' is not > ' + n),
                toBeLessThan:    n  => actual >= n && fail(fmt(actual) + ' is not < ' + n),
                toMatch:         r  => { const re = typeof r === 'string' ? new RegExp(r) : r; !re.test(String(actual)) && fail('"' + actual + '" does not match ' + re); },
            };
            m.not = {
                toBe:       e => actual === e   && fail('Expected not ' + fmt(e)),
                toEqual:    e => JSON.stringify(actual) === JSON.stringify(e) && fail('Expected values not to be equal'),
                toBeTruthy: () =>  actual  && fail('Expected falsy, got '  + fmt(actual)),
                toBeFalsy:  () => !actual  && fail('Expected truthy, got ' + fmt(actual)),
                toBeNull:   () => actual === null && fail('Expected not null'),
            };
            return m;
        }

        async function executeTests(code) {
            const queue = [];
            const stack = [];
            const it = (name, fn) => queue.push({ name: stack.length ? stack.join(' > ') + ' > ' + name : name, fn });
            const describe = (name, fn) => { stack.push(name); fn(); stack.pop(); };
            const results = [];

            try {
                // eslint-disable-next-line no-new-func
                const fn = new Function(
                    'describe', 'it', 'test', 'expect', 'cy',
                    'setTimeout', 'clearTimeout', 'Promise', 'console',
                    code
                );
                fn(describe, it, it, testExpect, window.testApi, setTimeout, clearTimeout, Promise, console);
            } catch (e) {
                return [{ name: '(parse error)', passed: false, error: e.message, duration: 0 }];
            }

            for (const t of queue) {
                const start = Date.now();
                try {
                    await Promise.resolve(t.fn());
                    results.push({ name: t.name, passed: true, duration: Date.now() - start });
                } catch (e) {
                    results.push({ name: t.name, passed: false, error: e.message, duration: Date.now() - start });
                }
            }
            return results;
        }

        function renderTestResults(results) {
            let passed = 0, failed = 0;
            for (const t of results) {
                if (t.passed) { passed++; log('✅ ' + t.name + ' (' + t.duration + 'ms)', 'success'); }
                else          { failed++; log('❌ ' + t.name + (t.error ? ': ' + t.error : '') + ' (' + t.duration + 'ms)', 'error'); }
            }
            const status = document.getElementById('testRunnerStatus');
            status.textContent = passed + ' passed, ' + failed + ' failed';
            status.style.color = failed === 0 ? '#4caf50' : '#f44336';
        }

        async function runTestInBrowser() {
            const input = document.getElementById('testFileInput');
            const file  = input.files && input.files[0];
            if (!file) { log('Select a .js test file first', 'error'); return; }
            log('Running ' + file.name + ' in browser...', 'info');
            const code = await file.text();
            const results = await executeTests(code);
            renderTestResults(results);
        }

        async function runTestOnServer() {
            const input = document.getElementById('testFileInput');
            const file  = input.files && input.files[0];
            if (!file) { log('Select a .js test file first', 'error'); return; }
            log('Uploading ' + file.name + ' to server...', 'info');
            try {
                const code = await file.text();
                const resp = await fetch(API_BASE + '/api/run-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                if (data.error) throw new Error(data.error);
                renderTestResults(data.tests);
                log('Server: ' + data.passed + ' passed, ' + data.failed + ' failed (' + data.duration + 'ms)', data.failed === 0 ? 'success' : 'error');
            } catch (e) {
                log('Server error: ' + e.message, 'error');
            }
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', () => {
            log('Control Panel loaded', 'success');
            initIframe();
        });
    </script>
</body>
</html>
`;
}
