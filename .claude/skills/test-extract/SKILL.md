---
name: test-extract
description: Run a live CSS extraction test against a URL and selector, verify output contains HTML, CSS, and Tailwind classes
argument-hint: "<url> <selector>"
user-invocable: true
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *)
---

# Test CSS Extraction

Run a full extraction test against a live URL with a CSS selector.

## Steps

1. Build the project first: `npx tsc`
2. If build fails, report errors and stop
3. Run extraction: `node dist/index.js --url "$0" --selector "$1" --format json --timeout 30000`
4. Redirect stderr to /dev/null to get clean JSON output
5. Parse the JSON output and verify:
   - `html` field exists and is non-empty
   - `css` field exists and contains CSS rules (look for `{` and `}`)
   - `tailwindHtml` field exists and contains `class="` attributes
   - No error messages in the output
6. Report a summary:
   - Number of CSS rules extracted (count `{` in css field)
   - Whether Tailwind classes were generated
   - Sample of first 3 Tailwind classes found
   - HTML element count
   - Any fonts or CSS variables detected

## Default test if no arguments provided

If no URL/selector given, use these defaults:
- URL: `https://example.com`
- Selector: `body`

## Error handling

- If the page times out, report and suggest increasing --timeout
- If selector not found, report the error clearly
- If build fails, show the TypeScript errors
