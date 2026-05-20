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
                        <button class="primary" onclick="runDemoLogin()" style="background: #4caf50;">🔐 Demo Login</button>
                        <button onclick="debugPageElements()">🔍 Debug Elements</button>
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
        
        // Demo login script
        function runDemoLogin() {
            try {
                log('🔐 Starting demo login...', 'info');
                
                // First, let's see what inputs we have
                const inputs = window.testApi.get('input');
                log('Found ' + inputs.length + ' input fields on page', 'info');
                
                if (inputs.length === 0) {
                    log('❌ No input fields found! Try clicking Debug Elements to see page structure', 'error');
                    return;
                }
                
                // Log all inputs
                inputs.forEach((input, idx) => {
                    const id = input.getAttribute('id') || '(none)';
                    const type = input.getAttribute('type') || 'text';
                    log('  Input ' + idx + ': id="' + id + '" type="' + type + '"', 'info');
                });
                
                // Try to find username field - try different selectors
                let usernameInput = null;
                let usernameSelector = null;
                
                // Method 1: Look for text input
                const textInputs = window.testApi.get('input[type="text"]');
                if (textInputs.length > 0) {
                    usernameInput = textInputs[0];
                    usernameSelector = 'input[type="text"]';
                    log('✓ Found username field: input[type="text"]', 'success');
                } else {
                    log('❌ No text input found', 'error');
                    return;
                }
                
                // Fill username
                if (usernameInput) {
                    // Focus first
                    usernameInput.focus();
                    
                    // Clear any existing value
                    usernameInput.value = '';
                    usernameInput.dispatchEvent(new Event('focus', { bubbles: true }));
                    
                    // Simulate typing with keyboard events
                    const username = 'standard_user';
                    for (let i = 0; i < username.length; i++) {
                        const char = username[i];
                        usernameInput.value += char;
                        usernameInput.dispatchEvent(new KeyboardEvent('keydown', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                        usernameInput.dispatchEvent(new KeyboardEvent('keypress', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
                        usernameInput.dispatchEvent(new KeyboardEvent('keyup', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                    }
                    
                    usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
                    usernameInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    log('✓ Username entered: standard_user', 'success');
                }
                
                // Find password field
                const passwordInputs = window.testApi.get('input[type="password"]');
                if (passwordInputs.length > 0) {
                    const passwordInput = passwordInputs[0];
                    
                    // Focus first
                    passwordInput.focus();
                    
                    // Clear any existing value
                    passwordInput.value = '';
                    passwordInput.dispatchEvent(new Event('focus', { bubbles: true }));
                    
                    // Simulate typing with keyboard events
                    const password = 'secret_sauce';
                    for (let i = 0; i < password.length; i++) {
                        const char = password[i];
                        passwordInput.value += char;
                        passwordInput.dispatchEvent(new KeyboardEvent('keydown', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                        passwordInput.dispatchEvent(new KeyboardEvent('keypress', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                        passwordInput.dispatchEvent(new KeyboardEvent('keyup', { 
                            key: char, 
                            code: char, 
                            bubbles: true 
                        }));
                    }
                    
                    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                    passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    log('✓ Password entered', 'success');
                } else {
                    log('❌ No password field found', 'error');
                    return;
                }
                
                // Find and click login button
                let loginButton = null;
                
                // Try multiple selector strategies
                if (window.testApi.find('#login-button')) {
                    loginButton = window.testApi.find('#login-button');
                    log('✓ Found login button: #login-button', 'info');
                } else if (window.testApi.find('button[type="submit"]')) {
                    loginButton = window.testApi.find('button[type="submit"]');
                    log('✓ Found login button: button[type="submit"]', 'info');
                } else {
                    const allButtons = window.testApi.get('button');
                    if (allButtons.length > 0) {
                        loginButton = allButtons[0];
                        log('✓ Found login button: first button on page', 'info');
                    }
                }
                
                if (!loginButton) {
                    log('❌ No login button found', 'error');
                    return;
                }
                
                // Simulate click with proper events
                loginButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                loginButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                loginButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                
                // Also try direct click method
                loginButton.click();
                
                // Try to trigger form submit if button is in a form
                if (loginButton.form) {
                    loginButton.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    log('✓ Form submit triggered', 'info');
                }
                
                log('✓ Login button clicked, waiting for navigation...', 'success');
                
                // Check result after 3 seconds
                setTimeout(() => {
                    const url = window.testApi.url();
                    const title = window.testApi.title();
                    
                    if (url.includes('inventory') || title.includes('Swag')) {
                        log('✨ Login successful! Welcome to ' + title, 'success');
                    } else {
                        log('⚠️  Navigation happened. Current URL: ' + url, 'info');
                    }
                }, 3000);
                
            } catch (error) {
                log('❌ Error: ' + error.message, 'error');
            }
        }
        
        // Debug function to show page elements
        function debugPageElements() {
            try {
                log('🔍 Scanning page elements...', 'info');
                
                // Find all inputs
                const inputs = window.testApi.get('input');
                log('Found ' + inputs.length + ' input fields', 'info');
                
                inputs.forEach((input, idx) => {
                    const id = input.getAttribute('id') || 'N/A';
                    const name = input.getAttribute('name') || 'N/A';
                    const type = input.getAttribute('type') || 'N/A';
                    const dataTest = input.getAttribute('data-test') || 'N/A';
                    log('  [' + idx + '] id="' + id + '" name="' + name + '" type="' + type + '" data-test="' + dataTest + '"', 'info');
                });
                
                // Find all buttons
                const buttons = window.testApi.get('button');
                log('Found ' + buttons.length + ' buttons', 'info');
                
                buttons.forEach((btn, idx) => {
                    const id = btn.getAttribute('id') || 'N/A';
                    const text = btn.textContent.trim() || 'N/A';
                    const dataTest = btn.getAttribute('data-test') || 'N/A';
                    log('  [' + idx + '] id="' + id + '" text="' + text + '" data-test="' + dataTest + '"', 'info');
                });                
            } catch (error) {
                log('❌ Error: ' + error.message, 'error');
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
