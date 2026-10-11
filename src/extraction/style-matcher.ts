import { CDPSession } from 'patchright';
import {
  CDPMatchedStyles, CDPRuleMatch, CDPCSSProperty, CDPCSSRule,
  SnippedRule, ExtractionContext, CssVarDefinition,
} from '../types/index.js';
import { calculateSingle, specificityScore } from './specificity.js';

/**
 * Processes CSS.getMatchedStylesForNode results into SnippedRule objects.
 * Port of the core matching logic from snipbackground.js:1700-2035
 */
export class StyleMatcher {

  /**
   * Get matched styles for a DOM node via CDP.
   */
  async getMatchedStyles(cdp: CDPSession, nodeId: number): Promise<CDPMatchedStyles> {
    const result = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
    return result as CDPMatchedStyles;
  }

  /**
   * Process matched styles into a unified list of rule matches.
   * This combines matched rules, inherited rules, and pseudo-element rules
   * into a single ordered list for downstream processing.
   *
   * Port of snipbackground.js lines 1702-1820
   */
  processMatchedStyles(
    allMatchedStyles: CDPMatchedStyles,
    classname: string,
    ctx: ExtractionContext,
    options: { resolveVariables: boolean; mediaQueriesOnly: boolean }
  ): CDPRuleMatch[] {
    const matchedCSSRules: CDPRuleMatch[] = [...(allMatchedStyles.matchedCSSRules || [])];
    const inheritedCSSRules = allMatchedStyles.inherited || [];

    // Process inline style CSS variables (lines 1711-1745)
    if (options.resolveVariables && allMatchedStyles.inlineStyle) {
      const cssProperties = allMatchedStyles.inlineStyle.cssProperties || [];
      for (const prop of cssProperties) {
        if (prop.name && prop.name.startsWith('--')) {
          if (!ctx.cssvarDefinedArr[prop.name]) {
            ctx.cssvarDefinedArr[prop.name] = [];
          }
          const inlineKey = `inline-${classname}-${prop.name}`;
          const exists = ctx.cssvarDefinedArr[prop.name].some(
            (item: CssVarDefinition) => item.key === inlineKey
          );
          if (!exists) {
            ctx.cssvarDefinedArr[prop.name].push({
              key: inlineKey,
              label: classname,
              value: prop.value,
              media: '',
              selector: '.' + classname,
              source: 'inline-style',
            });
          }
        }
      }
    }

    // Process inherited rules - prepend in reverse order (lines 1748-1798)
    if (inheritedCSSRules.length > 0) {
      for (let m = inheritedCSSRules.length - 1; m >= 0; m--) {
        const cRule = inheritedCSSRules[m];
        const inheritedRules = cRule.matchedCSSRules || [];
        for (let n = inheritedRules.length - 1; n >= 0; n--) {
          const iRule = inheritedRules[n] as any;
          iRule.other_inherited = true;

          // Filter to only implicit properties (ones actually defined in CSS)
          const cssProps = iRule.rule.style.cssProperties || [];
          const editedCssProperties: CDPCSSProperty[] = [];
          for (const cProp of cssProps) {
            if ('implicit' in cProp) {
              editedCssProperties.push(cProp);
            }
          }

          matchedCSSRules.unshift(iRule);
        }
      }
    }

    // Process pseudo-element rules (lines 1800-1820)
    if (!options.mediaQueriesOnly && allMatchedStyles.pseudoElements) {
      for (const pseudoMatch of allMatchedStyles.pseudoElements) {
        for (const pMatch of pseudoMatch.matches) {
          // Skip box-sizing inherit pseudo rules
          const cssText = (pMatch.rule as CDPCSSRule).style.cssText || '';
          if (cssText.includes('box-sizing: inherit')) {
            continue;
          }
          (pMatch.rule as any).rule_type = 'psuedo';
          matchedCSSRules.push({ rule: pMatch.rule as CDPCSSRule, matchingSelectors: pMatch.matchingSelectors });
        }
      }
    }

    return matchedCSSRules;
  }

  /**
   * Extract CSS variables from matched rules.
   * Port of CSS variable extraction logic from snipbackground.js
   */
  extractCssVariables(
    matchedRules: CDPRuleMatch[],
    classname: string,
    ctx: ExtractionContext
  ): void {
    for (const ruleMatch of matchedRules) {
      const rule = ruleMatch.rule;
      if (!rule || !rule.style) continue;

      const cssProperties = rule.style.cssProperties || [];
      const selectorText = rule.selectorList?.text || '';
      const media = (rule.media && rule.media.length > 0) ? rule.media[0].text : '';

      for (const prop of cssProperties) {
        // Capture variable definitions
        if (prop.name && prop.name.startsWith('--') && prop.value) {
          if (!ctx.cssvarDefinedArr[prop.name]) {
            ctx.cssvarDefinedArr[prop.name] = [];
          }
          const key = `${selectorText}-${prop.name}-${media}`;
          const exists = ctx.cssvarDefinedArr[prop.name].some(
            (item: CssVarDefinition) => item.key === key
          );
          if (!exists) {
            ctx.cssvarDefinedArr[prop.name].push({
              key,
              label: classname,
              value: prop.value,
              media,
              selector: selectorText,
              source: 'stylesheet',
            });
          }
        }

        // Track variable usage
        if (prop.value && prop.value.includes('var(--')) {
          const varMatches = prop.value.match(/var\(\s*(--[^,\)]+)/g);
          if (varMatches) {
            for (const varMatch of varMatches) {
              const varName = varMatch.replace(/var\(\s*/, '');
              if (!ctx.cssvarUsedArr.includes(varName)) {
                ctx.cssvarUsedArr.push(varName);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Convert a CDPRuleMatch to a SnippedRule for the final output.
   */
  toSnippedRule(
    ruleMatch: CDPRuleMatch,
    classname: string,
    viewport: string,
    ctx: ExtractionContext
  ): SnippedRule | null {
    const rule = ruleMatch.rule;
    if (!rule || !rule.style) return null;

    // Skip user-agent rules
    if (rule.origin === 'user-agent') return null;

    const selectorText = rule.selectorList?.text || '';
    const cssProperties = rule.style.cssProperties || [];

    // Resolve the specific matched selector part(s) using matchingSelectors indices.
    // CDP's matchingSelectors tells us which comma-parts of a multi-selector rule actually
    // matched (e.g. for "a:hover, a:focus", hover-forcing returns index 0 only).
    // We store this separately so rule-deduplicator can use it for matching_parts,
    // keeping allPseudo to a single pseudo per pass (matching old extension behavior).
    const allSelectors = rule.selectorList?.selectors || [];
    const matchedParts = (ruleMatch.matchingSelectors || [])
      .map((i: number) => allSelectors[i]?.text)
      .filter(Boolean) as string[];
    const matchedSelectorText = matchedParts.length > 0
      ? matchedParts.join(', ')
      : selectorText;

    // Build CSS body from properties
    // CDP returns both shorthand and longhand versions. We want only the
    // explicitly-written properties (those that have 'text' set or aren't implicit).
    const bodyParts: string[] = [];
    const seenProps = new Map<string, number>(); // name -> index in bodyParts
    for (const prop of cssProperties) {
      if (!prop.name || !prop.value) continue;
      if (prop.disabled) continue;
      if (prop.parsedOk === false) continue;
      // Skip implicit longhand expansions - only keep explicitly defined properties.
      // Implicit means CDP auto-expanded a shorthand; we want the shorthand only.
      if (!('implicit' in prop) && !prop.text && prop.range === undefined) continue;

      const important = prop.important ? ' !important' : '';
      const cleanValue = prop.value.replace(/\s*!important\s*/g, '').trim();
      const line = `${prop.name}: ${cleanValue}${important}`;

      if (seenProps.has(prop.name)) {
        // CDP often lists webkit-prefixed values before standard ones.
        // If the already-recorded value starts with -webkit-, replace it with
        // this standard value so we don't emit e.g. display:-webkit-box instead of flex.
        const existingIdx = seenProps.get(prop.name)!;
        const existingValue = bodyParts[existingIdx].split(':').slice(1).join(':').trim();
        if (existingValue.startsWith('-webkit-') && !cleanValue.startsWith('-webkit-')) {
          bodyParts[existingIdx] = line;
        }
        continue;
      }

      seenProps.set(prop.name, bodyParts.length);
      bodyParts.push(line);
    }

    if (bodyParts.length === 0) return null;

    // Remove -webkit- prefixed properties that have a standard equivalent in the same rule
    const standardPropNames = new Set(
      bodyParts.map(p => p.split(':')[0].trim()).filter(p => !p.startsWith('-'))
    );
    const deduped = bodyParts.filter(p => {
      const name = p.split(':')[0].trim();
      if (name.startsWith('-webkit-')) {
        return !standardPropNames.has(name.slice('-webkit-'.length));
      }
      return true;
    });

    const body = deduped.join(';\n');
    const media = (rule.media && rule.media.length > 0)
      ? rule.media.map(m => m.text).join(' and ')
      : '';

    // Calculate specificity
    let specScore = 0;
    try {
      const specResult = calculateSingle(selectorText);
      specScore = specificityScore(specResult.specificity);
    } catch {
      specScore = 0;
    }

    const isInherited = !!(ruleMatch as any).other_inherited;
    const isPseudo = (rule as any).rule_type === 'psuedo';
    const isHover = selectorText.includes(':hover') || rule.origin === 'pseudo' as any;

    return {
      selector: selectorText,
      body,
      media,
      classname,
      stylesheet_id: rule.styleSheetId || '',
      origin: rule.origin,
      is_inherited: isInherited,
      other_inherited: isInherited,
      is_pseudo_element: isPseudo,
      is_hover: isHover,
      specificity_score: specScore,
      viewport,
      matched_selector: matchedSelectorText !== selectorText ? matchedSelectorText : undefined,
    };
  }
}
