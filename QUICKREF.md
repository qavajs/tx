# Cypress Safari - Quick Reference

## API Cheat Sheet

### Navigation
```typescript
await cy.wait()                    // Wait for iframe to load
await cy.wait(3000)                // Wait with custom timeout
cy.visit('https://example.com')    // Go to URL
cy.reload()                        // Reload page
cy.url()                           // Get current URL
cy.title()                         // Get page title
```

### Finding Elements
```typescript
cy.get('button')                   // Get all buttons
cy.get('.button-class')            // Get by class
cy.get('#button-id')               // Get by id
cy.get('[data-test="btn"]')        // Get by attribute
cy.find('#selector')               // Get first match
cy.get('div > button:first')       // CSS selectors
```

### Getting Element Info
```typescript
cy.text('#btn')                    // Get text content
cy.attr('#link', 'href')           // Get attribute
cy.isVisible('#popup')             // Check visibility
cy.screenshot()                    // Get bounding box
cy.screenshot('#element')          // Element bounds
```

### Interactions
```typescript
cy.click('#button')                // Click element
cy.type('#input', 'hello')         // Type text
cy.type('#input', '{backspace}')   // Special keys
cy.type('#input', '{enter}')       // Enter key
```

### Waiting
```typescript
await cy.waitForElement('#modal', 3000)           // Wait for element
await cy.waitForElementToDisappear('#spinner')    // Wait to disappear
```

### Advanced
```typescript
cy.execute((arg) => window.console.log(arg), 'test')  // Run JS
cy.get('button').length                                // Element count
```

## Common Test Patterns

### Login Pattern
```typescript
const cy = await wrapper.start();
cy.type('[data-test="username"]', 'user');
cy.type('[data-test="password"]', 'pass');
cy.click('[data-test="login-button"]');
await cy.waitForElement('[data-test="dashboard"]');
```

### Form Pattern
```typescript
cy.type('#firstName', 'John');
cy.type('#email', 'john@example.com');
cy.click('button[type="submit"]');
await cy.waitForElement('.success-message');
```

### Assertion Pattern
```typescript
const title = cy.title();
if (!title.includes('Expected')) throw new Error('Title mismatch');

const elements = cy.get('button');
if (elements.length === 0) throw new Error('No buttons found');
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Element not found | Use `waitForElement()` instead of `get()` |
| iframe not loading | Increase timeout: `await cy.wait(10000)` |
| Click not working | Verify element is visible: `cy.isVisible(sel)` |
| Text not entered | Check field is focused before typing |
| URL didn't change | Wait after click: `await new Promise(r => setTimeout(r, 1000))` |

## Setup

```typescript
const wrapper = new CypressSafariWrapper({
    targetUrl: 'https://example.com',
    controlPanelPort: 3000,
    headless: false,
});

const cy = await wrapper.start();
```

## Cleanup

```typescript
await wrapper.stop();
```

## Running Tests

```bash
npm start              # Interactive mode
npm run test:basic     # Run basic example
npm run test:login     # Run login example
npm run test:shopping  # Run shopping example
ts-node myTest.ts      # Run custom test
```
