/**
 * Tx - Test Script Entry Point
 */

import { TxWrapper } from './wrapper';
import { TxConfig } from './types';

function parseArgs(argv: string[]): TxConfig {
    const args = argv.slice(2);
    const config: TxConfig = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // --key=value form
        const eqMatch = arg.match(/^--([a-zA-Z0-9]+)=(.+)$/);
        if (eqMatch) {
            setConfigField(config, eqMatch[1], eqMatch[2]);
            continue;
        }

        // --flag (boolean)
        const flagMatch = arg.match(/^--([a-zA-Z0-9]+)$/);
        if (flagMatch) {
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                setConfigField(config, flagMatch[1], next);
                i++;
            } else {
                setConfigField(config, flagMatch[1], 'true');
            }
            continue;
        }

        // Positional: first bare arg is the URL (backward compat)
        if (!arg.startsWith('--') && !config.targetUrl) {
            config.targetUrl = arg;
        }
    }

    return config;
}

function setConfigField(config: TxConfig, key: string, value: string): void {
    switch (key) {
        case 'url':
        case 'targetUrl':
            config.targetUrl = value;
            break;
        case 'proxyHost':
            config.proxyHost = value;
            break;
        case 'port1':
            config.port1 = parseInt(value, 10);
            break;
        case 'port2':
            config.port2 = parseInt(value, 10);
            break;
        case 'controlPanelPort':
        case 'port':
            config.controlPanelPort = parseInt(value, 10);
            break;
        case 'headless':
            config.headless = value === 'true' || value === '1';
            break;
        default:
            console.warn(`Unknown CLI option: --${key}`);
    }
}

async function main() {
    const cliConfig = parseArgs(process.argv);

    // Initialize the wrapper with defaults, overridden by CLI args
    const wrapper = new TxWrapper({
        targetUrl: cliConfig.targetUrl ?? 'about:blank',
        proxyHost: cliConfig.proxyHost ?? 'localhost',
        port1: cliConfig.port1 ?? 1337,
        port2: cliConfig.port2 ?? 1338,
        controlPanelPort: cliConfig.controlPanelPort ?? 3000,
        headless: cliConfig.headless ?? (process.env.HEADLESS === 'true'),
    });

    try {
        // Start the wrapper
        await wrapper.start();

        // Keep running for interactive testing
        console.log('🎯 Virtual browser is now running!');
        console.log('📍 Use the control panel to interact with the site');
        console.log('⌨️  Press Ctrl+C to stop\n');

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Shutting down...');
            await wrapper.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Error:', error);
        await wrapper.stop();
        process.exit(1);
    }
}

// Run the main function
main().catch(console.error);
