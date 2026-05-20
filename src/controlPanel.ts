/**
 * Control Panel - Tx HTML UI
 */

export function generateControlPanelHTML(proxyUrl: string, controlPanelPort: number = 3000, viewport?: { width: number; height: number }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>tx</title>
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

        .tx-topbar {
            height: 44px;
            background: var(--bg-topbar);
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            padding: 0 14px;
            gap: 10px;
            flex-shrink: 0;
        }

        .tx-logo {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tx-logo-mark {
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

        .tx-logo-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            letter-spacing: 0.1px;
        }

        .tx-topbar-div {
            width: 1px;
            height: 20px;
            background: var(--border-s);
            flex-shrink: 0;
        }

        .tx-run-all-btn {
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

        .tx-run-all-btn:hover  { background: #00c07a; box-shadow: 0 0 12px var(--jade-glow); }
        .tx-run-all-btn:active { background: #00a96c; }
        .tx-run-all-btn:disabled {
            background: var(--bg-card);
            color: var(--text-muted);
            cursor: not-allowed;
            box-shadow: none;
        }

        .tx-topbar-right {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tx-status-pill {
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

        .tx-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--text-muted);
            flex-shrink: 0;
            transition: background 0.3s;
        }
        .tx-status-dot.ready   { background: var(--jade); box-shadow: 0 0 5px var(--jade); }
        .tx-status-dot.running { background: var(--warn); animation: tx-pulse 0.9s ease-in-out infinite; }
        .tx-status-dot.passed  { background: var(--pass); }
        .tx-status-dot.failed  { background: var(--fail); }

        @keyframes tx-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }

        /* ══ 3-column body ════════════════════════════════════════════════ */

        .tx-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* ══ Specs panel ══════════════════════════════════════════════════ */

        .tx-specs {
            width: 252px;
            flex-shrink: 0;
            background: var(--bg-panel);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .tx-panel-hdr {
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

        .tx-specs-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .tx-specs-scroll::-webkit-scrollbar { width: 3px; }
        .tx-specs-scroll::-webkit-scrollbar-thumb { background: var(--border-s); border-radius: 2px; }

        /* spec card */
        .tx-spec-card { }

        .tx-spec-hdr {
            display: flex;
            align-items: center;
            padding: 6px 10px 6px 8px;
            gap: 5px;
            cursor: pointer;
            user-select: none;
            transition: background 0.1s;
        }
        .tx-spec-hdr:hover { background: var(--bg-hover); }
        .tx-spec-card.active .tx-spec-hdr { background: var(--bg-active); }

        .tx-spec-chevron {
            width: 12px;
            font-size: 10px;
            color: var(--text-muted);
            transition: transform 0.14s;
            flex-shrink: 0;
            text-align: center;
        }
        .tx-spec-card.open .tx-spec-chevron { transform: rotate(90deg); }

        .tx-spec-filename {
            flex: 1;
            font-family: var(--font-mono);
            font-size: 13.5px;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .tx-suite-badges { display: flex; gap: 3px; flex-shrink: 0; }

        .tx-badge {
            font-size: 12px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 10px;
            line-height: 1.5;
        }
        .tx-badge--pass { background: var(--pass-bg); color: var(--pass); }
        .tx-badge--fail { background: var(--fail-bg); color: var(--fail); }

        .tx-spec-run-btn {
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
        .tx-spec-hdr:hover .tx-spec-run-btn { opacity: 1; border-color: var(--jade); color: var(--jade); }

        /* spec body: suites + test items */
        .tx-spec-body { display: none; padding: 0 0 4px; }
        .tx-spec-card.open .tx-spec-body { display: block; }

        .tx-suite-row {
            display: flex;
            align-items: center;
            padding: 4px 10px 3px 24px;
            gap: 6px;
        }
        .tx-suite-name {
            flex: 1;
            font-size: 13px;
            color: var(--text-dim);
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .tx-suite-run-btn {
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
        .tx-suite-row:hover .tx-suite-run-btn { opacity: 1; color: var(--jade); border-color: var(--jade); }

        .tx-test-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tx-test-run-btn {
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
        .tx-test-item:hover .tx-test-run-btn { opacity: 1; color: var(--jade); border-color: var(--jade); }

        .tx-test-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 1px 5px;
            border-radius: 3px;
            flex-shrink: 0;
            letter-spacing: 0.02em;
        }
        .tx-test-badge.pass { background: rgba(34,197,94,0.15); color: var(--pass); }
        .tx-test-badge.fail { background: rgba(239,68,68,0.15);  color: var(--fail); }

        .tx-test-item {
            padding: 2px 10px 2px 36px;
            font-size: 13px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 6px;
            transition: color 0.15s;
        }
        .tx-test-item.pass { color: var(--text-dim); }
        .tx-test-item.fail { color: var(--fail); }
        .tx-test-dot {
            width: 10px;
            font-size: 9px;
            line-height: 1;
            flex-shrink: 0;
            text-align: center;
            color: var(--text-muted);
            transition: color 0.15s;
        }
        .tx-test-dot::before { content: '–'; }
        .tx-test-dot.running { color: var(--warn); animation: tx-dot-pulse 0.7s ease-in-out infinite; }
        .tx-test-dot.running::before { content: '●'; }
        .tx-test-dot.pass { color: var(--pass); }
        .tx-test-dot.pass::before { content: '✓'; }
        .tx-test-dot.fail { color: var(--fail); }
        .tx-test-dot.fail::before { content: '✕'; }
        @keyframes tx-dot-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.2; }
        }

        /* upload footer */

        #testRunnerStatus {
            font-size: 10px;
            margin-top: 5px;
            color: var(--text-muted);
        }

        /* ══ Command log ══════════════════════════════════════════════════ */

        .tx-log-panel {
            width: 310px;
            flex-shrink: 0;
            background: var(--bg-app);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .tx-log-hdr {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 14px 8px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .tx-log-title {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: var(--text-dim);
        }
        .tx-log-clear {
            font-size: 10px;
            color: var(--text-muted);
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
            transition: all 0.1s;
        }
        .tx-log-clear:hover { background: var(--bg-card); color: var(--text); }

        #console {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0 8px;
        }
        #console::-webkit-scrollbar { width: 3px; }
        #console::-webkit-scrollbar-thumb { background: var(--border-s); border-radius: 2px; }

        /* log entries */
        .tx-cmd {
            display: flex;
            align-items: baseline;
            padding: 3px 14px 3px 10px;
            gap: 6px;
            font-family: var(--font-mono);
            font-size: 11px;
            line-height: 1.55;
            border-left: 2px solid transparent;
        }
        .tx-cmd:hover { background: var(--bg-card); }

        .tx-cmd.pass { border-left-color: var(--pass); }
        .tx-cmd.fail { border-left-color: var(--fail); }
        .tx-cmd.info { border-left-color: transparent; }

        .tx-cmd-icon {
            font-size: 9px;
            width: 13px;
            text-align: center;
            flex-shrink: 0;
        }
        .tx-cmd-icon.pass { color: var(--pass); }
        .tx-cmd-icon.fail { color: var(--fail); }
        .tx-cmd-icon.info { color: var(--text-muted); }

        .tx-cmd-label {
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.3px;
            flex-shrink: 0;
            min-width: 68px;
        }
        .tx-cmd-label.pass { color: var(--pass); }
        .tx-cmd-label.fail { color: var(--fail); }
        .tx-cmd-label.info { color: var(--text-muted); }

        .tx-cmd-msg {
            flex: 1;
            color: var(--text);
            word-break: break-word;
        }
        .tx-cmd.info .tx-cmd-msg { color: var(--text-dim); }

        .tx-cmd-dur {
            font-size: 10px;
            color: var(--text-muted);
            flex-shrink: 0;
        }

        .tx-log-section {
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

        .tx-browser {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #fff;
            overflow: hidden;
            min-width: 0;
        }

        .tx-browser-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            background: var(--bg-panel);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }

        .tx-nav-btn {
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
        .tx-nav-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-s); }

        .tx-url-bar {
            flex: 1;
            display: flex;
            align-items: center;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            overflow: hidden;
            transition: border-color 0.12s;
        }
        .tx-url-bar:focus-within { border-color: var(--jade); }

        .tx-url-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: var(--text);
            font-size: 12px;
            font-family: var(--font-mono);
            padding: 5px 10px;
        }
        .tx-url-input::placeholder { color: var(--text-muted); }

        .tx-go-btn {
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
        .tx-go-btn:hover { background: var(--jade-bg); color: var(--jade); }

        .tx-viewport-tag {
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


        /* ══ Tab bar ══════════════════════════════════════════════════ */

        .tx-tab-bar {
            display: flex;
            align-items: center;
            background: var(--bg-topbar);
            border-bottom: 1px solid var(--border);
            padding: 0 4px;
            height: 32px;
            gap: 2px;
            flex-shrink: 0;
            overflow-x: auto;
        }
        .tx-tab-bar::-webkit-scrollbar { height: 2px; }
        .tx-tab-bar::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-tab-item {
            display: flex; align-items: center; gap: 5px;
            padding: 0 8px 0 10px;
            height: 26px;
            border-radius: var(--radius);
            background: transparent;
            cursor: pointer;
            max-width: 180px;
            min-width: 80px;
            user-select: none;
            transition: background 0.1s;
            flex-shrink: 0;
        }
        .tx-tab-item:hover { background: var(--bg-hover); }
        .tx-tab-item.active { background: var(--bg-active); }

        .tx-tab-title {
            flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-size: 11px; color: var(--text-dim);
        }
        .tx-tab-item.active .tx-tab-title { color: var(--text); }

        .tx-tab-close {
            width: 14px; height: 14px; border-radius: 3px;
            background: transparent; border: none; cursor: pointer;
            color: var(--text-muted); font-size: 10px; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; opacity: 0; transition: opacity 0.1s, background 0.1s;
        }
        .tx-tab-item:hover .tx-tab-close { opacity: 1; }
        .tx-tab-close:hover { background: var(--fail-bg); color: var(--fail); }

        .tx-new-tab-btn {
            width: 24px; height: 24px; border-radius: var(--radius);
            background: transparent; border: 1px solid var(--border-s);
            color: var(--text-muted); font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; transition: all 0.1s; margin-left: 2px;
        }
        .tx-new-tab-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--jade); }

        #iframe-container { flex: 1; overflow: hidden; background: var(--bg-app); position: relative; }
        iframe { width: 100%; height: 100%; border: none; display: block; }

        .tx-empty {
            padding: 24px 14px;
            text-align: center;
            color: var(--text-muted);
            font-size: 11px;
            line-height: 1.6;
        }
    </style>
</head>
<body>

    <header class="tx-topbar">
        <div class="tx-logo">
            <div class="tx-logo-mark">TX</div>
            <span class="tx-logo-name">Test Expert</span>
        </div>
        <div class="tx-topbar-div"></div>
        <button class="tx-run-all-btn" id="runAllBtn" onclick="window.runAll && window.runAll()">
            &#9654;&nbsp; Run all specs
        </button>
        <div class="tx-topbar-right">
            <div class="tx-status-pill">
                <span class="tx-status-dot" id="statusIndicator"></span>
                <span id="statusText">Initializing…</span>
            </div>
        </div>
    </header>

    <div class="tx-body">

        <!-- ── Specs ──────────────────────────────────────────────── -->
        <nav class="tx-specs">
            <div class="tx-panel-hdr">Specs</div>
            <div class="tx-specs-scroll" id="testList">
                <div class="tx-empty">Loading specs…</div>
            </div>
            <div id="testRunnerStatus"></div>
        </nav>

        <!-- ── Command Log ────────────────────────────────────────── -->
        <aside class="tx-log-panel">
            <div class="tx-log-hdr">
                <span class="tx-log-title">Command Log</span>
                <button class="tx-log-clear" onclick="document.getElementById('console').innerHTML=''">Clear</button>
            </div>
            <div id="console"></div>
        </aside>

        <!-- ── Browser ───────────────────────────────────────────── -->
        <main class="tx-browser">
            <div class="tx-browser-toolbar">
                <button class="tx-nav-btn" onclick="window.testApi && window.testApi.reload()" title="Reload">&#8635;</button>
                <div class="tx-url-bar">
                    <input type="text" id="navUrl" class="tx-url-input" placeholder="Enter URL…" value="">
                    <button class="tx-go-btn" onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                </div>
                <span class="tx-viewport-tag" id="viewportTag">—</span>
            </div>
            <div class="tx-tab-bar" id="tabBar"></div>
            <div id="iframe-container"></div>
        </main>

    </div>

    <script>
        window.__CONFIG__ = {
            proxyUrl: "${proxyUrl}",
            port: ${controlPanelPort}${viewport ? `,\n            viewport: { width: ${viewport.width}, height: ${viewport.height} }` : ''}
        };
    </script>
    <script src="/panel.js"></script>
</body>
</html>`;
}
