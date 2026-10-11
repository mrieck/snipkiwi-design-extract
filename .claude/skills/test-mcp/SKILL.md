---
name: test-mcp
description: Test the MCP server by sending JSON-RPC requests and validating tool responses
argument-hint: "[url] [selector]"
user-invocable: true
allowed-tools: Bash(node *), Bash(npm *), Bash(npx *), Read, Write
---

# Test MCP Server

Test the snipkiwi MCP server by simulating JSON-RPC tool calls.

## Steps

1. Build first: `npx tsc`

2. **Test tool listing**: Send initialize + tools/list request to the MCP server
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
   {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 10 node dist/mcp-server.js 2>/dev/null
   ```
   - Verify `extract_tailwind` tool is listed
   - Verify `list_page_elements` tool is listed
   - Check input schemas are valid

3. **Test extraction tool** (if URL provided):
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
   {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"extract_tailwind","arguments":{"url":"$0","selector":"$1"}}}' | timeout 60 node dist/mcp-server.js 2>/dev/null
   ```
   - Verify response contains content
   - Check for Tailwind HTML in output
   - Verify no error responses

4. **Report**:
   - MCP protocol compliance (initialize handshake)
   - Tool discovery (list_page_elements, extract_tailwind)
   - Extraction result quality (if URL tested)

## Default test

If no arguments, just test tool listing (fast, no browser needed).
