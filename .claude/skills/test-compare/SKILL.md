---
name: test-compare
description: Compare CSS extraction results between two runs or two selectors on the same page, to verify consistency and correctness
argument-hint: "<url> <selector1> [selector2]"
user-invocable: true
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *), Read, Write
---

# Compare Extraction Results

Run extraction on one or two selectors and compare/analyze the results.

## Mode 1: Single selector stability test (2 args)

If only URL and one selector provided:
1. Build: `npx tsc`
2. Run extraction twice on the same URL + selector
3. Compare the two JSON outputs
4. Report whether results are deterministic (identical CSS, HTML, Tailwind)
5. If differences found, show exactly what differs

## Mode 2: Two selector comparison (3 args)

If URL and two selectors provided:
1. Build: `npx tsc`
2. Run extraction on selector1, save to /tmp/snipkiwi-test-1.json
3. Run extraction on selector2, save to /tmp/snipkiwi-test-2.json
4. Compare:
   - How many CSS rules each produced
   - Whether they share any CSS rules
   - Tailwind class overlap
   - HTML structure differences

## Commands

```bash
# Run extraction and capture JSON
node dist/index.js --url "$URL" --selector "$SEL" --format json 2>/dev/null
```

## Output

Present results as a clear comparison table with pass/fail indicators.
Clean up temp files when done.
