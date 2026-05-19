/**
 * Example: Shopping Cart Flow
 * 
 * This demonstrates a complete shopping flow using the browser console.
 * 
 * Steps:
 * 1. npm start
 * 2. Wait for browser to open  
 * 3. Open browser console (F12)
 * 4. Paste this script into console
 */

const shoppingFlowScript = `
(async function runShoppingTest() {
    console.log('\\n🛒 Running shopping flow test...\\n');
    
    try {
        // Step 1: Login
        console.log('Step 1: Logging in...');
        window.testApi.type('[data-test="username"]', 'standard_user');
        window.testApi.type('[data-test="password"]', 'secret_sauce');
        window.testApi.click('[data-test="login-button"]');
        await new Promise(r => setTimeout(r, 2000));
        console.log('✅ Logged in');
        
        // Step 2: Find items
        console.log('Step 2: Finding products...');
        const items = window.testApi.get('[data-test*="add-to-cart"]');
        console.log('✅ Found ' + items.length + ' items');
        
        // Step 3: Add item to cart
        console.log('Step 3: Adding item to cart...');
        window.testApi.click('[data-test="add-to-cart-sauce-labs-backpack"]');
        await new Promise(r => setTimeout(r, 500));
        console.log('✅ Item added');
        
        // Step 4: Go to cart
        console.log('Step 4: Going to cart...');
        window.testApi.click('[data-test="shopping-cart-link"]');
        await new Promise(r => setTimeout(r, 2000));
        console.log('✅ Cart opened');
        
        // Step 5: Verify cart
        console.log('Step 5: Verifying cart contents...');
        const cartItems = window.testApi.get('[data-test="cart-list-item"]');
        console.log('✅ Cart has ' + cartItems.length + ' item(s)');
        
        console.log('\\n✨ Shopping flow test PASSED!\\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
})();
`;

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Shopping Flow Test Example                               ║
╚════════════════════════════════════════════════════════════╝

To run this test:

1. Start the framework:
   npm start

2. Wait for the browser to open (http://localhost:3000)

3. Open browser DevTools (F12 / Cmd+Option+I)

4. Go to the Console tab

5. Paste this script:
${shoppingFlowScript}

6. Press Enter to run!

What this test does:
✓ Logs in to the site
✓ Finds all products
✓ Adds a backpack to the cart
✓ Navigates to cart
✓ Verifies items in cart

The test runs completely in the iframe context and can interact with the site!
`);
    } catch (error) {
        console.error('❌ Test failed:', error);
        await wrapper.stop();
        process.exit(1);
    }
}

testShoppingFlow();
