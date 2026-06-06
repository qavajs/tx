import { DEFAULT_CONTROL_PANEL_PORT } from '../constants';
import panelHtml from './controlPanel.html';
import panelCss from './controlPanel.css';

export interface ControlPanelConfig {
    proxyUrl: string;
    controlPanelPort?: number;
    viewport?: { width: number; height: number };
    testMode?: boolean;
    snapshot?: boolean;
    grep?: RegExp;
    actionTimeout?: number;
    expectTimeout?: number;
    testTimeout?: number;
    retries?: number;
}

function buildConfigScript({
  proxyUrl,
  controlPanelPort = DEFAULT_CONTROL_PANEL_PORT,
  viewport,
  testMode,
  snapshot,
  grep,
  actionTimeout,
  expectTimeout,
  testTimeout,
  retries,
}: ControlPanelConfig): string {
  const props: string[] = [
    `proxyUrl: "${proxyUrl}"`,
    `port: ${controlPanelPort}`,
  ];
  if (viewport) props.push(`viewport: { width: ${viewport.width}, height: ${viewport.height} }`);
  if (testMode) props.push(`autorun: true`);
  if (snapshot) props.push(`snapshot: true`);
  if (grep) { props.push(`grep: ${JSON.stringify(grep.source)}`); props.push(`grepFlags: ${JSON.stringify(grep.flags)}`); }
  if (actionTimeout != null) props.push(`actionTimeout: ${actionTimeout}`);
  if (expectTimeout != null) props.push(`expectTimeout: ${expectTimeout}`);
  if (testTimeout != null) props.push(`testTimeout: ${testTimeout}`);
  if (retries != null) props.push(`retries: ${retries}`);
  return `<script>\n        window.__CONFIG__ = {\n            ${props.join(',\n            ')}\n        };\n    </script>`;
}

export function generateControlPanelHTML(config: ControlPanelConfig): string {
  return (panelHtml as string)
    .replace('{{CSS}}', panelCss as string)
    .replace('{{CONFIG_SCRIPT}}', buildConfigScript(config));
}
