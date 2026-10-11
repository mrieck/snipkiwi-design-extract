import { SnippedRule, ExtractionContext } from '../types/index.js';

/**
 * Deduplicates CSS rules to avoid redundant output.
 * Port of alreadySnippedWhole and related dedup logic from snipbackground.js:728-834
 */
export class RuleDeduplicator {
  /**
   * Check if a rule has already been added (same selector + body + media).
   */
  isDuplicate(rule: SnippedRule, ctx: ExtractionContext): boolean {
    return ctx.snippedArr.some(
      existing =>
        existing.selector === rule.selector &&
        existing.body === rule.body &&
        existing.media === rule.media
    );
  }

  /**
   * Find the index of a duplicate rule, or -1 if not found.
   */
  findDuplicateIndex(rule: SnippedRule, ctx: ExtractionContext): number {
    return ctx.snippedArr.findIndex(
      existing =>
        existing.selector === rule.selector &&
        existing.body === rule.body &&
        existing.media === rule.media
    );
  }

  /**
   * Track a rule in matchingFinalRules for a given classname.
   * This must happen even for duplicate rules - different elements can share
   * the same CSS rule but each needs a matchingFinalRules entry for Tailwind.
   */
  private trackRule(rule: SnippedRule, ruleIndex: number, ctx: ExtractionContext): void {
    if (!rule.classname) return;
    if (!ctx.matchingFinalRules[rule.classname]) {
      ctx.matchingFinalRules[rule.classname] = {
        indices: [],
        selectors: [],
        bodies: [],
        media_queries: [],
        matching_parts: [],
        contain_type: [],
        inherited_type: [],
        inherited_classes: [],
        invalid_pseudos: [],
      };
    }
    const entry = ctx.matchingFinalRules[rule.classname];
    entry.indices.push(ruleIndex);
    entry.selectors.push(rule.selector);
    entry.bodies.push(rule.body);
    entry.media_queries.push(rule.media);
    entry.matching_parts.push([rule.matched_selector ?? rule.selector]);
    entry.contain_type.push('default');
    entry.inherited_type.push(rule.is_inherited ? 'inherited' : 'default');
    entry.inherited_classes.push([]);
    entry.invalid_pseudos.push(false);
  }

  /**
   * Add a rule if it's not a duplicate.
   * Even if duplicate, still tracks in matchingFinalRules for the element.
   */
  addRule(rule: SnippedRule, ctx: ExtractionContext): boolean {
    // Skip empty body rules
    if (!rule.body || rule.body.trim() === '') return false;

    // Skip user-agent rules
    if (rule.origin === 'user-agent') return false;

    const dupIndex = this.findDuplicateIndex(rule, ctx);
    if (dupIndex >= 0) {
      // Rule already in snippedArr, but still track it for this element
      this.trackRule(rule, dupIndex, ctx);
      return false;
    }

    ctx.snippedArr.push(rule);
    this.trackRule(rule, ctx.snippedArr.length - 1, ctx);
    return true;
  }

  /**
   * Add multiple rules, filtering out duplicates.
   */
  addRules(rules: SnippedRule[], ctx: ExtractionContext): number {
    let added = 0;
    for (const rule of rules) {
      if (this.addRule(rule, ctx)) added++;
    }
    return added;
  }

  /**
   * Get all collected rules.
   */
  getRules(ctx: ExtractionContext): SnippedRule[] {
    return ctx.snippedArr;
  }

  /**
   * Group rules by media query for organized output.
   */
  groupByMedia(ctx: ExtractionContext): Map<string, SnippedRule[]> {
    const groups = new Map<string, SnippedRule[]>();

    for (const rule of ctx.snippedArr) {
      const media = rule.media || '';
      if (!groups.has(media)) {
        groups.set(media, []);
      }
      groups.get(media)!.push(rule);
    }

    return groups;
  }
}
