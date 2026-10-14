# Debugging the Tailwind Extractor CLI

How to run, inspect, and improve the extractor in isolation — the CLI that
captures a page section and converts its matched CSS into Tailwind classes
(`tailwindHtml`). The MCP tools call the same pipeline, so when a site comes
back with thin or wrong Tailwind, this is where you debug it.

Entry point: `dist/index.js` (compiled from `src/index.ts`). Build first:

```bash
cd snipkiwi-design-extract
npm run build            # tsc: src/ → dist/   (npm run dev = watch mode)
```

---

## Getting selectors without leaving the terminal (`--list`)

You don't have to open the site and hunt for selectors by hand. `--list` runs
the **same segmentation engine** `screenshot_page` uses (`discoverElements`) and
prints every section's selector, ready to paste into a real extraction run:

```bash
node dist/index.js --url https://goodfirms.co --list --timeout 45000
```

```
#1   Header       1366x76     .site-header
#2   Hero Section 1366x595    .hero-section-container
      "Get your plugin in front of…"
#10  Section      1366x977    .stats-section…
...
Extract one with:
  node dist/index.js --url https://goodfirms.co --selector '<selector>' --format json --json
```

- Columns: `#label  semanticType  WxH  selector` (plus a text preview line).
- **Pick the wide, tall bands** (full-width, `Hero`/`Section`/`Header`/`Feature`
  types) — those are the real content sections. The tiny `Widget` rows (e.g.
  `20x23` SVG paths) are noise, not sections worth extracting.
- Add `--json` to get a machine-readable array (`label`, `selector`,
  `semanticType`, `rect`, `textPreview`) you can pipe into a script.

These are the same numbered elements the `screenshot_page` MCP tool labels.

Chain it into an extraction in one line (grab the hero band by eye, then run it):

```bash
node dist/index.js -u https://goodfirms.co -l --json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).find(e=>/hero|section/i.test(e.semanticType)).selector))"
```

---

## Running it standalone

```bash
node dist/index.js --url <url> --selector "<css-selector>" [options]
```

A typical machine-readable run:

```bash
node dist/index.js \
  --url https://goodfirms.co \
  --selector "section.some-section" \
  --format json --json \
  --no-hover \
  --timeout 45000
```

- **stdout** = the extraction result (text, or JSON with `--json`).
- **stderr** = status + errors, including `Tailwind conversion error: …`.

### Flags

| Flag | Alias | Default | Meaning |
|------|-------|---------|---------|
| `--url` | `-u` | required | page to extract from |
| `--selector` | `-s` | required* | CSS selector for the target element (*not needed with `--list`) |
| `--list` | `-l` | off | discover sections and print their selectors, then exit (no extraction) |
| `--open` | | off | write the preview files **and open them in a browser** (implies `--format html`) |
| `--viewport` | `-v` | `all` | `all` (4 vp) / `responsive` (desktop+tablet+mobile, ~25% faster) / `desktop` / `tablet` / `mobile` / a px width |
| `--format` | `-f` | `both` | `css` / `tailwind` / `both` / `json` / `html` |
| `--json` | | off | structured JSON (same as `--format json`) |
| `--resolve-vars` | | on | resolve CSS variables to computed values |
| `--no-hover` | | off | skip hover/active state extraction |
| `--keep-unused-classes` | | off | keep classes not found in extracted rules |
| `--keep-unused-attrs` | | off | keep data-* / non-essential HTML attributes |
| `--output` | `-o` | stdout | write to a file/dir (`html` format writes files) |
| `--timeout` | | 30000 | page-load timeout (ms) |

### `--format html` — the fastest visual debug

Writes two standalone, self-contained HTML files — one with the section rebuilt
in **Tailwind** (`…_tailwind_….html`, pulls the Tailwind CDN + extracted CSS as
fallback), one with the **original** extracted CSS (`…_original_….html`). Open
them side by side to see whether the Tailwind rebuild matches the original.

`-o <dir>` is the output **directory** (auto-created); filenames are
`{domain}_{tailwind|original}_{selector}_{timestamp}.html`.

```bash
node dist/index.js -u https://plugmyplugin.com -s "section:nth-of-type(2)" -f html -o /tmp/extract
firefox /tmp/extract/*_tailwind_*.html /tmp/extract/*_original_*.html
```

### `--open` — write **and** open in one command

Skip the manual open step — `--open` writes the previews and launches them in a
browser (it implies `--format html`):

```bash
node dist/index.js -u https://plugmyplugin.com -s ".hero-section-container" --open -o /tmp/x
```

Browser resolution (Linux): `$BROWSER` → `x-www-browser` → `firefox` →
`chromium` → `google-chrome` → `xdg-open`. It deliberately avoids `xdg-open`
first, because the `text/html` MIME here is hijacked by Slack — `--open` will
never dump the preview into Slack. To force a specific browser:

```bash
BROWSER=firefox node dist/index.js -u https://plugmyplugin.com -s ".hero" --open -o /tmp/x
```

---

## Performance & the fidelity guarantee

Extraction time is dominated by two things: the **4 viewport passes** (`all`) and
**pseudo-state forcing** (`:hover`/`:checked`), which was run on every element.
The pipeline now:

- **Skips pseudo-state forcing** for elements no `:hover`/`:active`/`:checked`
  rule in the collected CSS could match (a CSS pre-scan in `pseudo-scanner.ts`
  builds the anchor sets). This is **lossless** — an element is skipped only when
  no such rule can reference its tag or classes; ids/attributes/universal
  selectors, or unreadable (cross-origin) stylesheets, force the full fallback.
- **Reuses element nodeIds** across viewport passes (no per-viewport
  `DOM.getDocument` / `DOM.querySelector`).
- Folds the old per-element tag/parent/type lookups into the single labeling pass.
- Larger read batches (`BATCH_SIZE`).
- `--viewport responsive` drops the redundant 1024px pass (~25% less work; NOT
  lossless — rules gated to a ~992–1199px band, e.g. Bootstrap `lg`-only, only
  fire near 1024, so keep `all` when you need that edge).

**Safety valve:** if a site's hover/checked output ever looks wrong, set
`SNIPKIWI_NO_PSEUDO_SKIP=1` to disable the skip optimization and restore the old
force-everything behavior. Also the A/B lever for proving the optimization is
lossless (run with it on vs off, diff the JSON — must be identical). Gate on a
local **deterministic fixture** (static HTML with hover/checked/media rules); do
**not** byte-diff against live sites like tailwindcss.com or getbootstrap.com — they're
non-deterministic run-to-run (live counters, async DocSearch).

## The JSON output shape

With `--json` / `--format json`:

| Key | Contains |
|-----|----------|
| `url`, `selector`, `timestamp` | echo of inputs + capture time |
| `html` | extracted HTML with **original** CSS classes |
| `css` | full CSS (imports, `@font-face`, variables, matched rules) |
| `tailwindHtml` | HTML with **Tailwind** classes — **empty/original if conversion failed** |
| `tailwindBodyClasses` | Tailwind classes for `<body>` |
| `fonts` | array of `@font-face` / Google Font records |
| `cssVariables` | `--var → value` map |

**A successful run** = `tailwindHtml` is non-empty **and** stderr has
no `Tailwind conversion error:`. So the two questions when debugging a FAIL are:
1. Did conversion **throw**? → look at stderr.
2. Did it silently produce **empty/degenerate** Tailwind? → inspect
   `tailwindHtml`.

---

## The conversion path (where to look)

All under `src/tailwind/`:

| File | Role |
|------|------|
| `tailwind-converter.ts` | **Orchestrator.** Loads labeled HTML with Cheerio, walks each marked element, pulls its matched rules, applies media (`sm:`/`md:`/…) and pseudo (`hover:`/`focus:`/…) prefixes, writes the final `class`. Also holds the icon-font class allow-list (`.fa-`, `.bi-`, …) that is preserved but not converted. |
| `css-to-tailwind.ts` | **Property→utility mapping.** `cssToTailwind(property, value)` maps ~80+ CSS properties to Tailwind classes; unmapped values fall back to arbitrary syntax `[prop:value]`; returns `null` if unmappable. **This is the file you extend most often.** |
| `shorthand-expander.ts` | Expands shorthands (`margin`, `padding`, `border`, `font`, …) to longhand before mapping. |
| `tailwind-reducer.ts` | Dedups/merges classes, collapses overlapping media ranges. |
| `tailwind-helpers.ts` | Media-query parsing (`(min-width:768px)`→`md:`), pseudo detection, CSS-variable resolution (max 10 levels deep). |

Supporting extraction (feeds the converter):

| File | Role |
|------|------|
| `src/extraction/extraction-pipeline.ts` | Batch extraction + calls `getTailwindHtml()` / `getTailwindBodyClasses()`. **`Tailwind conversion error:` is printed here (≈ lines 246, 463)** when conversion throws — non-fatal, CSS still returned. |
| `src/extraction/style-matcher.ts` | Processes CDP `CSS.getMatchedStylesForNode` → `ctx.matchingFinalRules`. If matched rules are wrong/empty, the converter has nothing to work with. |
| `src/extraction/result-builder.ts` | Assembles the final `css` output (fonts, variables, grouped rules). |

**High-level algorithm:** parse labeled HTML → for each marked element, read its
matched CSS rules → expand shorthands → map each property via `cssToTailwind()`
→ apply media/pseudo prefixes → reduce/dedup → write `class`.

---

## Known failure modes (why `tailwind_ok = false`)

1. **Unsupported property** → falls back to arbitrary `[prop:value]` (lower
   priority, sometimes visually off). Fix: add a handler in `css-to-tailwind.ts`.
2. **Complex shorthand** (`border`, `grid-template`, `animation` with `calc()`
   or variables) → expansion misses → arbitrary fallback. Fix:
   `shorthand-expander.ts`.
3. **Deep / circular CSS variables** → resolution caps at 10 levels → leaves
   `var(--unresolved)`. Fix: `tailwind-helpers.ts` resolver.
4. **Unsupported pseudo-selectors** (`::first-letter`, `::marker`,
   `::placeholder`, `::grammar-error`, …) → rule skipped, class not applied.
5. **Icon fonts** (`.fa-`, `.bi-`, `.material-icons`, …) → preserved as-is, never
   converted (icon fonts aren't Tailwind-expressible). Expected, not a bug.
6. **Pseudo-elements (`::before`/`::after`)** → limited `before:`/`after:`
   support; full rules are fallback-only.
7. **Bad matched rules** → if `style-matcher.ts` returned empty/wrong rules
   (SPA timing, shadow DOM, blocked page), `tailwindHtml` comes out degenerate
   even though nothing "errored". Check `css` output isn't empty first.

The property mapping table is hardcoded in `css-to-tailwind.ts` (roughly lines
386–1200) — there's no external config file.

---

## A debugging workflow for a failing site

```bash
cd snipkiwi-design-extract
npm run build

# 1. List the sections and copy a selector (no need to open the site):
node dist/index.js --url https://goodfirms.co --list --timeout 45000

# 2. Run the extractor with JSON and watch BOTH streams:
node dist/index.js -u https://goodfirms.co -s "section.hero" -f json --json --no-hover --timeout 45000 \
  1>/tmp/out.json 2>/tmp/err.txt

# 3. Did it throw?
grep -i "tailwind conversion error" /tmp/err.txt

# 4. Did it produce Tailwind at all? (empty tailwindHtml = the real problem)
node -e "const o=require('/tmp/out.json'); console.log('html', o.html.length, 'css', o.css.length, 'tw', (o.tailwindHtml||'').length)"

# 5. Eyeball the rebuild vs. the original (writes + opens both):
node dist/index.js -u https://goodfirms.co -s "section.hero" --open -o /tmp/gf
```

Interpretation:
- **css large but tailwindHtml empty** → conversion issue → dig into
  `css-to-tailwind.ts` / `shorthand-expander.ts`. Add `console.warn`s for the
  properties returning `null`.
- **css also empty** → upstream capture/matching issue → `style-matcher.ts`,
  or the page is blocked / JS-heavy (raise `--timeout`, try a different
  selector).
- **throws** → read the stack from stderr; the throwing call is in
  `extraction-pipeline.ts`.

### Finding which properties are unmapped

The quickest lever on coverage: instrument `cssToTailwind()` to log every
property/value it returns `null` for, run the extractor across a handful of
failing sites, and collect the most common misses — those are your next
handlers to add.

```ts
// temporary, in src/tailwind/css-to-tailwind.ts, right before a `return null`:
console.warn(`[unmapped] ${property}: ${value}`);
```

Rebuild, re-run against failing sites, sort the `[unmapped]` lines by frequency,
and implement the top offenders.

---

## Build & test

```bash
npm run build      # tsc → dist/
npm run dev        # tsc --watch
```

There is **no automated test suite** for the converter (no jest/vitest configs,
no `*.test.ts` fixtures). Testing is manual + end-to-end against live URLs via
the CLI above. If you invest in this tool, the highest-leverage addition is a
fixture-based test: save a few `{selector → expected-ish tailwind}` snapshots
from known-good sites and assert `cssToTailwind()` / `getTailwindHtml()` output
so changes don't regress coverage.

---

## Files most worth touching to improve accuracy

| File | Why |
|------|-----|
| `src/tailwind/css-to-tailwind.ts` | add/adjust property→utility handlers (biggest lever) |
| `src/tailwind/shorthand-expander.ts` | support more/complex shorthands |
| `src/tailwind/tailwind-helpers.ts` | media-query & CSS-variable resolution edge cases |
| `src/tailwind/tailwind-converter.ts` | prefix logic, icon-font allow-list, element walking |
| `src/extraction/style-matcher.ts` | fix wrong/empty matched rules (fixes "silent empty" fails) |
