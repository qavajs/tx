// eslint-disable-next-line @typescript-eslint/no-require-imports
const hammerhead = require('testcafe-hammerhead');

const TARGET_URL = process.argv[2] || 'https://www.saucedemo.com/';
const PROXY_HOST = 'localhost';
const PORT1 = 1337;
const PORT2 = 1338;

class ProxySession extends hammerhead.Session {
    getAuthCredentials() { return null; }
    handleFileDownload() {}
    handleAttachment() {}
    handlePageError(_ctx: unknown, err: string) { console.error('Page error:', err); }
    async getPayloadScript() { return ''; }
    async getIframePayloadScript() { return ''; }
}

const proxy = new hammerhead.Proxy({});

proxy.start({
    hostname: PROXY_HOST,
    port1: PORT1,
    port2: PORT2,
});

// @ts-ignore – Session has a protected constructor; we subclass it via require
const session = new ProxySession([], {});
const proxiedUrl = proxy.openSession(TARGET_URL, session);

console.log(`Proxy: http://${PROXY_HOST}:${PORT1}`);
console.log(`Opening: ${proxiedUrl}`);

import { exec } from 'child_process';
exec(`open -a Safari "${proxiedUrl}"`, (err: Error | null) => {
    if (err) console.error('Failed to open Safari:', err.message);
});
