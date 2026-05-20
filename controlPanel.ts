/**
 * Control Panel - Cypress-inspired HTML UI
 */

export function generateControlPanelHTML(proxyUrl: string, targetUrl: string, controlPanelPort: number = 3000): string {
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

        /* ══ Topbar ════════════════════════════════════════════════════════ */

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

        /* ══ 3-column body ════════════════════════════════════════════════ */

        .cy-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* ══ Specs panel ══════════════════════════════════════════════════ */

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
        .cy-suite-badges { display: flex; gap: 3px; flex-shrink: 0; }

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

        .cy-test-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cy-test-run-btn {
            padding: 0px 5px;
            font-size: 8px;
            background: transparent;
            border: 1px solid var(--border-s);
            border-radius: 3px;
            color: var(--text-muted);
            cursor: pointer;
            flex-shrink: 0;
            opacity: 0;
            transition: opacity 0.1s, color 0.1s, border-color 0.1s;
        }
        .cy-test-item:hover .cy-test-run-btn { opacity: 1; color: var(--jade); border-color: var(--jade); }

        .cy-test-badge {
            font-size: 9px;
            font-weight: 600;
            padding: 1px 5px;
            border-radius: 3px;
            flex-shrink: 0;
            letter-spacing: 0.02em;
        }
        .cy-test-badge.pass { background: rgba(34,197,94,0.15); color: var(--pass); }
        .cy-test-badge.fail { background: rgba(239,68,68,0.15);  color: var(--fail); }

        .cy-test-item {
            padding: 2px 10px 2px 36px;
            font-size: 11px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 6px;
            transition: color 0.15s;
        }
        .cy-test-item.pass { color: var(--text-dim); }
        .cy-test-item.fail { color: var(--fail); }
        .cy-test-dot {
            width: 10px;
            font-size: 9px;
            line-height: 1;
            flex-shrink: 0;
            text-align: center;
            color: var(--text-muted);
            transition: color 0.15s;
        }
        .cy-test-dot::before { content: '–'; }
        .cy-test-dot.running { color: var(--warn); animation: cy-dot-pulse 0.7s ease-in-out infinite; }
        .cy-test-dot.running::before { content: '●'; }
        .cy-test-dot.pass { color: var(--pass); }
        .cy-test-dot.pass::before { content: '✓'; }
        .cy-test-dot.fail { color: var(--fail); }
        .cy-test-dot.fail::before { content: '✕'; }
        @keyframes cy-dot-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.2; }
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

        /* ══ Command log ══════════════════════════════════════════════════ */

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

        /* ══ Browser panel ════════════════════════════════════════════════ */

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
            <span class="cy-logo-name">cypress‑safari</span>
        </div>
        <div class="cy-topbar-div"></div>
        <button class="cy-run-all-btn" id="runAllBtn" onclick="window.runAll && window.runAll()">
            &#9654;&nbsp; Run all specs
        </button>
        <div class="cy-topbar-right">
            <div class="cy-status-pill">
                <span class="cy-status-dot" id="statusIndicator"></span>
                <span id="statusText">Initializing…</span>
            </div>
        </div>
    </header>

    <div class="cy-body">

        <!-- ── Specs ──────────────────────────────────────────────── -->
        <nav class="cy-specs">
            <div class="cy-panel-hdr">Specs</div>
            <div class="cy-specs-scroll" id="testList">
                <div class="cy-empty">Loading specs…</div>
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

        <!-- ── Command Log ────────────────────────────────────────── -->
        <aside class="cy-log-panel">
            <div class="cy-log-hdr">
                <span class="cy-log-title">Command Log</span>
                <button class="cy-log-clear" onclick="document.getElementById('console').innerHTML=''">Clear</button>
            </div>
            <div id="console"></div>
        </aside>

        <!-- ── Browser ───────────────────────────────────────────── -->
        <main class="cy-browser">
            <div class="cy-browser-toolbar">
                <button class="cy-nav-btn" onclick="window.testApi && window.testApi.reload()" title="Reload">&#8635;</button>
                <div class="cy-url-bar">
                    <input type="text" id="navUrl" class="cy-url-input" placeholder="Enter URL…" value="${targetUrl}">
                    <button class="cy-go-btn" onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                </div>
                <span class="cy-viewport-tag" id="viewportTag">—</span>
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
