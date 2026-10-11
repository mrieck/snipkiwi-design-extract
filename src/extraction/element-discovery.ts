import { Page } from 'patchright';

/**
 * Discovered element with semantic information for agent-driven extraction.
 */
export interface DiscoveredElement {
  /** Numeric label (1, 2, 3...) for referencing in screenshots */
  label: number;
  /** Unique CSS selector guaranteed to match exactly one element */
  selector: string;
  /** HTML tag name */
  tag: string;
  /** Semantic role inferred from tag, ARIA role, class names, and position */
  semanticType: string;
  /** Parent chain context (e.g., "inside main > .content") */
  parentContext: string;
  /** Bounding box (absolute, accounting for scroll) */
  rect: { x: number; y: number; width: number; height: number };
  /** Background color (computed) */
  backgroundColor: string;
  /** Number of child elements */
  childCount: number;
  /** Text content preview (first 80 chars) */
  textPreview: string;
  /** Element's class list */
  classes: string;
  /** Element's id */
  id: string;
  /** Nesting depth from body */
  depth: number;
}

/** Max descendants before a parent segment is considered too large and split */
const MAX_PARENT_SECTION = 800;

/** Max height (px) for bottom-up parent merging */
const MAX_MERGE_HEIGHT = 2000;

/** Grid step size (px) for elementFromPoint sampling */
const GRID_STEP = 80;

/**
 * Discover page segments using the SnipKiwi page segmenter approach:
 * 1. Sample visible elements via grid-point probing (elementFromPoint)
 * 2. Scroll the page to catch all content including lazy-loaded
 * 3. Bottom-up merge: consolidate small elements into parent containers
 * 4. Smart filter: split oversized parents, remove redundant wrappers
 * 5. Generate unique selectors and enrich with semantic metadata
 *
 * Ported from snip-extension/js/page_segmenter.js
 */
export async function discoverElements(page: Page): Promise<DiscoveredElement[]> {
  // Scroll the page and collect elements at grid points
  const rawElements = await page.evaluate(async (gridStep: number) => {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'LINK', 'META', 'BR', 'HR']);

    // --- Step 1: Scroll to bottom to trigger lazy loading ---
    const scrollHeight = document.body.scrollHeight;
    // Only do scroll passes for tall pages
    if (scrollHeight > 3500) {
      let previousHeight = 0;
      let attempts = 0;
      while (attempts < 3) {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 1500));
        const newHeight = document.body.scrollHeight;
        if (newHeight > previousHeight) {
          previousHeight = newHeight;
          attempts = 0;
        } else {
          attempts++;
        }
      }
    }

    // --- Step 2: Collect elements at grid points across entire page ---
    const elements = new Set<Element>();
    const totalHeight = document.body.scrollHeight;
    let scrollY = 0;
    const scrollStep = window.innerHeight * 0.9;

    while (scrollY < totalHeight - window.innerHeight) {
      window.scrollTo(0, scrollY);
      await new Promise(r => setTimeout(r, 300));
      // Probe grid points in current viewport
      for (let x = 0; x <= window.innerWidth; x += gridStep) {
        for (let y = 0; y <= window.innerHeight; y += gridStep) {
          const elem = document.elementFromPoint(x, y);
          if (elem && !SKIP_TAGS.has(elem.tagName) && elem !== document.body && elem !== document.documentElement) {
            elements.add(elem);
          }
        }
      }
      scrollY += scrollStep;
    }

    // Collect at the very bottom
    window.scrollTo(0, Math.max(0, totalHeight - window.innerHeight));
    await new Promise(r => setTimeout(r, 300));
    for (let x = 0; x <= window.innerWidth; x += gridStep) {
      for (let y = 0; y <= window.innerHeight; y += gridStep) {
        const elem = document.elementFromPoint(x, y);
        if (elem && !SKIP_TAGS.has(elem.tagName) && elem !== document.body && elem !== document.documentElement) {
          elements.add(elem);
        }
      }
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));

    return Array.from(elements).map(el => {
      // Return a stable reference: build a path selector for each element
      // so we can re-find it after returning from evaluate
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body && current !== document.documentElement) {
        const par: Element | null = current.parentElement;
        if (par) {
          const index = Array.from(par.children).indexOf(current);
          path.unshift(`${index}`);
        }
        current = par;
      }
      return path.join('/');
    });
  }, GRID_STEP);

  // Now run the segmentation logic (processElements + filterElements) inside the page
  const segmented = await page.evaluate((args: { paths: string[]; defaultMaxMergeHeight: number; maxParentSection: number }) => {
    const { paths, defaultMaxMergeHeight, maxParentSection } = args;

    // Adaptive merge height: on short pages, use a tighter threshold
    // so elements don't all collapse into one root container
    const docHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    let maxMergeHeight: number;
    if (docHeight < viewportHeight * 2) {
      // Page fits in 1-2 viewports: need fine granularity
      maxMergeHeight = 150;
    } else if (docHeight < viewportHeight * 4) {
      // Page fits in 2-4 viewports: moderate
      maxMergeHeight = 600;
    } else {
      // Long scrollable page: standard behavior
      maxMergeHeight = defaultMaxMergeHeight;
    }
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'LINK', 'META']);

    // Re-resolve elements from paths
    function resolveElement(path: string): Element | null {
      let current: Element = document.body;
      const indices = path.split('/').map(Number);
      for (const idx of indices) {
        if (!current.children[idx]) return null;
        current = current.children[idx];
      }
      return current;
    }

    const elementsArray = paths.map(resolveElement).filter((e): e is Element => e !== null);

    // Filter out body, snipkiwi markers
    let filtered = elementsArray.filter(element => {
      if (element === document.body) return false;
      if (!element.classList) return true;
      const classList = Array.from(element.classList);
      return !classList.includes('skipcss') && !classList.some(c => c.includes('snipkiwi'));
    });

    // --- processElements: bottom-up merge ---
    // Group by depth
    function getDepth(el: Element): number {
      let depth = 0;
      let cur: Element | null = el;
      while (cur && cur.parentNode && cur.parentNode !== document.body) {
        cur = cur.parentNode as Element;
        depth++;
      }
      return depth;
    }

    const depthMap = new Map<number, Set<Element>>();
    const elementDepths = new Map<Element, number>();
    let maxDepth = 0;

    filtered.forEach(elem => {
      const depth = getDepth(elem);
      elementDepths.set(elem, depth);
      if (!depthMap.has(depth)) depthMap.set(depth, new Set());
      depthMap.get(depth)!.add(elem);
      if (depth > maxDepth) maxDepth = depth;
    });

    let elementsSet = new Set(filtered);
    const processedElements = new Set(filtered);

    // Walk from deepest to shallowest, merging children into parents
    for (let depth = maxDepth; depth >= 1; depth--) {
      const atDepth = depthMap.get(depth);
      if (!atDepth) continue;

      atDepth.forEach(elem => {
        const parent = elem.parentNode as Element;
        if (parent && parent !== document.body) {
          const parentHeight = (parent as HTMLElement).offsetHeight;
          if (parentHeight < maxMergeHeight) {
            if (!processedElements.has(parent)) {
              const parentDepth = depth - 1;
              if (!depthMap.has(parentDepth)) depthMap.set(parentDepth, new Set());
              depthMap.get(parentDepth)!.add(parent);
              processedElements.add(parent);
              elementsSet.add(parent);
            }
            elementsSet.delete(elem);
          }
        }
      });
    }

    // --- filterElements: smart parent/child deduplication ---
    const elementToChildren = new Map<Element, Set<Element>>();
    const elemArr = Array.from(elementsSet);

    elemArr.forEach(element => {
      const parent = element.parentElement;
      if (parent && parent !== document.body && elementsSet.has(parent)) {
        if (!elementToChildren.has(parent)) elementToChildren.set(parent, new Set());
        elementToChildren.get(parent)!.add(element);
      }
    });

    const toRemove = new Set<Element>();

    elementToChildren.forEach((childrenSet, parent) => {
      const allDirectChildren = Array.from(parent.children)
        .filter(child => !SKIP_TAGS.has(child.tagName));

      const allChildrenInSet = allDirectChildren.every(child => elementsSet.has(child));

      if (allChildrenInSet) {
        // All children are segments — remove the parent wrapper
        toRemove.add(parent);
      } else {
        const totalDescendants = parent.querySelectorAll('*:not(script):not(style):not(iframe)').length;

        if (totalDescendants > maxParentSection) {
          // Parent too large — split into direct children
          allDirectChildren.forEach(child => {
            if (!elementsSet.has(child)) elementsSet.add(child);
          });
          toRemove.add(parent);
        } else {
          // Parent is manageable — keep parent, remove descendants
          elementsSet.forEach(elem => {
            if (parent !== elem && parent.contains(elem)) {
              toRemove.add(elem);
            }
          });
        }
      }
    });

    toRemove.forEach(elem => elementsSet.delete(elem));

    // --- Build unique selectors and metadata for each segment ---
    function testSelectorCount(sel: string, expected: number): boolean {
      try {
        return document.querySelectorAll(sel).length === expected;
      } catch { return false; }
    }

    function getUniqueSelector(elem: Element): string {
      // Try ID first
      if (elem.id) {
        const idSel = `#${elem.id}`;
        if (testSelectorCount(idSel, 1)) return idSel;
      }

      // Try semantic tag if unique
      const tag = elem.tagName.toLowerCase();
      const semanticTags = new Set(['header', 'nav', 'main', 'footer', 'aside', 'article']);
      if (semanticTags.has(tag) && testSelectorCount(tag, 1)) return tag;

      // Try class-based selector
      if (elem.classList.length > 0) {
        const classes = Array.from(elem.classList).filter(c => !c.includes('snipkiwi') && !c.includes('skipcss'));
        if (classes.length > 0) {
          const classSel = '.' + classes.slice(0, 3).join('.');
          if (testSelectorCount(classSel, 1)) return classSel;
        }
      }

      // Build nth-child path upward until unique (ported from page_segmenter.js)
      const elemTag = elem.tagName.toLowerCase();
      let par: Element | null = elem.parentElement;
      if (!par) return elemTag;

      let myIndex = Array.from(par.children).indexOf(elem) + 1;
      let selector = `${elemTag}:nth-child(${myIndex})`;

      if (par === document.body) {
        return `body > ${selector}`;
      }

      let maxLevels = 20;
      while (par && par !== document.body && maxLevels > 0) {
        const prevElem: Element = par;
        const prevTag = prevElem.tagName.toLowerCase();
        par = prevElem.parentElement;
        if (!par) break;

        // Test without nth-child on parent first
        const testSel = `${prevTag} > ${selector}`;
        if (testSelectorCount(testSel, 1)) return testSel;

        myIndex = Array.from(par.children).indexOf(prevElem) + 1;
        selector = `${prevTag}:nth-child(${myIndex}) > ${selector}`;

        if (par === document.body) break;
        maxLevels--;
      }

      selector = `body > ${selector}`;
      if (testSelectorCount(selector, 1)) return selector;

      // Last resort: use the full path even if not unique
      return selector;
    }

    function getParentChain(el: Element): string {
      const parts: string[] = [];
      let current = el.parentElement;
      let count = 0;
      while (current && current !== document.body && count < 3) {
        const t = current.tagName.toLowerCase();
        if (current.id) {
          parts.unshift(`#${current.id}`);
        } else if (current.classList.length > 0) {
          const cls = Array.from(current.classList).filter(c => !c.includes('snipkiwi'))[0];
          parts.unshift(cls ? `${t}.${cls}` : t);
        } else {
          parts.unshift(t);
        }
        current = current.parentElement;
        count++;
      }
      return parts.length > 0 ? `inside ${parts.join(' > ')}` : 'top-level';
    }

    // Sort by vertical position (top of page first)
    const finalElements = Array.from(elementsSet)
      .filter(el => el !== document.body)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top + window.scrollY) - (br.top + window.scrollY);
      });

    return finalElements.map(el => {
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY;
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      const classes = Array.from(el.classList).filter(c => !c.includes('snipkiwi')).join(' ');
      let backgroundColor = '';
      try {
        const computed = window.getComputedStyle(el);
        backgroundColor = computed.backgroundColor || '';
        if (backgroundColor === 'rgba(0, 0, 0, 0)') backgroundColor = 'transparent';
      } catch { /* ignore */ }

      let depth = 0;
      let cur: Element | null = el;
      while (cur && cur.parentNode && cur.parentNode !== document.body) {
        cur = cur.parentNode as Element;
        depth++;
      }

      return {
        tag,
        selector: getUniqueSelector(el),
        classes,
        id: el.id || '',
        role,
        text: (el.textContent || '').trim().substring(0, 80),
        childCount: el.children.length,
        rect: {
          x: Math.round(rect.x + window.scrollX),
          y: Math.round(rect.y + scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        backgroundColor,
        parentChain: getParentChain(el),
        depth,
      };
    });
  }, { paths: rawElements, defaultMaxMergeHeight: MAX_MERGE_HEIGHT, maxParentSection: MAX_PARENT_SECTION });

  // Assign numeric labels and semantic types
  return segmented.map((el, index) => ({
    label: index + 1,
    selector: el.selector,
    tag: el.tag,
    semanticType: inferSemanticType(el.tag, el.role, el.classes, el.rect, el.depth),
    parentContext: el.parentChain,
    rect: el.rect,
    backgroundColor: el.backgroundColor,
    childCount: el.childCount,
    textPreview: el.text,
    classes: el.classes,
    id: el.id,
    depth: el.depth,
  }));
}

/**
 * Infer a human-readable semantic type from element metadata.
 */
function inferSemanticType(
  tag: string,
  role: string,
  classes: string,
  rect: { x: number; y: number; width: number; height: number },
  depth: number
): string {
  const classLower = classes.toLowerCase();
  const roleLower = role.toLowerCase();

  // Direct semantic tag matches
  if (tag === 'header' || roleLower === 'banner') return 'Header';
  if (tag === 'nav' || roleLower === 'navigation') return 'Navigation';
  if (tag === 'footer' || roleLower === 'contentinfo') return 'Footer';
  if (tag === 'aside' || roleLower === 'complementary') return 'Sidebar';
  if (tag === 'form' || roleLower === 'form') return 'Form';
  if (tag === 'article') return 'Article';
  if (tag === 'main' || roleLower === 'main') return 'Main Content';

  // Class-based inference
  if (/sidebar|side-nav|side-menu/i.test(classLower)) return 'Sidebar';
  if (/hero|banner|jumbotron/i.test(classLower)) return 'Hero Section';
  if (/card|tile/i.test(classLower)) return 'Card';
  if (/modal|dialog|popup/i.test(classLower)) return 'Modal/Dialog';
  if (/nav|menu|navbar|topbar/i.test(classLower)) return 'Navigation';
  if (/footer/i.test(classLower)) return 'Footer';
  if (/header/i.test(classLower)) return 'Header';
  if (/pricing|plan/i.test(classLower)) return 'Pricing';
  if (/testimonial|review/i.test(classLower)) return 'Testimonial';
  if (/gallery|carousel|slider|swiper/i.test(classLower)) return 'Gallery/Carousel';
  if (/cta|call-to-action/i.test(classLower)) return 'Call to Action';
  if (/feature|benefit/i.test(classLower)) return 'Feature';
  if (/tab|tabs/i.test(classLower)) return 'Tabs';
  if (/accordion|collapse/i.test(classLower)) return 'Accordion';
  if (/breadcrumb/i.test(classLower)) return 'Breadcrumb';
  if (/search/i.test(classLower) || roleLower === 'search') return 'Search';
  if (/table|grid/i.test(classLower)) return 'Table/Grid';
  if (/list/i.test(classLower)) return 'List';
  if (/btn|button/i.test(classLower)) return 'Button';
  if (/input|field|control/i.test(classLower)) return 'Form Control';

  // Position/size-based inference
  if (tag === 'section') {
    if (rect.y < 200 && rect.height > 300) return 'Hero Section';
    return 'Section';
  }

  // Generic fallback
  if (depth <= 1 && rect.width > 600) return 'Container';
  if (rect.width < 400 && rect.height < 400 && depth >= 2) return 'Widget';

  return 'Element';
}

/**
 * Inject numbered badge overlay into the page at each element's position.
 */
export async function injectLabelOverlay(
  page: Page,
  elements: DiscoveredElement[]
): Promise<void> {
  const labelData = elements.map(el => ({
    label: el.label,
    x: el.rect.x,
    y: el.rect.y,
    w: el.rect.width,
    h: el.rect.height,
  }));

  await page.evaluate((labels) => {
    // Remove any existing overlay
    const existing = document.getElementById('__snipkiwi_labels__');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '__snipkiwi_labels__';
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';

    labels.forEach(({ label, x, y, w, h }) => {
      // Draw a subtle outline around the element
      const outline = document.createElement('div');
      outline.style.cssText = `
        position: absolute;
        left: ${x - 1}px;
        top: ${y - 1}px;
        width: ${w + 2}px;
        height: ${h + 2}px;
        border: 2px solid rgba(255, 0, 0, 0.4);
        border-radius: 2px;
        pointer-events: none;
      `;
      overlay.appendChild(outline);

      // Add numbered badge
      const badge = document.createElement('span');
      badge.textContent = `#${label}`;
      badge.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        background: #e11d48;
        color: white;
        font: bold 11px monospace;
        padding: 2px 5px;
        border-radius: 3px;
        transform: translate(0, -100%);
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        line-height: 1.2;
      `;
      overlay.appendChild(badge);
    });

    document.body.appendChild(overlay);
  }, labelData);
}

/**
 * Remove the label overlay from the page.
 */
export async function removeLabelOverlay(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const el = document.getElementById('__snipkiwi_labels__');
      if (el) el.remove();
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Format discovered elements as a human-readable legend.
 */
export function formatElementLegend(elements: DiscoveredElement[]): string {
  const lines: string[] = [];
  for (const el of elements) {
    const size = `${el.rect.width}x${el.rect.height}`;
    const preview = el.textPreview.substring(0, 50).replace(/\n/g, ' ');
    lines.push(
      `#${el.label}: \`${el.selector}\` (${el.semanticType}, ${size}) ${el.parentContext} — "${preview}"`
    );
  }
  return lines.join('\n');
}
