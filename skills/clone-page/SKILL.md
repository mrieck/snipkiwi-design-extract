---
name: clone-page
description: Use when you want to clone a whole web page, every section top to bottom, from its real authored CSS. Give the URL and optionally what to change, e.g. "clone plugmyplugin.com but with our logo, a blue accent and a pricing section instead of the contest". Builds the page in your project (or as a standalone HTML file), then compares it to the original section by section.
argument-hint: "<URL to clone, plus any changes, e.g. 'plugmyplugin.com but with our logo and no sidebar'>"
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *)
---

# Clone a whole page

Rebuild an entire live page, section by section, from the CSS the browser actually matched (not computed styles, not a screenshot guess). Apply whatever changes the user asked for on the way. Verify each section against the original before reporting.

For one section rather than a whole page, use the `extract` skill instead.

## Workflow

### Step 1: DISCOVER

Call `screenshot_page` with the URL at the `desktop` viewport. Study the screenshot so you understand the page top to bottom. Then call `list_page_elements` for the same URL to get the full numbered list as text.

If the user didn't give a URL, ask for one.

### Step 2: PLAN THE SECTIONS

From the legend, write down the **top-level** sections in page order: header/nav, hero, each content block, footer, and so on. Pick the outermost selector for each so nested cards and widgets come along with their parent. Skip overlays that are not part of the page design (cookie banners, consent modals, ad slots, chat widgets, dev toolbars). Also drop any hidden modals or dialogs that come along inside a section's HTML (login modals, menus): the extracted markup loses the `hidden` attribute and inline `display:none`, so they render open in the clone.

Decide what the user's requested changes mean per section:
- **Drop** a section ("no sidebar", "without the newsletter block")
- **Replace** a section ("a pricing section instead of the contest")
- **Edit** content or styling ("our logo", "blue accent", "our product name")
- **Keep** everything else as-is

Tell the user the plan in a few lines (sections found, what will change) and continue. Only stop to ask if a requested change is ambiguous about *which* section it applies to.

### Step 3: EXTRACT EVERY SECTION

For each planned section, call `extract_css_convert_tailwind` with:
- `url`: the page URL
- `selector`: that section's selector
- `viewport`: `"all"`
- `resolveVariables`: `false` — for a whole page you want one shared `:root` and `var()` references, not the same hex values inlined in every section. (Resolved values also reflect the headless browser's color scheme, which is dark, so a site with a dark theme would come back dark everywhere.)
- `includeHoverStates`: `true`

Collect the `html`, `css`, `tailwindHtml` and `fonts` for each. If a selector fails, try a broader parent or a more specific child, and if it still fails, say so and move on so one bad section doesn't stop the clone.

When the page is short, you can try a single extraction with `main` or `body` first, then fall back to per-section extraction if the result is too large or incomplete.

### Step 4: ASSEMBLE THE PAGE

**Where it goes:**
- If the user is inside a project, build it as a page in that project using its framework and styling approach (React/Next.js, Vue, Svelte, Astro, Rails, plain HTML; Tailwind vs. plain CSS vs. CSS Modules). Read the codebase first and follow its conventions for file placement and naming.
- If there is no project, or the user asked for a file, produce a standalone `index.html` with one stylesheet.

**Merging the CSS:** every section's output repeats the shared bits. Keep one copy of each `@font-face`, each `:root` variable block and each `@keyframes`. Keep every section's own rules. Watch for the same class name styled differently in two sections and rename one if they collide.

**Body-level styles:** apply the reference's body background, text color, font family and base font size once at the page level. If the reference sets a root font size (e.g. `html { font-size: 62.5% }`), either carry it over or convert every `rem` value, otherwise the clone renders at the wrong scale.

**Apply the requested changes** while assembling: swap text, images and logos; drop or replace sections; change colors by editing the variable or the handful of rules that use them rather than hunting through every declaration.

**Assets:** replace remote image URLs with local placeholders or the user's own assets, and list every one that still needs replacing. Keep `alt` text.

### Step 5: VERIFY SECTION BY SECTION

If a dev server is running, or one can be started cheaply, or the result is a standalone file you can serve locally:

1. Load the clone at a local URL.
2. For each kept section, call `compare_to_reference` with `reference_url` + `reference_selector` (the original) and `local_url` + `local_selector` (your clone), at the `desktop` viewport. Run the mobile viewport too for the header, hero and any section the user called out.
3. Fix the reported deviations, except ones the user asked for (dropped sections, replaced content, new colors). Re-run that section's comparison.
4. Stop after each section's report is clean or after ~3 passes per section. List what was left and why.

Take one `screenshot_page` of the finished local page as a final sanity check of the whole thing.

### Step 6: REPORT

Tell the user:
- Which sections were cloned, dropped, replaced or edited
- Where the page and its stylesheet live
- Assets that still need replacing (with line references)
- Fonts to install or load
- Any sections that could not be extracted, and any deviations left on purpose

## Notes

- `screenshot_page` and `list_page_elements` share the same element discovery, so the numbered labels match
- Prefer fewer, larger sections over many small ones; a parent extraction includes its children
- Cloning is for learning layouts, prototyping and migrating your own sites. Don't impersonate a brand or pass someone else's design off as your own, and respect the terms of the site being cloned
