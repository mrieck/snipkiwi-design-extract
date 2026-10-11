/**
 * Removes unused attributes and CSS classes from extracted HTML.
 * Port of removeExtraAttributes() from snipbackground.js:5613-5800
 */
import * as cheerio from 'cheerio';
import type { SnippedRule } from '../types/index.js';

const KEEP_ATTRS = new Set([
  'align', 'for', 'type', 'value', 'valign', 'bgcolor', 'background',
  'width', 'height', 'style', 'src', 'href', 'source', 'dir', 'viewbox',
  'xmlns', 'placeholder', 'd', 'colspan', 'rowspan', 'span', 'headers',
  'scope', 'alt', 'title', 'role', 'aria-label', 'aria-hidden',
  'loading', 'decoding', 'srcset', 'sizes', 'media', 'rel', 'target',
  'action', 'method', 'enctype', 'name',
]);

const SVG_TAGS = new Set([
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'svg',
  'g', 'defs', 'use', 'symbol', 'clippath', 'mask', 'filter',
]);

const FORM_TAGS = new Set(['input', 'select', 'meter', 'progress', 'textarea', 'label']);

const ICON_PREFIXES = [
  'fa-', 'fa ', 'fas ', 'far ', 'fab ', 'fal ', 'fad ',
  'bi-', 'bi ',
  'icon-', 'icon ',
  'ti-', 'ti ',
  'material-icons',
  'glyphicon',
];

function isIconFontClass(cls: string): boolean {
  const lower = cls.toLowerCase();
  return ICON_PREFIXES.some(p => lower.startsWith(p)) || lower === 'fa';
}

/**
 * Extract the base class name for selector matching.
 * Strips pseudo-selectors, escapes, brackets, dots.
 */
function baseClassName(cls: string): string {
  let base = cls;
  if (base.includes(':')) base = base.split(':')[0];
  if (base.includes('\\')) base = base.split('\\')[0];
  if (base.includes('/')) base = base.split('/')[0];
  if (base.includes('[')) base = base.split('[')[0];
  if (base.includes('.')) base = base.split('.')[0];
  return base.trim();
}

export interface CleanupOptions {
  removeUnusedClasses?: boolean;
  removeUnusedAttributes?: boolean;
  keepTailwindLabels?: boolean;
}

/**
 * Remove unused attributes and CSS classes from extracted HTML.
 *
 * @param html         The extracted HTML string
 * @param snippedArr   The array of extracted CSS rules
 * @param options      What to clean up
 * @returns            Cleaned HTML string
 */
export function removeExtraAttributes(
  html: string,
  snippedArr: SnippedRule[],
  options: CleanupOptions = {}
): string {
  const {
    removeUnusedClasses = true,
    removeUnusedAttributes = true,
    keepTailwindLabels = false,
  } = options;

  if (!removeUnusedClasses && !removeUnusedAttributes) return html;

  // Collect all selectors for matching
  const allSelectors = snippedArr.map(r => r.selector);

  const $ = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false } }, false);

  // Remove HTML comments
  $.root().find('*').contents().filter((_i, node) => node.type === 'comment').remove();
  // Also remove top-level comments
  $.root().contents().filter((_i, node) => node.type === 'comment').remove();

  $.root().find('*').each((_i, elem) => {
    if (elem.type !== 'tag') return;
    const el = elem as any;
    const tagName = (el.tagName || el.name || '').toLowerCase();
    if (!tagName) return;

    // Skip SVG elements
    if (SVG_TAGS.has(tagName)) return;

    const attribs = el.attribs || {};

    for (const attrName of Object.keys(attribs)) {
      const lowerAttr = attrName.toLowerCase();

      // Always keep essential attributes
      if (KEEP_ATTRS.has(lowerAttr)) continue;

      // Handle data-* attributes
      if (lowerAttr.startsWith('data')) {
        if (!removeUnusedAttributes) continue;
        // Keep if any selector references this attribute
        const inSelector = allSelectors.some(s => s.includes(attrName));
        if (inSelector) continue;
        // Remove it
        $(elem).removeAttr(attrName);
        continue;
      }

      // Handle class attribute
      if (lowerAttr === 'class') {
        if (!removeUnusedClasses) continue;
        // In Tailwind mode, don't touch classes - they're utility classes, not CSS selectors
        if (keepTailwindLabels) continue;

        const classList = (attribs[attrName] || '').split(/\s+/).filter(Boolean);
        const removeList: string[] = [];

        for (const cls of classList) {
          // Keep icon font classes
          if (isIconFontClass(cls)) continue;

          const base = baseClassName(cls);
          if (base === '') continue;

          // Check if this class appears in any selector
          const found = allSelectors.some(s => s.includes(base));
          if (!found) {
            removeList.push(cls);
          }
        }

        for (const cls of removeList) {
          $(elem).removeClass(cls);
        }
        continue;
      }

      // Handle id and name
      if (lowerAttr === 'id' || lowerAttr === 'name') {
        if (!removeUnusedAttributes) continue;
        // Keep on form elements
        if (FORM_TAGS.has(tagName)) continue;
        // Keep if any selector references this value
        const attrVal = attribs[attrName];
        const inSelector = allSelectors.some(s => s.includes(attrVal));
        if (inSelector) continue;
        $(elem).removeAttr(attrName);
        continue;
      }

      // All other non-essential attributes
      if (removeUnusedAttributes) {
        $(elem).removeAttr(attrName);
      }
    }
  });

  let result = $.root().html() || '';
  // Clean up empty class attributes
  result = result.replace(/\s*class=""\s*/g, ' ').replace(/\s+>/g, '>');
  return result;
}
