# 🎉 Cypress Safari - Working Guide

## What Actually Happens When You Run It

### Step 1: Start the Framework
```bash
npm start
```

### Step 2: Backend Initialization (what you'll see in terminal)
```
🚀 Starting Cypress Safari Wrapper...
✅ Proxy initialized at http://localhost:1337/QIm72sVP7/https://www.saucedemo.com/
✅ Control Panel server started at http://localhost:3000
🌐 Opening browser...
✅ Browser opened successfully
✨ Control Panel ready for use
```

### Step 3: Browser Opens Automatically
Your default browser opens at `http://localhost:3000` showing:
- **Left Sidebar**: Control panel with tools and console
- **Right Side**: Virtual browser (iframe) with the target site loaded

### Step 4: Virtual Browser Is Ready
The iframe automatically loads the Hammerhead proxy URL, which means:
- ✅ The target site is loaded in an iframe (virtual browser)
- ✅ Full network traffic goes through the proxy
- ✅ You can interact with it like a normal website
- ✅ All traffic is intercepted by Hammerhead

## Interactive Mode - Using the Control Panel

### Manual Element Interaction

1. **Find Elements**
   - Enter a CSS selector in the "Selectors" section
   - Click "Find" button
   - Console shows how many elements matched
   - Elements are highlighted

2. **Click Elements**
   - Enter selector in "Actions" section
   - Click "Click Selected" button
   - Console logs the action

3. **Type Text**
   - Enter selector and text to type
   - Click "Type Text" button
   - Text is entered into the form field

4. **Inspector**
   - Click "Toggle Inspector"
   - Click elements in the iframe to inspect them
   - Console shows tag, class, and ID

### Browser Console Mode

For more control, open the browser Developer Tools (F12 / Cmd+Option+I):

```javascript
// Access the TestApi from browser console
window.testApi

// Find all elements
window.testApi.get('button')           // Returns array of elements
window.testApi.get('[data-test="login-button"]')

// Get single element
window.testApi.find('#username')

// Get element text
window.testApi.text('.product-title')

// Get attribute
window.testApi.attr('a', 'href')

// Click element
window.testApi.click('[data-test="login-button"]')

// Type text
window.testApi.type('[data-test="username"]', 'standard_user')

// Get URL/Title
window.testApi.url()                   // Current URL
window.testApi.title()                 // Page title

// Reload/Navigate
window.testApi.reload()
window.testApi.visit('https://example.com')
```

## Example: Login Test via Console

1. **Start the framework**
   ```bash
   npm start
   ```

2. **Browser opens** - wait for it to load the site

3. **Open DevTools** (F12 or Cmd+Option+I)

4. **Go to Console tab**

5. **Paste this script**
   ```javascript
   (async function() {
       console.log('🧪 Running login test...');
       
       // Enter credentials
       window.testApi.type('[data-test="username"]', 'standard_user');
       window.testApi.type('[data-test="password"]', 'secret_sauce');
       
       // Click login
       window.testApi.click('[data-test="login-button"]');
       console.log('✅ Login submitted, waiting for page...');
       
       // Wait for navigation
       await new Promise(r => setTimeout(r, 3000));
       
       // Verify
       console.log('URL: ' + window.testApi.url());
       console.log('Title: ' + window.testApi.title());
       console.log('✨ Test complete!');
   })();
   ```

6. **Press Enter** - watch the test run in real-time!

## How It's Actually Structured

```
Terminal (Node.js Process)
│
├─ Hammerhead Proxy (port 1337/1338)
│  └─ Intercepts all network traffic
│
├─ HTTP Server (port 3000)
│  └─ Serves control panel HTML
│
└─ Launches browser automatically
   │
   └─ Browser loads http://localhost:3000
      │
      ├─ Left Sidebar: Control Panel UI
      │  ├─ Selector tools
      │  ├─ Action buttons
      │  ├─ Inspector
      │  └─ Console log
      │
      └─ Right Side: Virtual Browser (iframe)
         └─ Loads proxy URL
            └─ iframe.src = "http://localhost:1337/QIm72sVP7/https://www.saucedemo.com/"
               └─ Inside iframe: window.testApi available
                  ├─ get(selector)
                  ├─ click(selector)
                  ├─ type(selector, text)
                  ├─ url()
                  ├─ title()
                  └─ ... and more
```

## What `window.testApi` Provides

Available in browser console when connected to the virtual browser:

### Element Access
- `get(selector)` - Find all matching elements
- `find(selector)` - Find first matching element
- `text(selector)` - Get text content
- `attr(selector, name)` - Get attribute value

### Interactions
- `click(selector)` - Click an element
- `type(selector, text)` - Type into form field

### Navigation
- `url()` - Get current URL in iframe
- `title()` - Get page title
- `visit(url)` - Navigate to new URL
- `reload()` - Reload the page

## Quick Reference

| Task | Command |
|------|---------|
| Start virtual browser | `npm start` |
| Open console | F12 or Cmd+Option+I |
| Find elements | `window.testApi.get('button')` |
| Click element | `window.testApi.click('.btn')` |
| Type text | `window.testApi.type('input', 'text')` |
| Get URL | `window.testApi.url()` |
| Run test in console | Paste script and press Enter |
| Stop framework | Ctrl+C in terminal |

## Practical Example: Complete Shopping Flow

In browser console:
```javascript
(async function() {
    // Login
    window.testApi.type('[data-test="username"]', 'standard_user');
    window.testApi.type('[data-test="password"]', 'secret_sauce');
    window.testApi.click('[data-test="login-button"]');
    await new Promise(r => setTimeout(r, 2000));
    
    // Find products
    const products = window.testApi.get('[data-test*="add-to-cart"]');
    console.log('Found ' + products.length + ' products');
    
    // Add to cart
    window.testApi.click('[data-test="add-to-cart-sauce-labs-backpack"]');
    await new Promise(r => setTimeout(r, 500));
    
    // Go to cart
    window.testApi.click('[data-test="shopping-cart-link"]');
    await new Promise(r => setTimeout(r, 2000));
    
    // Check cart
    const cartItems = window.testApi.get('[data-test="cart-list-item"]');
    console.log('✨ Cart has ' + cartItems.length + ' items');
})();
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Browser doesn't open | Visit http://localhost:3000 manually |
| Proxy not starting | Check ports 1337/1338 are free |
| Can't find elements | Try different selectors, check browser console |
| iframe shows blank | Wait a few seconds, check proxy URL |
| `window.testApi` undefined | Make sure you're in browser console (F12), not terminal |

## The Key Difference From Before

**What wasn't working:**
- Code tried to use TestApi from Node.js but TestApi needed to access iframe DOM
- iframe injection couldn't happen server-side
- Tests couldn't really interact with the browser

**What works now:**
- ✅ Backend (Node) runs proxy and serves HTML
- ✅ Frontend (Browser) loads HTML and creates iframe
- ✅ iframe automatically loads proxy URL  
- ✅ `window.testApi` is available in browser console for real interactions
- ✅ Control panel UI provides visual tools
- ✅ Everything is wired up and working end-to-end

---

**It's now a fully functional virtual browser testing system!** 🎉
