# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**SnipKiwi**: a Claude Code / Codex plugin that extracts the real CSS behind any element of a live
web page and converts it to Tailwind. One TypeScript codebase, two entry points:

- `src/mcp-server.ts` → `src/server.ts`: the MCP server (stdio). Four tools: `screenshot_page`,
  `list_page_elements`, `extract_css_convert_tailwind`, `compare_to_reference`.
- `src/index.ts`: the CLI (`node dist/index.js --url … --selector …`, or `--list`).

Plus two shipped skills in `skills/` (`extract`, `clone-page`) that tell Claude how to chain the tools.

Everything is free and local. No account, no API key, no telemetry, no backend. Keep it that way:
the privacy claim on snipkiwi.com/claude and in the README is "nothing leaves your machine except
the page fetch".

This repo was created October 2026 from `tailcode-plugin` (branch `tailcode-github-distribution`),
itself a rename of `snipcss-playwright-claudeplugin`. The paid design-search stack (`inspiration.ts`,
PyWebview picker, pg/Voyage, `section-shooter`) and the Apify actor were removed here; they live on
in `tailcode-plugin` / `tailcode-db-builder` if the free plugin ever earns a paid tier.

## Build, run, test

```sh
npm install
npm run build          # tsc → dist/
npm run check          # build + scripts/smoke.mjs (initialize + tools/list, expects the 4 tools)
node dist/index.js --url https://stripe.com --list
node dist/index.js --url https://stripe.com --selector header --format both
```

No test framework. Dev-only skills in `.claude/skills/` (`/build-check`, `/test-extract`, `/test-mcp`,
`/test-compare`) exercise the pieces. `docs/EXTRACTOR_DEBUGGING.md` covers debugging the extractor.

## Distribution (GitHub only, no npm)

Users install with `/plugin marketplace add mrieck/snipkiwi-design-extract` then
`/plugin install snipkiwi@snipkiwi`. Claude Code copies the repo into its plugin cache and, because
`package.json` + `package-lock.json` are present, runs a frozen `npm install` there itself.
`.mcp.json` then launches `node ${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js`.

Consequences:

- **`dist/*.js` is committed.** Run `npm run build` and commit `dist/` with every source change.
  `.d.ts` and sourcemaps are gitignored.
- **`package-lock.json` is committed** and must stay in sync with `package.json`.
- **Bump `version` in `.claude-plugin/plugin.json`** (and `SERVER_VERSION` in `src/server.ts`,
  `package.json`) for every release; Claude Code keys its cache on it. Then tag `vX.Y.Z`.
- `package.json` is `private: true`. Nothing is published to npm.
- `src/preflight.ts` runs before the server loads: if `node_modules` is missing it prints the one
  `npm install` command to run. `browser-manager.ts` tries Google Chrome, then patchright's bundled
  Chromium, then fails with the `npx patchright install chromium` hint.

Local plugin test: `/plugin marketplace add /abs/path/to/this/repo`, `/plugin install snipkiwi@snipkiwi`,
`/reload-plugins`. The cache is a copy, not a symlink, so bump the version to pick up changes.

Codex users clone the repo, `npm install --omit=dev`, and `codex mcp add snipkiwi -- node
~/snipkiwi/dist/mcp-server.js` (README has the exact commands).

## Architecture

### Extraction pipeline (`src/extraction/extraction-pipeline.ts`)

1. Open the page (`browser-manager.ts`), attach a CDP session, collect stylesheets via
   `CSS.styleSheetAdded` (`stylesheet-collector.ts`), navigate, wait for network idle.
2. Label the target subtree with `snipkiwi{id}-{level}-{parentId}-{currId}` marker classes
   (`dom-labeler.ts`); original author classes are captured first.
3. Parse fonts (`font-collector.ts`), variables (`css-variable-resolver.ts`), keyframes.
4. Pre-scan the collected CSS for `:hover`/`:checked` rules (`pseudo-scanner.ts`) so pseudo-state
   forcing is skipped when nothing can match (`SNIPKIWI_NO_PSEUDO_SKIP=1` disables the skip).
5. Per viewport (`viewport-manager.ts`: `all`, `responsive` = desktop/tablet/mobile, or one):
   `CSS.getMatchedStylesForNode` in batches (`style-matcher.ts`), then `CSS.forcePseudoState`
   (`pseudo-state-handler.ts`). Node ids are resolved once and reused across viewports.
6. Build CSS (`result-builder.ts`, `rule-deduplicator.ts`, `specificity.ts`), convert to Tailwind
   (`src/tailwind/`), clean the HTML (`html-cleaner.ts`), strip markers.

`ExtractionContext` in `src/types/index.ts` is the mutable state passed through all of this.

### Tailwind (`src/tailwind/`)

`tailwind-converter.ts` walks the labeled HTML with Cheerio and maps matched rules to classes using
`css-to-tailwind.ts` (property-level mapping), `shorthand-expander.ts`, `tailwind-helpers.ts` and
`tailwind-reducer.ts`. Media queries become `sm:`/`md:`/`lg:` prefixes, pseudo-classes become
`hover:` etc.

### Element discovery (`src/extraction/element-discovery.ts`)

Shared by `screenshot_page`, `list_page_elements` and the CLI `--list`: segments the page into
labeled sections (`#1 Header 1366x76 .nav`), injects/removes the numbered overlay.

### Compare (`src/extraction/style-differ.ts`)

`captureElementStyles` snapshots computed styles + rects for an element subtree; `diffStyles` and
`formatDiffReport` turn a reference/candidate pair into the deviation report returned by
`compare_to_reference`.

## Conventions

- ES modules; imports use `.js` extensions.
- Status and progress go to **stderr**. stdout is the MCP channel / CLI output. Never `console.log`
  in server code.
- Uses raw CDP for CSS inspection because Playwright doesn't expose `getMatchedStylesForNode` or
  `forcePseudoState`. `patchright` (a stealth Playwright fork) is the browser driver.
- Brand strings: **SnipKiwi** for the plugin, **SnipCSS Kiwi** for the Chrome extension. No "Pro",
  "upgrade", or account language anywhere.
- Marker-class prefix `snipkiwi` appears in `dom-labeler.ts`, `tailwind-converter.ts`,
  `element-discovery.ts` and `utils/helpers.ts`; change them together.
