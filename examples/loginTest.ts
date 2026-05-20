/**
 * Example: Login Flow Test
 * 
 * This demonstrates a complete login flow using the browser console.
 * 
 * Steps:
 * 1. npm start
 * 2. Wait for browser to open
 * 3. Open browser console (F12)
 * 4. Paste this script into console
 */

const loginFlowScript = `
(async function runLoginTest() {
    console.log('\\n🧪 Running login flow test...\\n');
    
    try {
        // Step 1: Find login fields
        console.log('Step 1: Finding login fields...');
        const userField = window.testApi.find('[data-test="username"]');
        const passField = window.testApi.find('[data-test="password"]');
        
        if (!userField || !passField) {
            throw new Error('Login fields not found');
        }
        console.log('✅ Login fields found');
        
        // Step 2: Enter credentials
        console.log('Step 2: Entering credentials...');
        window.testApi.type('[data-test="username"]', 'standard_user');
        window.testApi.type('[data-test="password"]', 'secret_sauce');
        console.log('✅ Credentials entered');
        
        // Step 3: Submit form
        console.log('Step 3: Submitting login form...');
        window.testApi.click('[data-test="login-button"]');
        console.log('✅ Login button clicked');
        
        // Step 4: Wait for navigation
        console.log('Step 4: Waiting for page to load...');
        await new Promise(r => setTimeout(r, 3000));
        
        // Step 5: Verify success
        console.log('Step 5: Verifying login success...');
        const currentUrl = window.testApi.url();
        const pageTitle = window.testApi.title();
        
        console.log('📊 Results:');
        console.log('   URL: ' + currentUrl);
        console.log('   Title: ' + pageTitle);
        
        if (currentUrl.includes('inventory')) {
            console.log('\\n✨ Login test PASSED!\\n');
        } else {
            console.log('\\n⚠️  Login may have failed - check URL\\n');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
})();
`;

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Login Flow Test Example                                  ║
╚════════════════════════════════════════════════════════════╝

To run this test:

1. Start the framework:
   npm start

2. Wait for the browser to open (http://localhost:3000)

3. Open browser DevTools (F12 / Cmd+Option+I)

4. Go to the Console tab

5. Paste this script:
${loginFlowScript}

6. Press Enter to run!

What this test does:
✓ Finds the login form fields
✓ Enters test credentials (standard_user / secret_sauce)
✓ Clicks the login button
✓ Waits for navigation
✓ Verifies the login was successful

💡 You can also manually interact with elements using:
   window.testApi.get(selector)
   window.testApi.click(selector)
   window.testApi.type(selector, text)
   window.testApi.url()
   window.testApi.title()
`);

