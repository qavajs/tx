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

        /* ── Test list ─────────────────────────────────── */
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
            content: '·';
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

                    <!-- Parsed test list -->
                    <div id="testList"><div class="test-list-empty">Loading tests…</div></div>

                    <!-- Upload fallback -->
                    <hr class="upload-divider">
                    <div class="upload-label">Upload custom file</div>
                    <div class="upload-row">
                        <input type="file" id="testFileInput" accept=".js">
                        <button onclick="runTestInBrowser()" title="Run in browser" style="padding:4px 8px;font-size:11px;background:#7b1fa2;color:white;border-color:#7b1fa2;">▶</button>
                        <button onclick="runTestOnServer()" title="Run on server" style="padding:4px 8px;font-size:11px;">⬆</button>
                    </div>
                    <div id="testRunnerStatus"></div>
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
