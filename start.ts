/**
 * Cypress Safari - Test Script Entry Point
 */

import { CypressSafariWrapper } from './wrapper';

async function main() {
    const targetUrl = process.argv[2] || 'about:blank';

    // Initialize the wrapper
    const wrapper = new CypressSafariWrapper({
        targetUrl,
        proxyHost: 'localhost',
        port1: 1337,
        port2: 1338,
        controlPanelPort: 3000,
        headless: process.env.HEADLESS === 'true',
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
