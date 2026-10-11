---
name: build-check
description: Full build and type-check of the snipkiwi project with detailed error reporting
user-invocable: true
allowed-tools: Bash(npx tsc *), Bash(npm *), Bash(node *), Read
---

# Build Check

Run a comprehensive build and type-check of the snipkiwi project.

## Steps

1. **Type check** (no emit): `npx tsc --noEmit`
   - Report any type errors with file, line, and error message
   - Group errors by file

2. **Full build**: `npx tsc`
   - Verify dist/ output is generated
   - Check that all expected files exist in dist/:
     - `index.js` (CLI entry)
     - `mcp-server.js` (MCP entry)
     - `browser/browser-manager.js`
     - `browser/viewport-manager.js`
     - `extraction/extraction-pipeline.js` + 12 other extraction modules
     - `tailwind/css-to-tailwind.js` + 4 other tailwind modules
     - `types/index.js`
     - `utils/parsel.js`, `utils/helpers.js`

3. **Quick smoke test**: `node -e "import('./dist/index.js').catch(e => console.error(e.message))"`
   - Verify the entry point loads without import errors

4. **Report summary**:
   - Total TypeScript errors (should be 0)
   - Total dist files generated
   - Any missing expected files
   - Import health check result
