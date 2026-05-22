/**
 * Control Panel - Tx HTML UI
 */

export function generateControlPanelHTML(proxyUrl: string, controlPanelPort: number = 3000, viewport?: { width: number; height: number }, testMode?: boolean, snapshot?: boolean, grep?: RegExp, actionTimeout?: number, expectTimeout?: number, testTimeout?: number): string {
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

        .tx-stop-btn {
            display: none;
            align-items: center;
            gap: 6px;
            padding: 5px 14px;
            background: transparent;
            color: var(--fail);
            border: 1px solid var(--fail);
            border-radius: var(--radius);
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.12s;
            letter-spacing: 0.1px;
        }
        .tx-stop-btn:hover  { background: var(--fail-bg); }
        .tx-stop-btn:disabled { opacity: 0.5; cursor: not-allowed; }

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
        .tx-status-dot.ready        { background: var(--jade); box-shadow: 0 0 5px var(--jade); }
        .tx-status-dot.running      { background: var(--warn); animation: tx-pulse 0.9s ease-in-out infinite; }
        .tx-status-dot.passed       { background: var(--pass); }
        .tx-status-dot.failed       { background: var(--fail); }
        .tx-status-dot.connected    { background: var(--jade); box-shadow: 0 0 5px var(--jade); }
        .tx-status-dot.disconnected { background: var(--fail); box-shadow: 0 0 5px var(--fail); }

        @keyframes tx-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }

        /* ══ 3-column body ════════════════════════════════════════════════ */

        .tx-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        /* ══ Specs panel ══════════════════════════════════════════════════ */

        .tx-specs {
            width: 400px;
            flex-shrink: 0;
            background: var(--bg-panel);
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

        .tx-filter-bar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }

        .tx-filter-input {
            flex: 1;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: 5px;
            padding: 4px 8px;
            font-size: 12px;
            color: var(--text);
            outline: none;
            transition: border-color 0.15s;
            min-width: 0;
        }
        .tx-filter-input::placeholder { color: var(--text-muted); }
        .tx-filter-input:focus { border-color: var(--jade); }

        .tx-filter-run-btn {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
            border-radius: 4px;
            background: var(--jade);
            border: none;
            color: #000;
            font-size: 8px;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            transition: opacity 0.15s;
        }
        .tx-filter-run-btn:hover { opacity: 0.8; }
        .tx-filter-run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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
            padding: 6px 10px 6px 6px;
            gap: 5px;
            cursor: pointer;
            user-select: none;
            transition: background 0.1s, border-color 0.1s;
            border-left: 2px solid transparent;
        }
        .tx-spec-hdr:hover { background: var(--bg-hover); }
        .tx-spec-card.active .tx-spec-hdr { background: var(--bg-active); }
        .tx-spec-card.open .tx-spec-hdr { border-left-color: var(--jade); }

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
            font-size: 11px;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            letter-spacing: 0.1px;
        }
        .tx-spec-filename .ext { color: var(--text-muted); }
        .tx-spec-filename .tx-spec-dir { color: var(--text-muted); }

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
        .tx-spec-body { display: none; padding: 0 0 6px; border-bottom: 1px solid var(--border); }
        .tx-spec-card.open .tx-spec-body { display: block; }
        .tx-spec-card:not(.open) + .tx-spec-card { border-top: 1px solid var(--border); }

        .tx-suite-row {
            display: flex;
            align-items: center;
            padding: 5px 10px 3px 10px;
            gap: 5px;
            margin-top: 2px;
            cursor: pointer;
            user-select: none;
        }
        .tx-suite-row:hover { background: var(--bg-hover); }
        .tx-suite-chevron {
            width: 12px;
            font-size: 10px;
            color: var(--text-muted);
            transition: transform 0.14s;
            flex-shrink: 0;
            text-align: center;
            transform: rotate(90deg);
        }
        .tx-suite-row.collapsed .tx-suite-chevron { transform: rotate(0deg); }
        .tx-suite-name {
            flex: 1;
            font-size: 11px;
            color: var(--text-dim);
            font-weight: 700;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .tx-suite-run-btn {
            width: 20px;
            height: 20px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 4px;
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
        .tx-suite-row:hover .tx-suite-run-btn { opacity: 1; border-color: var(--jade); color: var(--jade); }

        .tx-test-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .tx-test-tags { display: flex; gap: 3px; flex-shrink: 0; }
        .tx-test-tag {
            font-size: 10px;
            font-weight: 500;
            padding: 1px 5px;
            border-radius: 3px;
            background: rgba(0, 208, 132, 0.12);
            color: var(--jade);
            letter-spacing: 0.01em;
            white-space: nowrap;
        }
        .tx-test-run-btn {
            width: 20px;
            height: 20px;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 4px;
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
        .tx-test-item:hover .tx-test-run-btn { opacity: 1; border-color: var(--jade); color: var(--jade); }

        .tx-test-chevron {
            width: 10px;
            font-size: 9px;
            color: var(--text-muted);
            transition: transform 0.14s, color 0.14s;
            flex-shrink: 0;
            text-align: center;
        }
        .tx-test-item:has(+ .tx-test-log.open) .tx-test-chevron {
            transform: rotate(90deg);
        }

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
            padding: 3px 10px 3px 24px;
            font-size: 12px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 6px;
            transition: color 0.15s, background 0.1s;
            cursor: pointer;
        }
        .tx-test-item:hover { background: var(--bg-hover); }
        .tx-test-item.pass { color: var(--text-dim); }
        .tx-test-item.fail { color: var(--fail); }
        .tx-test-dot {
            width: 12px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
        }
        .tx-state-svg { display: none; }
        .tx-test-dot .tx-state-svg--idle   { display: block; }
        .tx-test-dot.pass .tx-state-svg--idle   { display: none; }
        .tx-test-dot.pass .tx-state-svg--pass   { display: block; color: var(--pass); }
        .tx-test-dot.fail .tx-state-svg--idle   { display: none; }
        .tx-test-dot.fail .tx-state-svg--fail   { display: block; color: var(--fail); }
        .tx-test-dot.running .tx-state-svg--idle    { display: none; }
        .tx-test-dot.running .tx-state-svg--running { display: block; color: var(--warn); animation: tx-dot-pulse 0.7s ease-in-out infinite; }
        @keyframes tx-dot-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.2; }
        }

        #testRunnerStatus {
            flex-shrink: 0;
            border-top: 1px solid var(--border);
            padding: 7px 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
            min-height: 32px;
        }
        #testRunnerStatus:empty { display: none; }
        .tx-runner-pass { color: var(--pass); }
        .tx-runner-fail { color: var(--fail); }

        /* ══ Resize handles ══════════════════════════════════════════════ */

        .tx-resize-handle {
            width: 8px;
            flex-shrink: 0;
            cursor: col-resize;
            position: relative;
            display: flex;
            align-items: stretch;
            justify-content: center;
        }
        .tx-resize-handle::before {
            content: '';
            width: 1px;
            background: var(--border);
            transition: background 0.15s, width 0.1s;
        }
        .tx-resize-handle:hover::before,
        .tx-resize-handle.dragging::before { background: var(--jade); width: 2px; }

        /* ══ Inline test log ═════════════════════════════════════════════ */

        .tx-test-log {
            display: none;
            background: var(--bg-app);
            border-bottom: 1px solid var(--border);
            overflow: hidden;
        }
        .tx-test-log.open { display: block; }

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
        .tx-cmd.pending { border-left-color: var(--warn); }
        .tx-cmd.info { border-left-color: transparent; }

        .tx-cmd-icon {
            font-size: 9px;
            width: 13px;
            text-align: center;
            flex-shrink: 0;
        }
        .tx-cmd-icon.pass { color: var(--pass); }
        .tx-cmd-icon.fail { color: var(--fail); }
        .tx-cmd-icon.pending { color: var(--warn); }
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
        .tx-cmd-label.pending { color: var(--warn); }
        .tx-cmd-label.info { color: var(--text-muted); }

        .tx-cmd-msg {
            flex: 1;
            color: var(--text);
            word-break: break-word;
        }
        .tx-cmd.pending .tx-cmd-msg { color: var(--text-dim); }
        .tx-cmd.info .tx-cmd-msg { color: var(--text-dim); }

        .tx-cmd-dur {
            font-size: 10px;
            color: var(--text-muted);
            flex-shrink: 0;
            width: 10%;
        }

        .tx-cmd-stack {
            margin: 0 10px 4px 29px;
            padding: 6px 8px;
            font-family: var(--font-mono);
            font-size: 10px;
            line-height: 1.6;
            color: var(--fail);
            background: color-mix(in srgb, var(--fail) 8%, transparent);
            border-left: 2px solid var(--fail);
            border-radius: 0 3px 3px 0;
            white-space: pre-wrap;
            word-break: break-all;
        }

        /* test-result error rows (tx-cmd--result) */
        .tx-cmd--result { align-items: center; padding: 2px 10px 2px 0; gap: 0; }
        .tx-cmd-num {
            width: 30px;
            text-align: right;
            padding-right: 6px;
            font-size: 10px;
            color: var(--text-muted);
            flex-shrink: 0;
        }
        .tx-cmd-pin {
            flex: 1;
            display: flex;
            align-items: baseline;
            gap: 6px;
            min-width: 0;
        }
        .tx-cmd-method {
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.3px;
            flex-shrink: 0;
            min-width: 42px;
            text-align: right;
            border-radius: 3px;
            padding: 1px 4px;
        }
        .tx-cmd-method--pass { color: var(--pass); background: color-mix(in srgb, var(--pass) 12%, transparent); }
        .tx-cmd-method--fail { color: var(--fail); background: color-mix(in srgb, var(--fail) 12%, transparent); }
        .tx-cmd-method--child { color: var(--text-muted); background: var(--bg-card); }
        .tx-cmd-msg--error { color: var(--fail); }

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

        .tx-browser-tabs {
            display: flex;
            gap: 4px;
            margin-left: auto;
        }

        .tx-browser-tab {
            padding: 6px 10px;
            border-radius: var(--radius);
            border: 1px solid var(--border-s);
            background: var(--bg-card);
            color: var(--text-dim);
            cursor: pointer;
            font-size: 11px;
            transition: all 0.1s;
        }
        .tx-browser-tab:hover { background: var(--bg-hover); color: var(--text); }
        .tx-browser-tab.active { background: var(--jade-bg); color: var(--jade); border-color: var(--jade); }

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

        .tx-snapshot-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px;
            background: var(--bg-panel);
            border-bottom: 1px solid var(--border);
        }
        .tx-snapshot-header-meta {
            min-width: 0;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            overflow: hidden;
        }
        .tx-snapshot-header-text {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            overflow: hidden;
        }
        .tx-snapshot-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--text);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-snapshot-url {
            font-size: 11px;
            color: var(--text-muted);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-snapshot-close-btn {
            border: 1px solid var(--border-s);
            background: transparent;
            color: var(--text);
            border-radius: var(--radius);
            padding: 6px 10px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }
        .tx-snapshot-close-btn:hover {
            background: var(--bg-hover);
        }
        #snapshotViewportWrapper {
            flex: 1;
            overflow: hidden;
            background: var(--bg-app);
            position: relative;
        }
        #snapshotFrame {
            background: #fff;
            width: 100%;
            height: 100%;
        }
        .tx-cmd.has-snapshot {
            cursor: pointer;
        }
        .tx-cmd.has-snapshot:hover {
            background: var(--bg-hover);
        }
        .tx-cmd-snapshot-badge {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--jade);
            flex-shrink: 0;
            align-self: center;
            box-shadow: 0 0 0 2px var(--jade-bg);
        }

        .tx-browser-main {
            flex: 1;
            display: flex;
            position: relative;
            overflow: hidden;
        }
        .tx-browser-pane {
            flex: 1;
            min-width: 0;
            background: var(--bg-app);
            overflow: hidden;
            position: relative;
            display: flex;
            flex-direction: column;
        }
        .tx-browser-pane--hidden { display: none; }
        #iframe-container { flex: 1; overflow: hidden; background: var(--bg-app); position: relative; }
        .tx-time-travel-summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 0;
        }
        .tx-time-travel-open {
            border: 1px solid var(--border-s);
            background: transparent;
            color: var(--text-dim);
            border-radius: var(--radius);
            padding: 5px 10px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.1s;
        }
        .tx-time-travel-open:hover { background: var(--bg-hover); color: var(--text); }
        .tx-time-travel-open:disabled { opacity: 0.5; cursor: not-allowed; }
        iframe { width: 100%; height: 100%; border: none; display: block; }

        .tx-empty {
            padding: 24px 14px;
            text-align: center;
            color: var(--text-muted);
            font-size: 11px;
            line-height: 1.6;
        }

        /* ══ Network panel ═══════════════════════════════════════════ */

        .tx-network-toggle-btn {
            padding: 4px 10px;
            background: transparent;
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.1s;
            flex-shrink: 0;
        }
        .tx-network-toggle-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--jade); }
        .tx-network-toggle-btn.active { background: var(--jade-bg); color: var(--jade); border-color: var(--jade); }

        .tx-network {
            display: none;
            flex-direction: column;
            background: var(--bg-panel);
            flex-shrink: 0;
            overflow: hidden;
            height: 200px;
        }
        .tx-network.open { display: flex; }

        .tx-network-resize-handle {
            height: 6px;
            flex-shrink: 0;
            cursor: row-resize;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .tx-network-resize-handle::before {
            content: '';
            height: 1px;
            width: 100%;
            background: var(--border);
            transition: background 0.15s, height 0.1s;
        }
        .tx-network-resize-handle:hover::before,
        .tx-network-resize-handle.dragging::before { background: var(--jade); height: 2px; }

        .tx-devtools-tabs {
            display: flex;
            align-items: stretch;
            background: var(--bg-topbar);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            padding: 0 6px;
            gap: 2px;
        }
        .tx-devtools-tab {
            padding: 5px 10px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            margin-bottom: -1px;
            transition: color 0.1s;
            flex-shrink: 0;
        }
        .tx-devtools-tab:hover { color: var(--text); }
        .tx-devtools-tab.active { color: var(--text); border-bottom-color: var(--jade); }
        .tx-devtools-tab-count {
            font-size: 9px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 8px;
            background: var(--bg-card);
            color: var(--text-muted);
            min-width: 18px;
            text-align: center;
        }
        .tx-devtools-tab-count.has-errors { background: var(--fail-bg); color: var(--fail); }
        .tx-devtools-tab-count:empty { display: none; }
        .tx-devtools-spacer { flex: 1; }
        .tx-network-clear-btn {
            padding: 2px 8px;
            align-self: center;
            background: transparent;
            border: 1px solid var(--border-s);
            border-radius: 3px;
            color: var(--text-dim);
            font-size: 11px;
            cursor: pointer;
            transition: all 0.1s;
            flex-shrink: 0;
        }
        .tx-network-clear-btn:hover { background: var(--bg-hover); color: var(--text); }

        .tx-devtab-content { display: none; flex: 1; overflow: hidden; flex-direction: column; }
        .tx-devtab-content.active { display: flex; }

        .tx-console-body {
            flex: 1;
            overflow-y: auto;
            font-family: var(--font-mono);
            font-size: 11px;
        }
        .tx-console-body::-webkit-scrollbar { width: 3px; }
        .tx-console-body::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-console-row {
            display: flex;
            align-items: baseline;
            padding: 2px 10px;
            gap: 8px;
            line-height: 1.6;
            border-bottom: 1px solid var(--border);
            border-left: 2px solid transparent;
            cursor: default;
            transition: background 0.08s;
        }
        .tx-console-row:hover { background: var(--bg-hover); }
        .tx-console-row.log   { color: var(--text-dim); }
        .tx-console-row.debug { color: var(--text-muted); }
        .tx-console-row.info  { color: #60a5fa; border-left-color: #60a5fa; }
        .tx-console-row.warning { color: var(--warn); background: rgba(245,158,11,0.05); border-left-color: var(--warn); }
        .tx-console-row.error,
        .tx-console-row.pageerror { color: var(--fail); background: var(--fail-bg); border-left-color: var(--fail); }
        .tx-console-row.trace { color: var(--text-muted); }

        .tx-con-level {
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            flex-shrink: 0;
            min-width: 40px;
        }
        .tx-con-text {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: pre;
            min-width: 0;
        }
        .tx-con-url {
            font-size: 10px;
            color: var(--text-muted);
            flex-shrink: 0;
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .tx-network-header {
            display: grid;
            grid-template-columns: 60px 50px 46px 1fr 62px;
            padding: 2px 10px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border);
            background: var(--bg-topbar);
            flex-shrink: 0;
        }

        .tx-network-content {
            flex: 1;
            display: flex;
            overflow: hidden;
        }

        .tx-network-list {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            flex: 1;
            min-width: 180px;
        }

        .tx-network-body {
            flex: 1;
            overflow-y: auto;
        }
        .tx-network-body::-webkit-scrollbar { width: 3px; }
        .tx-network-body::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-network-detail {
            display: none;
            width: 65%;
            min-width: 240px;
            flex-shrink: 0;
            border-left: 1px solid var(--border);
            background: var(--bg-app);
            flex-direction: column;
            overflow: hidden;
        }
        .tx-network-detail.open { display: flex; }

        .tx-network-detail-toolbar {
            display: flex;
            align-items: center;
            padding: 4px 8px 4px 10px;
            background: var(--bg-topbar);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            gap: 6px;
        }
        .tx-network-detail-title {
            flex: 1;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: var(--text-dim);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-network-detail-close {
            width: 18px;
            height: 18px;
            border-radius: 3px;
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 14px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.1s;
        }
        .tx-network-detail-close:hover { background: var(--fail-bg); color: var(--fail); }

        .tx-network-detail-body {
            flex: 1;
            overflow-y: auto;
            padding-bottom: 12px;
        }
        .tx-network-detail-body::-webkit-scrollbar { width: 3px; }
        .tx-network-detail-body::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-nd-section { border-bottom: 1px solid var(--border); padding: 5px 0; }
        .tx-nd-section-title {
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.7px;
            text-transform: uppercase;
            color: var(--text-muted);
            padding: 3px 10px 4px;
        }
        .tx-nd-row {
            display: flex;
            padding: 1px 10px;
            gap: 8px;
            font-family: var(--font-mono);
            font-size: 10.5px;
            line-height: 1.55;
            min-width: 0;
        }
        .tx-nd-row:hover { background: var(--bg-card); }
        .tx-nd-key {
            color: var(--text-muted);
            flex-shrink: 0;
            width: 20%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-nd-val {
            color: var(--text);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
        }
        .tx-nd-val.wrap { white-space: pre-wrap; word-break: break-all; }
        .tx-nd-pre {
            margin: 3px 10px;
            padding: 6px 8px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 3px;
            font-family: var(--font-mono);
            font-size: 10px;
            line-height: 1.5;
            color: var(--text-dim);
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 180px;
            overflow-y: auto;
        }
        .tx-nd-pre::-webkit-scrollbar { width: 3px; }
        .tx-nd-pre::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-network-row.selected { background: var(--bg-active); }

        .tx-network-row {
            display: grid;
            grid-template-columns: 60px 50px 46px 1fr 62px;
            padding: 2px 10px;
            font-family: var(--font-mono);
            font-size: 11px;
            line-height: 1.6;
            color: var(--text-dim);
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: background 0.08s;
        }
        .tx-network-row:hover { background: var(--bg-hover); }
        .tx-network-row.selected { background: var(--bg-active); }
        .tx-network-row.pending { opacity: 0.55; }
        .tx-network-row.failed .tx-net-url { color: var(--fail); }

        .tx-net-method {
            font-weight: 700;
            font-size: 10px;
            color: var(--jade);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-net-status {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-net-status.ok       { color: var(--pass); }
        .tx-net-status.redirect { color: var(--warn); }
        .tx-net-status.error    { color: var(--fail); }
        .tx-net-type {
            font-size: 10px;
            color: var(--text-muted);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tx-net-url {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--text);
            min-width: 0;
        }
        .tx-net-dur {
            text-align: right;
            color: var(--text-muted);
            white-space: nowrap;
        }
        .tx-empty-network {
            padding: 18px 14px;
            text-align: center;
            color: var(--text-muted);
            font-size: 11px;
        }

        /* ══ Selector playground ═════════════════════════════════════ */

        .tx-selector-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 12px 14px;
            gap: 8px;
            overflow: auto;
        }

        .tx-selector-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tx-selector-input {
            flex: 1;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            color: var(--text);
            font-family: var(--font-mono);
            font-size: 12px;
            padding: 6px 10px;
            outline: none;
            transition: border-color 0.15s;
        }
        .tx-selector-input:focus { border-color: var(--jade); }
        .tx-selector-input.error { border-color: var(--fail); }

        .tx-selector-clear-btn {
            padding: 5px 11px;
            background: var(--bg-card);
            border: 1px solid var(--border-s);
            border-radius: var(--radius);
            color: var(--text-dim);
            font-size: 12px;
            cursor: pointer;
            transition: background 0.12s, color 0.12s;
            flex-shrink: 0;
        }
        .tx-selector-clear-btn:hover { background: var(--bg-hover); color: var(--text); }

        .tx-selector-status {
            font-size: 11px;
            color: var(--text-dim);
            min-height: 16px;
        }
        .tx-selector-status.match { color: var(--jade); }
        .tx-selector-status.error { color: var(--fail); }
        .tx-selector-status.zero  { color: var(--warn); }

        .tx-selector-matches {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .tx-selector-matches::-webkit-scrollbar { width: 3px; }
        .tx-selector-matches::-webkit-scrollbar-thumb { background: var(--border-s); }

        .tx-selector-match-item {
            display: flex;
            align-items: baseline;
            gap: 6px;
            padding: 4px 8px;
            background: var(--bg-card);
            border-radius: var(--radius);
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-dim);
            cursor: pointer;
            transition: background 0.1s;
        }
        .tx-selector-match-item:hover { background: var(--bg-hover); color: var(--text); }

        .tx-selector-match-idx {
            color: var(--text-muted);
            font-size: 10px;
            min-width: 18px;
            flex-shrink: 0;
        }
        .tx-selector-match-tag  { color: var(--jade); }
        .tx-selector-match-id   { color: #a78bfa; }
        .tx-selector-match-cls  { color: #60a5fa; }
        .tx-selector-match-text { color: var(--text-dim); margin-left: 4px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
        <button class="tx-stop-btn" id="stopBtn" onclick="window.stopExecution && window.stopExecution()">
            &#9632;&nbsp; Stop
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
            <div class="tx-filter-bar">
                <input type="text" id="testFilter" class="tx-filter-input" placeholder="Filter tests…" oninput="window.applyFilter && window.applyFilter(this.value)" autocomplete="off" spellcheck="false">
                <button class="tx-filter-run-btn" id="filterRunBtn" onclick="window.runFiltered && window.runFiltered()" title="Run filtered tests">&#9654;</button>
            </div>
            <div class="tx-specs-scroll" id="testList">
                <div class="tx-empty">Loading specs…</div>
            </div>
            <div id="testRunnerStatus"></div>
        </nav>

        <div class="tx-resize-handle" id="specsResizer"></div>

        <!-- ── Browser ───────────────────────────────────────────── -->
        <main class="tx-browser">
            <div class="tx-browser-toolbar">
                <button class="tx-nav-btn" onclick="window.testApi && window.testApi.reload()" title="Reload">&#8635;</button>
                <div class="tx-url-bar">
                    <input type="text" id="navUrl" class="tx-url-input" placeholder="Enter URL…" value="">
                    <button class="tx-go-btn" onclick="window.testApi && window.testApi.visit(document.getElementById('navUrl').value)">Go</button>
                </div>
                <span class="tx-viewport-tag" id="viewportTag">—</span>
                <button class="tx-network-toggle-btn" id="networkToggleBtn" onclick="window.toggleNetworkPanel && window.toggleNetworkPanel()" title="Toggle DevTools panel">DevTools <span id="consoleErrorBadge" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;background:var(--fail-bg);color:var(--fail);display:none"></span></button>
            </div>
            <div class="tx-tab-bar" id="tabBar"></div>
            <div class="tx-browser-main">
                <div class="tx-browser-pane" id="liveBrowserPane">
                    <div id="iframe-container"></div>
                </div>
                <div class="tx-browser-pane tx-browser-pane--hidden" id="snapshotPane">
                    <div class="tx-snapshot-header">
                        <div class="tx-snapshot-header-meta">
                            <div class="tx-snapshot-header-text">
                                <div class="tx-snapshot-title" id="snapshotTitle">Snapshot</div>
                                <div class="tx-snapshot-url" id="snapshotUrl"></div>
                            </div>
                            <span class="tx-viewport-tag" id="snapshotViewportTag">—</span>
                        </div>
                        <button class="tx-snapshot-close-btn" onclick="window.setBrowserView && window.setBrowserView('browser')" title="Return to browser">Close</button>
                    </div>
                    <div id="snapshotViewportWrapper">
                        <iframe id="snapshotFrame" sandbox="allow-same-origin"></iframe>
                    </div>
                </div>
            </div>
            <div class="tx-network" id="networkPanel">
                <div class="tx-network-resize-handle" id="networkResizeHandle"></div>
                <div class="tx-devtools-tabs">
                    <button class="tx-devtools-tab active" id="devTabNetwork" onclick="window.switchDevTab && window.switchDevTab('network')">Network <span class="tx-devtools-tab-count" id="networkCount"></span></button>
                    <button class="tx-devtools-tab" id="devTabConsole" onclick="window.switchDevTab && window.switchDevTab('console')">Console <span class="tx-devtools-tab-count" id="consoleCount"></span></button>
                    <button class="tx-devtools-tab" id="devTabSelector" onclick="window.switchDevTab && window.switchDevTab('selector')">Selector</button>
                    <div class="tx-devtools-spacer"></div>
                    <button class="tx-network-clear-btn" id="devClearBtn" onclick="window.clearDevTab && window.clearDevTab()">Clear</button>
                </div>
                <div class="tx-devtab-content active" id="devTabContentNetwork">
                    <div class="tx-network-content">
                        <div class="tx-network-list">
                            <div class="tx-network-header">
                                <span>Method</span>
                                <span>Status</span>
                                <span>Type</span>
                                <span>URL</span>
                                <span>Duration</span>
                            </div>
                            <div class="tx-network-body" id="networkList">
                                <div class="tx-empty-network">No requests yet</div>
                            </div>
                        </div>
                        <div class="tx-network-detail" id="networkDetail">
                            <div class="tx-network-detail-toolbar">
                                <span class="tx-network-detail-title" id="networkDetailTitle">Details</span>
                                <button class="tx-network-detail-close" onclick="window.closeNetworkDetail && window.closeNetworkDetail()" title="Close">×</button>
                            </div>
                            <div class="tx-network-detail-body" id="networkDetailBody"></div>
                        </div>
                    </div>
                </div>
                <div class="tx-devtab-content" id="devTabContentConsole">
                    <div class="tx-console-body" id="consoleList">
                        <div class="tx-empty-network">No console output yet</div>
                    </div>
                </div>
                <div class="tx-devtab-content" id="devTabContentSelector">
                    <div class="tx-selector-body">
                        <div class="tx-selector-row">
                            <input type="text" id="selectorInput" class="tx-selector-input" placeholder="CSS selector, e.g. button.primary" autocomplete="off" spellcheck="false" oninput="window.runSelectorQuery && window.runSelectorQuery(this.value)">
                            <button class="tx-selector-clear-btn" onclick="window.clearSelectorQuery && window.clearSelectorQuery()">Clear</button>
                        </div>
                        <div class="tx-selector-status" id="selectorStatus"></div>
                        <div class="tx-selector-matches" id="selectorMatches"></div>
                    </div>
                </div>
            </div>
        </main>

    </div>

    <script>
        window.__CONFIG__ = {
            proxyUrl: "${proxyUrl}",
            port: ${controlPanelPort}${viewport ? `,\n            viewport: { width: ${viewport.width}, height: ${viewport.height} }` : ''}${testMode ? `,\n            autorun: true` : ''}${snapshot ? `,\n            snapshot: true` : ''}${grep ? `,\n            grep: ${JSON.stringify(grep.source)},\n            grepFlags: ${JSON.stringify(grep.flags)}` : ''}${actionTimeout != null ? `,\n            actionTimeout: ${actionTimeout}` : ''}${expectTimeout != null ? `,\n            expectTimeout: ${expectTimeout}` : ''}${testTimeout != null ? `,\n            testTimeout: ${testTimeout}` : ''}
        };
    </script>
    <script src="/controller.js"></script>
</body>
</html>`;
}
