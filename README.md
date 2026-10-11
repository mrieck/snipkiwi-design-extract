# SnipKiwi — extract any website's design as real CSS and Tailwind

**Point Claude at a live page. Get the real code behind any element.**

SnipKiwi is a free MCP server + skills for [Claude Code](https://claude.com/claude-code) and
[Codex CLI](https://developers.openai.com/codex). It opens the page in a headless browser, reads the
CSS the browser actually matched for the element you pick (over the Chrome DevTools Protocol, not
`getComputedStyle`), keeps the media queries, hover states, fonts and variables, converts it to
Tailwind, and then Claude adapts it to your codebase and verifies the result against the original.

From the makers of the SnipCSS Chrome extension, now free as
[SnipCSS Kiwi](https://chromewebstore.google.com/detail/snipcss-kiwi-free/lhljehcbbofodgfkibklodekancpgolp).
Site and docs: [snipkiwi.com/claude](https://snipkiwi.com/claude).

<!-- demo gif: docs/demo.gif -->

---

## Install: Claude Code

```
/plugin marketplace add mrieck/snipkiwi-design-extract
/plugin install snipkiwi@snipkiwi
```

That is all. Claude Code installs the plugin's packages itself. You need Node 18+ and Google Chrome
(if Chrome is missing, SnipKiwi falls back to a bundled Chromium and tells you how to fetch it).

Then, in any project:

```
/snipkiwi:build-like a pricing section like the one on stripe.com/pricing
/snipkiwi:extract the navbar on linear.app
```

or just ask: *"Make our sidebar look like the one on notion.so"*. Claude picks the tools itself.

## Install: Codex CLI

```sh
git clone https://github.com/mrieck/snipkiwi-design-extract ~/snipkiwi
cd ~/snipkiwi && npm install --omit=dev
codex mcp add snipkiwi -- node ~/snipkiwi/dist/mcp-server.js
```

Complex pages can take a while. In `~/.codex/config.toml`:

```toml
[mcp_servers.snipkiwi]
tool_timeout_sec = 120
```

---

## What it does

| Tool | What it does |
| --- | --- |
| `screenshot_page` | Annotated screenshot of a page at desktop, tablet or mobile width, with numbered labels and a legend. "The pricing cards" becomes `#7`. |
| `list_page_elements` | The same discovery as text: selector, type, size and a content preview for every major element. |
| `extract_css_convert_tailwind` | The main tool. Extracts one element (and its subtree) as clean HTML, complete CSS and a Tailwind version. Media queries, `:hover`/`:focus`/`:active`, pseudo-elements, `@font-face`, `@keyframes` and resolved `var()`s included. |
| `compare_to_reference` | After Claude rebuilds the element in your project, compares your local page against the original at the same viewport: side-by-side screenshots plus a deviation report ("your padding is 16px, reference is 24px"). Claude fixes and re-runs until it is clean. |

Two skills drive them:

- **`/snipkiwi:build-like`** — discover → identify → extract → adapt to *your* stack and design
  tokens → verify with `compare_to_reference` → report. Use this to build something "like" a site.
- **`/snipkiwi:extract`** — discover → identify → extract → hand back the code (or drop it in if asked).
  Use this when you just want the HTML/CSS/Tailwind.

## Why not just clone the whole site?

Tools that rebuild an entire page from `getComputedStyle()` values or screenshots are great when you
want the whole page. SnipKiwi is for the other 90% of the time:

- **Authored CSS, not computed values.** It reads the rules the browser matched, so you get `padding:
  var(--space-4)` and `@media (min-width: 768px)`, not 400 flattened declarations per element.
  Responsive behaviour survives extraction.
- **One element, not one site.** Pick the hero, the nav, the pricing table. A few thousand tokens of
  output instead of a multi-agent rebuild.
- **Closes the loop.** `compare_to_reference` measures your implementation against the original
  instead of eyeballing a screenshot.
- **Adapts instead of pasting.** The `build-like` skill maps extracted colours, spacing and fonts onto
  the tokens your project already has.

## What leaves your machine

Nothing except the page fetch itself. The browser runs locally, the extraction runs locally, there is
no account, no API key and no telemetry. The plugin makes no network requests other than loading the
URLs you give it.

## Please don't

Use it to learn layouts, migrate your own sites, prototype, and build things *like* what you admire.
Don't use it to impersonate a brand, phish, or pass someone's design off as your own. Respect the
terms of the sites you point it at.

---

## CLI

The extractor also runs on its own:

```sh
node dist/index.js --url https://stripe.com --list                # discover selectors
node dist/index.js --url https://stripe.com --selector header --format both
node dist/index.js --url https://stripe.com --selector header --open   # preview files in a browser
```

Flags: `--viewport all|responsive|desktop|tablet|mobile|<px>`, `--format css|tailwind|both|json|html`,
`--no-hover`, `--resolve-vars`, `--timeout 30000`, `--output <path>`. See
[docs/EXTRACTOR_DEBUGGING.md](docs/EXTRACTOR_DEBUGGING.md).

## Development

```sh
npm install
npm run build          # tsc → dist/ (dist/*.js is committed so the plugin runs from a git checkout)
npm run check          # build + MCP smoke test (tools/list)
```

Test the plugin from a local checkout: `/plugin marketplace add /path/to/snipkiwi-design-extract`,
then `/plugin install snipkiwi@snipkiwi`. Bump `version` in `.claude-plugin/plugin.json` to force
Claude Code to pick up a new copy. See [CLAUDE.md](.claude/CLAUDE.md) for the architecture.

## Formerly SnipCSS

SnipCSS was a paid Chrome extension and the `@productivemark/snipcss` plugin. Both are now free:
the extension as [SnipCSS Kiwi](https://chromewebstore.google.com/detail/snipcss-kiwi-free/lhljehcbbofodgfkibklodekancpgolp),
the plugin as this repo. The old npm package is frozen at 1.1.4 and still carries the old
25-extraction limit; switch to this one.

## License

[MIT](LICENSE) © Productive Mark LLC
