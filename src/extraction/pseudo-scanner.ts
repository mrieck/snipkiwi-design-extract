import { CDPSession } from 'patchright';
import { StylesheetInfo, PseudoScanResult } from '../types/index.js';

/**
 * Scans the collected CSS for :hover/:active/:checked rules so the pipeline can
 * skip pseudo-state forcing for elements that provably cannot match any such
 * rule — the expensive part of extraction.
 *
 * SAFETY: this only ever lets the caller SKIP work; it must never cause a real
 * pseudo rule to be missed. It is conservative on every axis:
 *   - If any stylesheet's text can't be read (cross-origin, fetch error), the
 *     whole optimization is disabled (full, unchanged behavior).
 *   - Anchor sets (class tokens + tags) are over-inclusive supersets, so we
 *     err toward processing an element, never toward skipping one.
 *   - Any :hover/:active selector using an id / attribute / universal anchor
 *     sets `hoverHasNonClassSelector`, forcing the full per-element fallback.
 */
export class PseudoScanner {
  async scan(cdp: CDPSession, stylesheets: StylesheetInfo[]): Promise<PseudoScanResult> {
    const result: PseudoScanResult = {
      hasAnyHover: false,
      hasAnyChecked: false,
      hoverAnchorClassTokens: new Set<string>(),
      hoverAnchorTags: new Set<string>(),
      hoverHasNonClassSelector: false,
    };

    let incomplete = false;
    await Promise.all(
      stylesheets.map(async (ss) => {
        if (!ss.stylesheet_id) return;
        try {
          const r = (await cdp.send('CSS.getStyleSheetText', {
            styleSheetId: ss.stylesheet_id,
          })) as { text?: string };
          if (r.text) this.scanText(r.text, result);
        } catch {
          // A sheet we couldn't read means we can't prove absence of :hover on it.
          incomplete = true;
        }
      })
    );

    if (incomplete) {
      // Can't see all the CSS → behave exactly as before (no skipping).
      result.hasAnyHover = true;
      result.hasAnyChecked = true;
      result.hoverHasNonClassSelector = true;
    }
    return result;
  }

  private scanText(rawText: string, result: PseudoScanResult): void {
    // Strip CSS comments first: `/* */` delimiters contain `*` (which would trip
    // the universal-selector escape hatch) and comment prose would pollute the
    // tag/class anchor sets and the :hover/:checked presence checks.
    const text = rawText.replace(/\/\*[\s\S]*?\*\//g, ' ');

    if (text.includes(':hover') || text.includes(':active')) result.hasAnyHover = true;
    if (text.includes(':checked')) result.hasAnyChecked = true;
    if (!result.hasAnyHover) return; // no hover/active rules in this sheet to anchor

    // Pull each rule/at-rule prelude (the text before every '{').
    const preludeRe = /([^{}]+)\{/g;
    let m: RegExpExecArray | null;
    while ((m = preludeRe.exec(text)) !== null) {
      const prelude = m[1];
      if (!prelude.includes(':hover') && !prelude.includes(':active')) continue;
      // A prelude is a comma-separated selector list.
      for (const sel of prelude.split(',')) {
        if (!sel.includes(':hover') && !sel.includes(':active')) continue;
        this.collectAnchors(sel, result);
      }
    }
  }

  private collectAnchors(selector: string, result: PseudoScanResult): void {
    // Id / attribute / universal anchors can't be reduced to our class/tag meta,
    // so any of them forces the full per-element fallback for the whole page.
    if (/[#\[*]/.test(selector)) {
      result.hoverHasNonClassSelector = true;
    }

    // Class tokens, honoring CSS escaping so Tailwind's `.hover\:bg-red-500:hover`
    // yields the real class token `hover:bg-red-500` (as it appears in classList).
    const classRe = /\.((?:\\.|[\w-])+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = classRe.exec(selector)) !== null) {
      const token = cm[1].replace(/\\(.)/g, '$1'); // unescape \: -> :, \/ -> /, etc.
      if (token) result.hoverAnchorClassTokens.add(token);
    }

    // Bare tag names (identifiers at a selector boundary, not after . # : etc.).
    // Over-inclusive (e.g. tags inside :not() are counted) — safe, only over-processes.
    const tagRe = /(?:^|[\s>+~(,])([a-zA-Z][a-zA-Z0-9]*)/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(selector)) !== null) {
      result.hoverAnchorTags.add(tm[1].toUpperCase());
    }
  }
}

/**
 * Decide whether an element needs hover extraction, given the page-wide scan and
 * the element's captured metadata. Returns true when we CANNOT rule out a match.
 */
export function elementMayHaveHover(
  scan: PseudoScanResult,
  tag: string,
  classTokens: string[]
): boolean {
  if (!scan.hasAnyHover) return false;
  if (scan.hoverHasNonClassSelector) return true; // can't reason precisely → process
  if (scan.hoverAnchorTags.has(tag)) return true;
  for (const t of classTokens) {
    if (scan.hoverAnchorClassTokens.has(t)) return true;
  }
  return false;
}
