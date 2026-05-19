/**
 * Control Panel - HTML UI for managing the virtual browser
 */

export function generateControlPanelHTML(proxyUrl: string, targetUrl: string): string {
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
                <!-- Navigation -->
                <div class="control-section">
                    <div class="section-title">Navigation</div>
                    <div class="control-group">
                        <input type="text" id="urlInput" placeholder="Enter URL..." value="${targetUrl}">
                        <button class="primary" onclick="window.testApi && window.testApi.visit(document.getElementById('urlInput').value)">Visit</button>
                        <button onclick="window.testApi && window.testApi.reload()">Reload</button>
                    </div>
                </div>
                
                <!-- Selectors -->
                <div class="control-section">
                    <div class="section-title">Selectors</div>
                    <div class="control-group">
                        <div class="selector-input">
                            <input type="text" id="selectorInput" placeholder="CSS selector...">
                            <button onclick="findSelector()">Find</button>
                        </div>
                        <div id="selectorResults" style="font-size: 12px; color: #666;"></div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="control-section">
                    <div class="section-title">Actions</div>
                    <div class="control-group">
                        <button onclick="performClick()">Click Selected</button>
                        <button onclick="performType()">Type Text</button>
                        <input type="text" id="typeInput" placeholder="Text to type...">
                    </div>
                </div>
                
                <!-- Inspect -->
                <div class="control-section">
                    <div class="section-title">Inspect</div>
                    <div class="control-group">
                        <button onclick="toggleInspector()">Toggle Inspector</button>
                        <div id="inspectorInfo" style="font-size: 11px; color: #666; margin-top: 8px;"></div>
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
        let selectedElement = null;
        let inspectorMode = false;
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
                if (!iframe || !iframe.contentDocument) return [];
                return Array.from(iframe.contentDocument.querySelectorAll(selector));
            },
            
            find(selector) {
                if (!iframe || !iframe.contentDocument) return null;
                return iframe.contentDocument.querySelector(selector);
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
                    el.value = text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    log(\`Typed: \${text}\`, 'success');
                }
            },
            
            url() {
                return iframe && iframe.contentWindow ? iframe.contentWindow.location.href : '';
            },
            
            title() {
                return iframe && iframe.contentDocument ? iframe.contentDocument.title : '';
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
        
        // Find selector
        function findSelector() {
            try {
                const selector = document.getElementById('selectorInput').value;
                if (!selector) return;
                
                const elements = window.testApi.get(selector);
                const results = document.getElementById('selectorResults');
                results.innerHTML = \`Found: \${elements.length} element(s)\`;
                
                if (elements.length > 0) {
                    selectedElement = elements[0];
                }
                
                log(\`Found \${elements.length} elements for "\${selector}"\`, 'success');
            } catch (e) {
                log('Error: ' + e.message, 'error');
            }
        }
        
        // Perform click
        function performClick() {
            try {
                const selector = document.getElementById('selectorInput').value;
                if (!selector) {
                    log('Please enter a selector', 'error');
                    return;
                }
                window.testApi.click(selector);
            } catch (e) {
                log('Error: ' + e.message, 'error');
            }
        }
        
        // Perform type
        function performType() {
            try {
                const selector = document.getElementById('selectorInput').value;
                const text = document.getElementById('typeInput').value;
                if (!selector || !text) {
                    log('Please enter selector and text', 'error');
                    return;
                }
                window.testApi.type(selector, text);
            } catch (e) {
                log('Error: ' + e.message, 'error');
            }
        }
        
        // Toggle inspector
        function toggleInspector() {
            inspectorMode = !inspectorMode;
            const info = document.getElementById('inspectorInfo');
            
            if (inspectorMode && iframe && iframe.contentDocument) {
                iframe.contentDocument.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = e.target;
                    info.innerHTML = \`Tag: \${target.tagName}<br>Class: \${target.className}<br>ID: \${target.id}\`;
                    log(\`Inspected: \${target.tagName}.\${target.className}#\${target.id}\`, 'info');
                }, true);
                log('Inspector mode: ON', 'success');
            } else {
                log('Inspector mode: OFF', 'info');
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
