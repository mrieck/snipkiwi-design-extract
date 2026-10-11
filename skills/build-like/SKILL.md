---
name: build-like
description: Build UI like any website. Use when the user wants to clone, copy, or build something "like" an element on another site (e.g. "add a sidebar like the one on xyz.com", "make our pricing cards look like stripe.com"), convert an extracted design to their stack, or pull exact CSS/Tailwind from a live page. Extracts ground-truth CSS over Chrome DevTools Protocol, adapts it to the user's codebase, and verifies the result against the reference.
argument-hint: "<what to build and the reference URL, e.g. 'a sidebar like the one on xyz.com'>"
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *)
---

# Build It Like That Site

Take a reference element from any live website, extract its real CSS (not a screenshot guess), rebuild it in the user's project using the project's own conventions and design tokens, then verify the result against the reference until it matches.

## Workflow

### Step 1: DISCOVER

Call the `screenshot_page` MCP tool with the reference URL. This returns:
- An annotated screenshot with numbered labels (#1, #2, #3...) overlaid on page elements
- A text legend mapping each number to its CSS selector, semantic type, size, and content preview

Look at the screenshot visually to understand the page layout. If the user didn't specify a URL, ask for one. For a long page, `list_page_elements` gives the same numbered list as text.

### Step 2: IDENTIFY

Match the user's natural language description to the numbered elements:
- "the sidebar" → elements labeled Sidebar, `aside` tags, side-positioned elements
- "the pricing cards" → Card-type elements with pricing-related text
- "the navigation" → Navigation/Header type elements
- "the hero section" → Hero Section type elements near the top

If the match is ambiguous (multiple possible elements), ask the user to clarify by referencing the numbered labels:
> "I see several card-like elements: #4 (Card, 350x280) and #7 (Card, 350x280). Which one did you mean, or should I extract the whole section containing them?"

### Step 3: EXTRACT

Call the `extract_css_convert_tailwind` MCP tool with:
- `url`: the reference URL
- `selector`: the CSS selector from the identified element
- `viewport`: `"all"` for responsive extraction (default)
- `resolveVariables`: `true`
- `includeHoverStates`: `true`

The tool returns ground truth: clean HTML, complete CSS (fonts, variables, keyframes, media queries), Tailwind-converted HTML, body-level Tailwind classes, font definitions, and resolved CSS custom properties.

### Step 4: ADAPT TO THE PROJECT

This is the step that separates "pasted a clone" from "built it like the user's team would". Read the codebase before writing anything:

**Detect the stack:**
- Framework: React/Next.js, Vue, Svelte, Rails, Django, plain HTML, etc.
- Styling: Tailwind (check the major version), CSS Modules, styled-components, plain CSS/SCSS
- Component conventions: file structure, naming, export patterns, how existing components are composed

**Map onto the project's design tokens (do not dump raw values):**
- Find the project's token sources: `tailwind.config.{js,ts}` theme (Tailwind ≤3), `@theme` blocks in CSS (Tailwind 4), CSS custom properties in a global stylesheet, or a tokens/theme file.
- For every extracted color, spacing value, radius, shadow, and font: if the project already has a token close to it (e.g. extracted `#0f172a` and the project defines `slate-900` or `--color-ink`), **use the project token**. The goal is a component that looks like the reference but belongs to the codebase.
- Only introduce new raw values when nothing in the project is close — and prefer adding them as tokens (extend the theme / add a custom property) rather than inlining magic numbers.
- If the project's existing palette deviates meaningfully from the reference (e.g. their brand blue vs. the reference's blue), ask the user once: match the reference exactly, or restyle it in the project's palette?

**Framework adaptation:**
- React/Next.js → JSX (`className`, self-closing tags, camelCase style props)
- Vue → SFC template syntax; Svelte → `.svelte` component; Rails ERB/HAML → template format
- Replace remote image URLs with local-asset placeholders and note them for the user
- Add font imports only if the extracted design uses fonts the user wants kept (ask if it conflicts with the project font)

**Integration:**
- Place the component following the project's structure and wire it up where the user needs it (if placement is clear)
- Match naming conventions, export patterns, and coding style of neighboring components

### Step 5: VERIFY (compare loop)

If the project has a dev server (or one can be started cheaply), close the loop:

1. Render the new component on a local page and make sure the dev server is reachable (e.g. `http://localhost:3000/...`).
2. Call the `compare_to_reference` MCP tool with:
   - `reference_url` + `reference_selector`: the original element
   - `local_url`: the local page; `local_selector`: the selector for your implementation
   - `viewport`: match what the user cares about (default desktop)
3. The tool returns side-by-side screenshots plus a structured deviation report ("your padding is 16px, reference is 24px"; missing/extra elements).
4. Fix the reported deviations — **except** ones that are intentional (project-token substitutions from Step 4, replaced fonts/images). Re-run the comparison.
5. Stop after the report is clean or after ~3 iterations; list any remaining deviations and why they were left.

If no dev server is practical, skip this step and say so in the report.

### Step 6: REPORT

Briefly tell the user:
- What was extracted and from where
- Where the component was placed and how it was wired in
- Which reference values were mapped onto existing project tokens (so they know it's idiomatic, not hard-coded)
- The verification outcome: clean match, or remaining deviations and why
- Any manual steps (replace placeholder images, confirm font licensing, etc.)

## Notes

- `screenshot_page` and `list_page_elements` share the same element discovery — the numbered labels match between them
- If extraction fails on a selector, try a broader parent selector or a more specific child
- For complex multi-part designs (a section with nested cards), extract the outermost container to get everything
- Extraction handles responsive styles automatically when viewport is `"all"`; `compare_to_reference` checks one viewport per call, so compare mobile separately if it matters
