import { ExtractionContext, CssVarDefinition } from '../types/index.js';

/**
 * Resolves CSS custom properties (variables) to their computed values.
 * Port of CSS variable resolution from snipbackground.js
 */
export class CssVariableResolver {
  /**
   * Resolve a CSS variable reference like var(--my-color) to its value.
   * Handles nested var() references recursively.
   */
  resolveVar(varName: string, ctx: ExtractionContext, depth = 0): string | null {
    if (depth > 10) return null; // Prevent infinite recursion

    // Check resolved cache first
    if (ctx.cssvarResolvedValues[varName]) {
      return ctx.cssvarResolvedValues[varName];
    }

    // Check cssvarAllArr (global :root variables)
    if (ctx.cssvarAllArr[varName]) {
      let val = ctx.cssvarAllArr[varName].replace(/;$/, '').trim();

      // If value contains another var() reference, resolve it
      if (val.includes('var(')) {
        val = this.resolveVarReferences(val, ctx, depth + 1);
      }

      ctx.cssvarResolvedValues[varName] = val;
      return val;
    }

    // Check cssvarDefinedArr (contextual variables)
    if (ctx.cssvarDefinedArr[varName] && ctx.cssvarDefinedArr[varName].length > 0) {
      // Get the most specific definition (prefer global scope)
      const definitions = ctx.cssvarDefinedArr[varName];
      let bestDef: CssVarDefinition | null = null;

      for (const def of definitions) {
        if (!bestDef || def.source === 'stylesheet') {
          bestDef = def;
        }
      }

      if (bestDef) {
        let val = bestDef.value.replace(/;$/, '').trim();
        if (val.includes('var(')) {
          val = this.resolveVarReferences(val, ctx, depth + 1);
        }
        ctx.cssvarResolvedValues[varName] = val;
        return val;
      }
    }

    return null;
  }

  /**
   * Replace all var(--xxx) references in a value string with their resolved values.
   * Handles fallback values like var(--primary, #000).
   */
  resolveVarReferences(value: string, ctx: ExtractionContext, depth = 0): string {
    if (depth > 10) return value;

    return value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g,
      (_match, varName, fallback) => {
        const resolved = this.resolveVar(varName, ctx, depth);
        if (resolved !== null) return resolved;
        if (fallback) {
          // Fallback may also contain var() references
          if (fallback.includes('var(')) {
            return this.resolveVarReferences(fallback.trim(), ctx, depth + 1);
          }
          return fallback.trim();
        }
        return _match; // Return original if unresolvable
      }
    );
  }

  /**
   * Generate CSS text for all used CSS variables that need to be defined.
   * Creates a :root block with the variable definitions that were used.
   */
  generateVariablesCss(ctx: ExtractionContext): string {
    if (ctx.cssvarUsedArr.length === 0) return '';

    const lines: string[] = [];
    const addedVars = new Set<string>();

    for (const varName of ctx.cssvarUsedArr) {
      if (addedVars.has(varName)) continue;

      const resolved = this.resolveVar(varName, ctx);
      if (resolved !== null) {
        lines.push(`  ${varName}: ${resolved};`);
        addedVars.add(varName);
      }
    }

    if (lines.length === 0) return '';

    return `:root {\n${lines.join('\n')}\n}`;
  }

  /**
   * Get all resolved variables as a map.
   */
  getResolvedVariables(ctx: ExtractionContext): Record<string, string> {
    const resolved: Record<string, string> = {};

    for (const varName of ctx.cssvarUsedArr) {
      const val = this.resolveVar(varName, ctx);
      if (val !== null) {
        resolved[varName] = val;
      }
    }

    return resolved;
  }
}
