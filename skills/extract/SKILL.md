---
name: extract
description: Extract an element's real HTML, CSS and Tailwind from any live web page. Use when the user wants the code behind a specific element ("grab the pricing table on stripe.com", "give me the CSS of that navbar", "convert this component to Tailwind") rather than a full rebuild in their stack. Returns clean HTML, complete CSS (media queries, hover states, fonts, variables) and a Tailwind version, then drops it into the project if asked.
argument-hint: "<what to extract and the URL, e.g. 'the pricing table on stripe.com/pricing'>"
allowed-tools: Bash(node *), Bash(npm *), Bash(npx tsc *)
---

# Extract an element from a live page

Pull the real code behind one element of any website: the authored CSS as the browser matched it (not computed styles, not a screenshot guess), plus a Tailwind conversion. Integrate it into the user's project only if they asked for that; otherwise hand back the code.

## Workflow

### Step 1: DISCOVER

Call the `screenshot_page` MCP tool with the target URL. This returns:
- An annotated screenshot with numbered labels (#1, #2, #3...) overlaid on page elements
- A text legend mapping each number to its CSS selector, semantic type, size, and content preview

Look at the screenshot visually to understand the page layout.

### Step 2: IDENTIFY

Match the user's natural language description to the numbered elements:
- "the sidebar" → look for elements labeled as Sidebar, aside tags, or side-positioned elements
- "the pricing cards" → look for Card-type elements with pricing-related text
- "the navigation" → look for Navigation/Header type elements
- "the hero section" → look for Hero Section type elements near the top

If the match is ambiguous (multiple possible elements), ask the user to clarify by referencing the numbered labels:
> "I see several card-like elements: #4 (Card, 350x280) and #7 (Card, 350x280). Which one did you mean, or should I extract the whole section containing them?"

If the user didn't specify a URL, ask for one.

### Step 3: EXTRACT

Call the `extract_css_convert_tailwind` MCP tool with:
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

### Step 4: INTEGRATE (only if the user asked for it)

If the user only wanted the code, return the HTML + CSS and the Tailwind version in fenced blocks and stop here. Otherwise, you have full context of the user's project. Read the codebase to understand:
- What language/framework is used (React, Vue, Svelte, Rails, Django, plain HTML, etc.)
- What styling approach is used (Tailwind, CSS Modules, styled-components, plain CSS, SCSS, etc.)
- What the component/file structure looks like
- What existing patterns to follow

Then adapt and integrate the extracted design:

**Styling decision:**
- If the project uses Tailwind → use the `tailwindHtml` output
- If the project uses plain CSS/SCSS → use the `html` + `css` output
- If the project uses CSS Modules/styled-components → convert the CSS to that format

**Framework adaptation:**
- React/Next.js → Convert to JSX (className, self-closing tags, camelCase style props)
- Vue → Convert to SFC template syntax
- Svelte → Convert to .svelte component format
- Rails ERB/HAML → Convert to template format
- Any other framework → adapt accordingly using your knowledge of that framework

**Integration:**
- Place the component where it makes sense in the project structure
- Adapt image URLs (note which ones need replacing with local assets)
- Add font imports if the extracted design uses fonts not already in the project
- Match the project's naming conventions, export patterns, and coding style
- Wire up the component where the user needs it (if the placement is clear)

### Step 5: REPORT

After integration, briefly tell the user:
- What was extracted and from where
- Where the component was placed in their project
- Any manual steps needed (e.g., "Replace the placeholder images at lines X-Y with your own assets")
- Any fonts or dependencies that may need to be added

## Notes

- The `screenshot_page` and `list_page_elements` tools share the same element discovery — the numbered labels match between them
- If extraction fails on a selector, try a broader parent selector or a more specific child
- For complex multi-part designs (e.g., an entire page section with nested cards), extract the outermost container to get everything
- The extraction tool handles responsive styles automatically when viewport is set to "all"
- To rebuild something in the user's stack and verify it against the original, use the `build-like` skill instead; it adds token mapping and a `compare_to_reference` loop
