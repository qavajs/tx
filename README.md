# Cypress Safari - Virtual Browser Testing Framework

A fully functional **Cypress-like testing framework for Safari** that uses Hammerhead proxy to inject websites into an iframe, providing a virtual browser testing experience.

## ✨ Features

- 🎯 **Working Virtual Browser** - Target site loads in iframe via Hammerhead proxy
- 🔍 **Interactive Control Panel** - Browser-based UI with tools and console
- 📦 **Hammerhead Proxy** - Full network interception on ports 1337/1338
- 🧪 **Browser Console API** - Access `window.testApi` for element interactions
- 🖱️ **Interactive Tools** - Selector finder, element inspector, action executor
- 🌐 **Auto-opens Browser** - Automatically launches your default browser

## Quick Start

```bash
# Install dependencies
npm install

# Start the virtual browser
npm start
```

That's it! The framework will:
1. ✅ Start Hammerhead proxy
2. ✅ Start control panel server (http://localhost:3000)
3. ✅ Automatically open your browser
4. ✅ Load target site in iframe
5. ✅ Ready for testing

## Architecture

```
Terminal (Node.js)
  ├─ Hammerhead Proxy (1337/1338)
  └─ HTTP Server (3000)
      │
      └─ Browser Opens
          ├─ Left: Control Panel UI
          │   ├─ Selector Tools
          │   ├─ Action Buttons
          │   ├─ Inspector
          │   └─ Console
          │
          └─ Right: Virtual Browser (iframe)
              └─ iframe.src = Proxy URL
                  └─ window.testApi available
```

## Using the Virtual Browser

### Via Control Panel (Visual)

1. Enter CSS selector → Click "Find" → Elements are found
2. Enter selector → Click "Click Selected" → Element clicked
3. Enter selector + text → Click "Type Text" → Text entered

### Via Browser Console (Programmatic)

Open DevTools (F12 / Cmd+Option+I) and use:

```javascript
// Find elements
window.testApi.get('button')              // All buttons
window.testApi.find('[data-test="btn"]')  // First match
window.testApi.text('.title')             // Get text

// Interact
window.testApi.click('[data-test="login"]')
window.testApi.type('[data-test="user"]', 'john')

// Navigate
window.testApi.url()      // Get current URL
window.testApi.title()    // Get page title
window.testApi.reload()   // Reload page
window.testApi.visit('https://example.com')
```

## Examples

### Complete Login Test (in browser console)

```javascript
(async function() {
    // Enter credentials
    window.testApi.type('[data-test="username"]', 'standard_user');
    window.testApi.type('[data-test="password"]', 'secret_sauce');
    
    // Submit login
    window.testApi.click('[data-test="login-button"]');
    
    // Wait and verify
    await new Promise(r => setTimeout(r, 3000));
    console.log('✨ URL: ' + window.testApi.url());
    console.log('✨ Title: ' + window.testApi.title());
})();
```

### Shopping Flow Test

```javascript
(async function() {
    // Login
    window.testApi.type('[data-test="username"]', 'standard_user');
    window.testApi.type('[data-test="password"]', 'secret_sauce');
    window.testApi.click('[data-test="login-button"]');
    await new Promise(r => setTimeout(r, 2000));
    
    // Add to cart
    window.testApi.click('[data-test="add-to-cart-sauce-labs-backpack"]');
    
    // Go to cart
    window.testApi.click('[data-test="shopping-cart-link"]');
    await new Promise(r => setTimeout(r, 2000));
    
    // Verify
    const cartItems = window.testApi.get('[data-test="cart-list-item"]');
    console.log('✨ Cart has ' + cartItems.length + ' items');
})();
```

## API Reference

### Element Access
| Method | Usage | Returns |
|--------|-------|---------|
| `get(selector)` | `window.testApi.get('button')` | Element[] |
| `find(selector)` | `window.testApi.find('#id')` | Element \| null |
| `text(selector)` | `window.testApi.text('.class')` | string |
| `attr(selector, name)` | `window.testApi.attr('a', 'href')` | string \| null |

### Interactions
| Method | Usage | Effect |
|--------|-------|--------|
| `click(selector)` | `window.testApi.click('button')` | Clicks element |
| `type(selector, text)` | `window.testApi.type('input', 'text')` | Types into input |

### Navigation
| Method | Usage | Returns |
|--------|-------|---------|
| `url()` | `window.testApi.url()` | string (current URL) |
| `title()` | `window.testApi.title()` | string (page title) |
| `reload()` | `window.testApi.reload()` | void |
| `visit(url)` | `window.testApi.visit('https://...')` | void |

## Configuration

```bash
# Run with custom target URL
npm start https://example.com

# Headless mode (no browser UI)
HEADLESS=true npm start

# Custom ports (edit code)
# See: wrapper.ts controlPanelPort configuration
```

## Project Structure

```
cypress-safari/
├── start.ts                 # Entry point
├── wrapper.ts              # Main orchestrator  
├── iframeInjector.ts       # iframe management
├── testApi.ts              # Test API (unused in current implementation)
├── server.ts               # HTTP server
├── controlPanel.ts         # HTML UI generation (includes window.testApi)
├── examples/
│   ├── basicTest.ts        # Shows console API usage
│   ├── loginTest.ts        # Shows login flow script
│   └── shoppingTest.ts     # Shows shopping flow script
├── README.md               # This file
├── WORKING_GUIDE.md        # Detailed working guide
└── QUICKREF.md             # API quick reference
```

## Common Tasks

| Task | Steps |
|------|-------|
| **Find an element** | Selector tools in left panel → Enter CSS → Click Find |
| **Click an element** | Same selector box → Click "Click Selected" |
| **Type into form** | Enter selector + text → Click "Type Text" |
| **Run a test** | Open console (F12) → Paste test script → Press Enter |
| **Inspect element** | Click "Toggle Inspector" → Click element in iframe |
| **Change URL** | Enter URL in toolbar → Click "Go" |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser doesn't open | Visit http://localhost:3000 manually |
| Proxy fails to start | Check ports 1337/1338 are available |  
| Can't find elements | Use browser inspector to find correct selectors |
| iframe is blank | Wait a few seconds for it to load |
| Tests not working | Make sure you're in browser console, not terminal |

## How It Works

1. **Backend (Node.js)**
   - Starts Hammerhead proxy (intercepts all requests)
   - Creates proxy session for target URL
   - Starts HTTP server serving control panel HTML

2. **Frontend (Browser)**
   - Loads control panel HTML from server
   - Creates iframe element
   - Sets iframe.src to proxy URL
   - Exposes `window.testApi` for DOM access

3. **Testing**
   - Use control panel UI for visual interaction
   - Use browser console for programmatic testing
   - Both methods interact with the same iframe

## Performance Notes

- Single tab at a time (one iframe)
- Network requests proxied through Hammerhead
- Target site loaded just like in a real browser
- Console API is synchronous (use async/await for delays)

## Examples Explained

Run any example to see how to use the framework:

```bash
# Show how to use browser console API
ts-node examples/basicTest.ts

# Show complete login test script
ts-node examples/loginTest.ts

# Show shopping flow test script
ts-node examples/shoppingTest.ts
```

Each example outputs a ready-to-use script that you can paste into your browser console.

## Key Points

✅ **Fully Working** - Proxy starts, browser opens, iframe loads  
✅ **Interactive** - Use UI or console  
✅ **Cypress-like** - Familiar API (get, click, type, etc.)  
✅ **Real Network** - Hammerhead intercepts actual traffic  
✅ **Inspector Built-in** - Click elements to inspect them  
✅ **Console Logging** - See all actions in the sidebar console  

## Next Steps

1. Run `npm start`
2. Browser opens automatically
3. Interact using the control panel or browser console
4. See `WORKING_GUIDE.md` for detailed examples
5. Check `QUICKREF.md` for API reference

---

**Ready to test!** Start with `npm start` 🚀


## Architecture

```
┌─────────────────────────────────────────────┐
│         Cypress Safari Wrapper              │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐       ┌──────────────┐  │
│  │ Test Server  │       │    Wrapper   │  │
│  │  (Port 3000) │       │   Orchestr.  │  │
│  └──────────────┘       └──────────────┘  │
│         │                      │           │
│         │                      ▼           │
│         │              ┌──────────────┐   │
│         │              │ Hammerhead   │   │
│         │              │   Proxy      │   │
│         │              │ (1337/1338)  │   │
│         │              └──────────────┘   │
│         │                      │           │
│         ▼                      ▼           │
│  ┌─────────────────────────────────────┐  │
│  │    Control Panel (HTML + JS)        │  │
│  │  ┌──────────────────────────────┐   │  │
│  │  │     Virtual Browser IFrame   │   │  │
│  │  │  ┌────────────────────────┐  │   │  │
│  │  │  │   Target Website       │  │   │  │
│  │  │  │   (via proxy)          │  │   │  │
│  │  │  └────────────────────────┘  │   │  │
│  │  └──────────────────────────────┘   │  │
│  └─────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

## Installation

```bash
npm install
```

## Quick Start

### Interactive Mode (Manual Testing)

Start the control panel:

```bash
npm start
```

This will:
1. Start the Hammerhead proxy
2. Open the control panel at `http://localhost:3000`
3. Display the target website in an iframe
4. Provide interactive testing controls

### Programmatic Testing

Run example tests:

```bash
npm run test:basic      # Basic element interactions
npm run test:login      # Login flow test
npm run test:shopping   # Shopping flow test
```

### Custom Test

Create `myTest.ts`:

```typescript
import { CypressSafariWrapper } from './wrapper';

async function myTest() {
    const wrapper = new CypressSafariWrapper({
        targetUrl: 'https://www.saucedemo.com/',
    });

    try {
        const cy = await wrapper.start();
        
        // Wait for page to load
        await cy.wait(5000);
        
        // Your test code here
        const title = cy.title();
        console.log(`Page title: ${title}`);
        
        await wrapper.stop();
    } catch (error) {
        console.error('Test failed:', error);
        await wrapper.stop();
    }
}

myTest();
```

Run with:

```bash
ts-node myTest.ts
```

## Test API Reference

### Navigation

```typescript
// Wait for iframe to load
await cy.wait(timeout?: number);

// Visit a URL
cy.visit(url: string);

// Reload current page
cy.reload();

// Get current URL
const url = cy.url();

// Get page title
const title = cy.title();
```

### Selectors & Elements

```typescript
// Get all matching elements
const elements = cy.get(selector: string);

// Get first matching element
const element = cy.find(selector: string);

// Get text content
const text = cy.text(selector: string);

// Get attribute value
const value = cy.attr(selector: string, attrName: string);

// Check if element is visible
const visible = cy.isVisible(selector: string);
```

### Interactions

```typescript
// Click an element
cy.click(selector: string);

// Type text into input
cy.type(selector: string, text: string);

// Take screenshot info
const bounds = cy.screenshot(selector?: string);
```

### Waiting

```typescript
// Wait for element to appear
await cy.waitForElement(selector: string, timeout?: number);

// Wait for element to disappear
await cy.waitForElementToDisappear(selector: string, timeout?: number);
```

### Advanced

```typescript
// Execute code in iframe context
const result = cy.execute((arg) => {
    return window.location.href;
}, someArg);
```

## Configuration Options

```typescript
const wrapper = new CypressSafariWrapper({
    // Target URL to test
    targetUrl?: string;           // default: https://www.saucedemo.com/
    
    // Proxy configuration
    proxyHost?: string;           // default: localhost
    port1?: number;               // default: 1337
    port2?: number;               // default: 1338
    
    // Control panel
    controlPanelPort?: number;    // default: 3000
    
    // Run mode
    headless?: boolean;           // default: false
});
```

## Control Panel Features

### Navigation Bar
- Enter URLs and navigate
- Reload current page
- View current URL

### Selector Tools
- Find elements by CSS selector
- Visual highlighting of found elements
- Element count display

### Actions
- Click selected elements
- Type text into inputs
- Execute arbitrary actions

### Inspector
- Toggle inspector mode
- View element details (tag, class, id)
- Real-time element inspection

### Console
- View action logs
- See error messages
- Track test execution

## Examples

### Login Test

```typescript
const cy = await wrapper.start();
await cy.wait();

// Enter credentials
cy.type('[data-test="username"]', 'standard_user');
cy.type('[data-test="password"]', 'secret_sauce');

// Submit
cy.click('[data-test="login-button"]');

// Wait for redirect
await cy.waitForElement('[data-test="inventory-list"]', 5000);

// Verify
const title = cy.title();
console.log(`Logged in! Title: ${title}`);
```

### Element Interaction Test

```typescript
// Get all buttons
const buttons = cy.get('button');
console.log(`Found ${buttons.length} buttons`);

// Find specific element
const element = await cy.waitForElement('#submit-btn', 3000);

// Check visibility
if (cy.isVisible('#submit-btn')) {
    cy.click('#submit-btn');
}

// Get text
const text = cy.text('#submit-btn');
console.log(`Button text: ${text}`);
```

### Form Filling Test

```typescript
// Select form fields
cy.type('#firstName', 'John');
cy.type('#lastName', 'Doe');
cy.type('#email', 'john@example.com');

// Select dropdown
const options = cy.get('select option');
console.log(`Found ${options.length} options`);

// Submit form
cy.click('[type="submit"]');

// Verify submission
await cy.waitForElementToDisappear('form', 5000);
```

## Troubleshooting

### iframe Not Loading

```typescript
// Increase wait timeout
await cy.wait(10000);  // Wait 10 seconds
```

### Element Not Found

```typescript
// Use browser dev tools to find the correct selector
// Check if element is in iframe (not top-level page)
const element = await cy.waitForElement(selector, 5000);
```

### Script Errors

```typescript
// Check browser console for errors
// Ensure selectors are correct
// Verify element exists before interacting
if (cy.find(selector)) {
    cy.click(selector);
}
```

## Directory Structure

```
cypress-safari/
├── start.ts                 # Entry point
├── wrapper.ts              # Main orchestrator
├── iframeInjector.ts       # iframe management
├── testApi.ts              # Test API
├── server.ts               # HTTP server
├── controlPanel.ts         # UI generation
├── examples/
│   ├── basicTest.ts        # Basic test example
│   ├── loginTest.ts        # Login flow example
│   └── shoppingTest.ts     # Shopping flow example
├── package.json
└── tsconfig.json
```

## Architecture Details

### CypressSafariWrapper
Main orchestrator that:
- Initializes Hammerhead proxy
- Creates proxy session
- Manages lifecycle
- Provides TestApi instance

### IframeInjector
Manages iframe lifecycle:
- Injects iframe into DOM
- Navigates to proxy URL
- Provides DOM access
- Handles reload/navigation

### TestApi
Cypress-like testing API:
- DOM querying (get, find)
- Element interactions (click, type)
- Waiting utilities
- Navigation controls

### TestServer
HTTP server serving:
- Control panel HTML
- Static assets
- API endpoints

### Control Panel
Interactive UI providing:
- Visual browser viewport
- Selector finder
- Action executor
- Element inspector

## Performance Tips

1. **Reduce Wait Times** - Use specific selectors and shorter timeouts when possible
2. **Parallel Tests** - Run multiple instances with different ports
3. **Memory** - Close wrappers after tests to free resources
4. **Caching** - Reuse wrapper instance for related tests

## Limitations

- Runs in browser context (requires Node.js for proxy)
- Single tab at a time (one iframe)
- Network requests go through proxy
- Some browser features may be limited by sandbox

## Future Enhancements

- [ ] Multiple tabs support
- [ ] Network request interception
- [ ] Request/response mocking
- [ ] Performance metrics
- [ ] Video recording
- [ ] Accessibility testing
- [ ] Cross-browser support

## License

ISC
