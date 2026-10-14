---
name: extract
description: Use when you need the real HTML, CSS and Tailwind from any section(s) of any live website. Name the section and the URL, e.g. "the homepage upvote list on plugmyplugin.com". Returns the authored CSS as the browser matched it (media queries, hover states, fonts, variables) plus a Tailwind version, and integrates it into your project if you ask.
argument-hint: "<what to extract and the URL, e.g. 'the homepage upvote list on plugmyplugin.com'>"
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *)
---

# Extract a section from a live page

Pull the real code behind one or more sections of any website: the authored CSS as the browser matched it (not computed styles, not a screenshot guess), plus a Tailwind conversion. Hand back the code by default. Integrate it into the user's project when they ask, and then verify it against the original.

To clone a whole page, every section top to bottom, use the `clone-page` skill instead.

## Workflow

### Step 1: DISCOVER

Call the `screenshot_page` MCP tool with the target URL. This returns:
- An annotated screenshot with numbered labels (#1, #2, #3...) overlaid on page elements
- A text legend mapping each number to its CSS selector, semantic type, size, and content preview

Look at the screenshot visually to understand the page layout. For a long page, `list_page_elements` gives the same numbered list as text. If the user didn't specify a URL, ask for one.

### Step 2: IDENTIFY

Match the user's natural language description to the numbered elements:
- "the sidebar" → elements labeled Sidebar, `aside` tags, side-positioned elements
- "the pricing cards" → Card-type elements with pricing-related text
- "the navigation" → Navigation/Header type elements
- "the hero section" → Hero Section type elements near the top

If the user named several sections, identify each one. If a match is ambiguous, ask the user to clarify by referencing the numbered labels:
> "I see several card-like elements: #4 (Card, 350x280) and #7 (Card, 350x280). Which one did you mean, or should I extract the whole section containing them?"

### Step 3: EXTRACT

For each identified section, call the `extract_css_convert_tailwind` MCP tool with:
- `url`: the target URL
- `selector`: the CSS selector from the identified element
- `viewport`: `"all"` for responsive extraction (default)
- `resolveVariables`: `true`
- `includeHoverStates`: `true`

The tool returns:
- `html` — clean extracted HTML
- `css` — complete CSS with fonts, variables, keyframes, media queries
- `tailwindHtml` — HTML with Tailwind utility classes
- `tailwindBodyClasses` — body-level Tailwind classes
- `fonts` — font definitions used
- `cssVariables` — resolved CSS custom properties

**If the user only wanted the code**, return the HTML + CSS and the Tailwind version in fenced blocks, note the fonts and any remote image URLs, and stop here. Mention in one line that you can integrate it into their project if they want.

### Step 4: INTEGRATE (only when the user asks)

Read the codebase before writing anything:
- Framework: React/Next.js, Vue, Svelte, Astro, Rails, Django, plain HTML, etc.
- Styling: Tailwind (check the major version), CSS Modules, styled-components, plain CSS/SCSS
- Component conventions: file structure, naming, export patterns, how existing components are composed

**Styling decision:**
- Project uses Tailwind → use the `tailwindHtml` output
- Project uses plain CSS/SCSS → use the `html` + `css` output
- Project uses CSS Modules/styled-components → convert the CSS to that format

**Match the reference or match the project?** Default to matching the reference exactly: same colors, spacing, fonts. If the user said anything like "in our colors", "match our theme", or "make it fit", map the extracted values onto what the project already defines instead:
- Find the project's named values: `tailwind.config.{js,ts}` theme (Tailwind ≤3), `@theme` blocks in CSS (Tailwind 4), CSS custom properties in a global stylesheet, or a theme file.
- For each extracted color, spacing value, radius, shadow and font, use the project's closest named value when one exists (extracted `#0f172a` and the project defines `slate-900` or `--color-ink` → use that). Introduce new raw values only when nothing in the project is close, and prefer adding them to the theme over inlining magic numbers.
- If it isn't clear which the user wants and the project's palette differs a lot from the reference, ask once.

**Framework adaptation:**
- React/Next.js → JSX (`className`, self-closing tags, camelCase style props)
- Vue → SFC template syntax; Svelte → `.svelte` component; Astro → `.astro` component; Rails ERB/HAML → template format
- Replace remote image URLs with local-asset placeholders and list them for the user
- Add font imports only if the extracted design uses fonts not already in the project (ask if it conflicts with the project font)
- Note that reference sites sometimes set a root font size (e.g. `html { font-size: 62.5% }`), so `rem` values may need converting for the project's root

**Integration:**
- Place the component following the project's structure and wire it up where the user needs it (if placement is clear)
- Match naming conventions, export patterns, and coding style of neighboring components

### Step 5: VERIFY (after integrating, when a dev server is available)

If the project has a dev server, or one can be started cheaply, close the loop:

1. Render the new component on a local page and make sure the dev server is reachable (e.g. `http://localhost:3000/...`).
2. Call the `compare_to_reference` MCP tool with:
   - `reference_url` + `reference_selector`: the original element
   - `local_url`: the local page; `local_selector`: the selector for your implementation
   - `viewport`: match what the user cares about (default desktop)
3. The tool returns side-by-side screenshots plus a structured deviation report ("your padding is 16px, reference is 24px"; missing/extra elements).
4. Fix the reported deviations, except ones that are intentional (project-theme substitutions, replaced fonts/images, content changes the user asked for). Re-run the comparison.
5. Stop after the report is clean or after ~3 iterations; list any remaining deviations and why they were left.

### Step 6: REPORT

Briefly tell the user:
- What was extracted and from where
- Where the component was placed in their project (if integrated)
- Any manual steps needed (e.g., "Replace the placeholder images at lines X-Y with your own assets")
- Any fonts or dependencies that may need to be added
- Any deviations from the reference that were left on purpose

## Notes

- The `screenshot_page` and `list_page_elements` tools share the same element discovery — the numbered labels match between them
- If extraction fails on a selector, try a broader parent selector or a more specific child
- For complex multi-part designs (e.g., an entire page section with nested cards), extract the outermost container to get everything
- The extraction tool handles responsive styles automatically when viewport is set to "all"
- `screenshot_page` works on `localhost` URLs too, which is a quick way to eyeball an integrated result
