/**
 * Example: Basic Test - Manual demonstration
 * 
 * This example shows how to use the browser control panel manually.
 * For programmatic testing, use the interactive control panel:
 * 1. npm start
 * 2. Use the control panel UI to interact with elements
 * 3. Open browser console (F12) to access window.testApi
 */

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Basic Test Example - Using Browser Control Panel         ║
╚════════════════════════════════════════════════════════════╝

To run this example:

1. Start the framework:
   npm start

2. Once the browser opens at http://localhost:3000:
   
3. Open browser console (F12)

4. Run commands directly:
   window.testApi.get('button')           // Find all buttons
   window.testApi.text('#title')          // Get text content
   window.testApi.click('[data-test="login-button"]')
   window.testApi.type('#username', 'standard_user')

5. Or run a full test:
   (async () => {
       window.testApi.type('[data-test="username"]', 'standard_user');
       window.testApi.type('[data-test="password"]', 'secret_sauce');
       window.testApi.click('[data-test="login-button"]');
       console.log('✅ Login submitted!');
   })();

✨ The virtual browser is ready to test!
`);
