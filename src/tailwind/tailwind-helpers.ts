/**
 * Tailwind helper utilities.
 * Port of tailwind_helper.js (997 lines)
 */

import { CssVarDefinition } from '../types/index.js';

// Cache for parsed media queries
const existingQueryRanges: Record<string, Record<string, MediaRange[]>> = {};

export interface MediaRange {
  tailwind_classes: string[];
  media_min: number;
  media_max: number;
}

export interface TailwindRange {
  media_min: number;
  media_max: number;
  tailwind_classes: string[];
  score: number;
  ruleIndex: number;
  prop: string;
}

export interface VariableRange {
  concrete_value: string;
  media_min: number;
  media_max: number;
  specificity: number;
  ruleIndex: number;
}

export interface StyleDeclaration {
  property: string;
  value: string;
}

/** All known pseudo-classes and pseudo-elements */
export const allPseudos = [
  'active', 'any-link', 'checked', 'default', 'defined', 'disabled', 'empty', 'enabled',
  'first', 'first-child', 'first-of-type', 'focus', 'focus-visible', 'focus-within',
  'fullscreen', 'future', 'hover', 'indeterminate', 'in-range', 'invalid', 'last-child',
  'last-of-type', 'link', 'not', 'nth-child', 'nth-last-child', 'nth-last-of-type',
  'nth-of-type', 'only-child', 'only-of-type', 'optional', 'out-of-range', 'past',
  'placeholder-shown', 'read-only', 'read-write', 'required', 'root', 'scope', 'target',
  'valid', 'visited',
  // Pseudo-elements
  'after', 'before', 'cue', 'first-letter', 'first-line', 'grammar-error', 'marker',
  'placeholder', 'selection', 'backdrop',
  // Vendor-prefixed
  '-webkit-scrollbar', '-webkit-scrollbar-corner', '-webkit-scrollbar-thumb',
  '-webkit-scrollbar-track', '-webkit-scrollbar-track-hover', '-webkit-scrollbar-hover',
  '-webkit-details-marker', '-webkit-autofill', '-webkit-file-upload-button',
  '-webkit-inner-spin-button', '-webkit-outer-spin-button', '-webkit-resizer',
  '-webkit-calendar-picker-indicator', '-webkit-full-screen',
];

const tailwindBreakpoints = [640, 768, 1024, 1280, 1536];

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge ranges with overlapping media queries, keeping highest-precedence rules.
 */
export function mergeRanges(existingRanges: TailwindRange[] | undefined, newRange: TailwindRange): TailwindRange[] {
  if (!existingRanges || existingRanges.length === 0) {
    return [newRange];
  }
  const allRanges = existingRanges.concat([newRange]);

  // Collect all unique boundary points
  const boundaries = new Set<number>();
  allRanges.forEach(range => {
    boundaries.add(range.media_min);
    boundaries.add(range.media_max);
  });
  const boundaryArray = Array.from(boundaries).sort((a, b) => a - b);

  // Create intervals between boundary points
  const intervals: { media_min: number; media_max: number }[] = [];
  for (let i = 0; i < boundaryArray.length - 1; i++) {
    intervals.push({ media_min: boundaryArray[i], media_max: boundaryArray[i + 1] });
  }

  // Determine the applicable range for each interval
  const intervalRanges = intervals.map(interval => {
    const coveringRanges = allRanges.filter(range =>
      range.media_min < interval.media_max && range.media_max > interval.media_min
    );

    if (coveringRanges.length === 0) return null;

    coveringRanges.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.ruleIndex - a.ruleIndex;
    });

    const topRange = coveringRanges[0];
    return { ...topRange, media_min: interval.media_min, media_max: interval.media_max };
  }).filter((range): range is TailwindRange => range !== null);

  // Merge adjacent intervals with same properties
  const mergedRanges: TailwindRange[] = [];
  for (const range of intervalRanges) {
    const lastRange = mergedRanges[mergedRanges.length - 1];
    if (lastRange &&
        lastRange.tailwind_classes.join(' ') === range.tailwind_classes.join(' ') &&
        lastRange.score === range.score &&
        lastRange.ruleIndex === range.ruleIndex &&
        lastRange.prop === range.prop) {
      lastRange.media_max = range.media_max;
    } else {
      mergedRanges.push(range);
    }
  }

  return mergedRanges;
}

/**
 * Get Tailwind media prefix from min/max width values.
 */
export function getMediaPrefix(media_min: number, media_max: number): string {
  media_min = Number(media_min);
  media_max = Number(media_max);

  const breakpoints = [
    { name: 'sm', min: 640 },
    { name: 'md', min: 768 },
    { name: 'lg', min: 1024 },
    { name: 'xl', min: 1280 },
    { name: '2xl', min: 1536 },
  ];

  const findByExactMin = (value: number) => breakpoints.find(bp => bp.min === value);
  const findByExactMax = (value: number) => breakpoints.find(bp => bp.min - 0.02 === value);

  const minBp = findByExactMin(media_min);
  const maxBp = findByExactMax(media_max);

  if (minBp && !maxBp && media_max >= 9999) return minBp.name;
  if (!minBp && maxBp && media_min <= -1) return `max-${maxBp.name}`;
  if (minBp && maxBp) return `${minBp.name}:max-${maxBp.name}`;

  if (media_min > -1 && media_max < 9999) return `min-[${media_min}px]:max-[${media_max}px]`;
  if (media_min > -1 && media_max >= 9999) return `min-[${media_min}px]`;
  if (media_min <= -1 && media_max < 9999) return `max-[${media_max}px]`;
  return '';
}

/**
 * Get the closest Tailwind breakpoint to a given pixel value.
 */
export function getClosestTailwindBreakpoint(value: number, isMinWidth: boolean): number {
  if (isMinWidth) {
    const bp = tailwindBreakpoints.find(b => b >= value);
    return bp !== undefined ? bp : value;
  } else {
    const bp = [...tailwindBreakpoints].reverse().find(b => b <= value);
    return bp !== undefined ? bp : value;
  }
}

/**
 * Convert a unit value to pixels. Returns null if conversion fails.
 */
function convertToPx(value: string | number | undefined, unit?: string): number | null {
  if (value === undefined || value === null) return null;
  const numVal = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numVal)) return null;

  if (!unit) return numVal;
  if (unit === 'px') return numVal;
  if (unit === 'rem' || unit === 'em') return numVal * 16;
  return null;
}

/**
 * Parse a CSS media query string into Tailwind-compatible ranges.
 * Simplified parser that handles common patterns without external MediaQueryParser dependency.
 */
export function parseMediaQueryToTailwind(
  mediaQueryString: string,
  useTailwindBreakpoints = false
): MediaRange[] {
  if (!mediaQueryString || mediaQueryString.trim() === '') {
    return deepCopy([{ tailwind_classes: [], media_min: -1, media_max: 9999 }]);
  }

  let query = mediaQueryString;
  if (query.startsWith('@media')) {
    query = query.replace(/^@media\s+/i, '').trim();
  }

  // Check cache
  if (!existingQueryRanges[query]) {
    existingQueryRanges[query] = {};
  }
  const cacheKey = String(useTailwindBreakpoints);
  if (existingQueryRanges[query][cacheKey]) {
    return deepCopy(existingQueryRanges[query][cacheKey]);
  }

  const tailwindClasses: string[] = [];
  let media_min: number | null = null;
  let media_max: number | null = null;
  let isNot = false;

  // Check for 'not' prefix
  if (query.startsWith('not ')) {
    isNot = true;
    query = query.substring(4).trim();
  }

  // Check for print media type
  if (query.includes('print')) {
    tailwindClasses.push('print');
  }

  // Feature-to-Tailwind class mappings
  const featureMap: Record<string, Record<string, string>> = {
    'prefers-color-scheme': { 'dark': 'dark' },
    'prefers-reduced-motion': { 'no-preference': 'motion-safe', 'reduce': 'motion-reduce' },
    'prefers-contrast': { 'more': 'contrast-more', 'less': 'contrast-less' },
    'orientation': { 'portrait': 'portrait', 'landscape': 'landscape' },
  };

  // Parse min-width and max-width from the query using regex
  const minWidthMatch = query.match(/\(\s*min-(?:device-)?width\s*:\s*([\d.]+)(px|rem|em)\s*\)/i);
  if (minWidthMatch) {
    const val = convertToPx(minWidthMatch[1], minWidthMatch[2]);
    if (val !== null) {
      media_min = media_min !== null ? Math.max(media_min, val) : val;
    }
  }

  const maxWidthMatch = query.match(/\(\s*max-(?:device-)?width\s*:\s*([\d.]+)(px|rem|em)\s*\)/i);
  if (maxWidthMatch) {
    const val = convertToPx(maxWidthMatch[1], maxWidthMatch[2]);
    if (val !== null) {
      media_max = media_max !== null ? Math.min(media_max, val) : val;
    }
  }

  // Handle range syntax: (width >= 768px), (width <= 1024px), (width > 768px), (width < 1024px)
  const rangeMatches = Array.from(query.matchAll(/\(\s*width\s*([><=]+)\s*([\d.]+)(px|rem|em)\s*\)/gi));
  for (const match of rangeMatches) {
    const op = match[1];
    const val = convertToPx(match[2], match[3]);
    if (val === null) continue;

    if (op === '>=' || op === '=>') {
      const v = val <= 200 ? null : val;
      if (v !== null) media_min = media_min !== null ? Math.max(media_min, v) : v;
    } else if (op === '<=') {
      media_max = media_max !== null ? Math.min(media_max, val) : val;
    } else if (op === '>') {
      const v = val + 1 <= 200 ? null : val + 1;
      if (v !== null) media_min = media_min !== null ? Math.max(media_min, v) : v;
    } else if (op === '<') {
      media_max = media_max !== null ? Math.min(media_max, val - 1) : val - 1;
    }
  }

  // Parse feature-value pairs
  for (const [feature, valueMap] of Object.entries(featureMap)) {
    const featureMatch = query.match(new RegExp(`\\(\\s*${feature}\\s*:\\s*(\\w[\\w-]*)\\s*\\)`, 'i'));
    if (featureMatch) {
      const twClass = valueMap[featureMatch[1]];
      if (twClass) tailwindClasses.push(twClass);
    }
  }

  // Adjust to closest Tailwind breakpoints if requested
  if (useTailwindBreakpoints) {
    if (media_min !== null) media_min = getClosestTailwindBreakpoint(media_min, true);
    if (media_max !== null) media_max = getClosestTailwindBreakpoint(media_max, false);
  }

  if (media_min === null) media_min = -1;
  if (media_max === null) media_max = 9999;

  let result: MediaRange[];

  if (isNot) {
    result = [];
    if (media_min > -1) {
      result.push({ tailwind_classes: tailwindClasses, media_min: -1, media_max: media_min - 1 });
    }
    if (media_max < 9999) {
      result.push({ tailwind_classes: tailwindClasses, media_min: media_max + 1, media_max: 9999 });
    }
  } else {
    result = [{ tailwind_classes: tailwindClasses, media_min, media_max }];
  }

  existingQueryRanges[query][cacheKey] = deepCopy(result);
  return deepCopy(result);
}

/**
 * Resolve a CSS variable's value, considering element scope and media queries.
 */
export function resolveCssVariableValue(
  varName: string,
  elementLabels: string[],
  cssvarDefinedArr: Record<string, CssVarDefinition[]>,
  cssVarMap: Record<string, string>,
  seenVars: Set<string> = new Set(),
  depth: number = 0
): VariableRange[] {
  const fullVarName = varName.startsWith('--') ? varName : '--' + varName;

  if (seenVars.has(fullVarName)) return [];
  seenVars.add(fullVarName);

  const definitions = cssvarDefinedArr[fullVarName];
  if (!definitions || definitions.length === 0) return [];

  // Build specificity map from element ancestry
  const specificityMap: Record<string, number> = {};
  elementLabels.forEach((label, index) => {
    specificityMap[label] = elementLabels.length - index;
  });
  specificityMap['__global__'] = 0.5;
  specificityMap['html'] = 0;
  specificityMap['body'] = 0;
  specificityMap[':root'] = 0;

  let ranges: Array<{
    value: string;
    media_min: number;
    media_max: number;
    specificity: number;
    ruleIndex: number;
  }> = [];

  definitions.forEach((def, ruleIndex) => {
    const { label, value, media, selector } = def;
    let specificity = (typeof specificityMap[label] !== 'undefined') ? specificityMap[label] : -1;

    if (label === '__global__' && selector) {
      if (selector === ':root' || selector.indexOf(':root') >= 0) specificity = 0.5;
      else if (selector === '*') specificity = 0.1;
      else specificity = 0.5;
    }

    if (specificity === -1) return;

    const mediaRanges = parseMediaQueryToTailwind(media);
    mediaRanges.forEach(mediaRange => {
      ranges.push({
        value,
        media_min: mediaRange.media_min,
        media_max: mediaRange.media_max,
        specificity,
        ruleIndex,
      });
    });
  });

  if (ranges.length === 0) return [];

  ranges.sort((a, b) => {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.ruleIndex !== b.ruleIndex) return b.ruleIndex - a.ruleIndex;
    return 0;
  });

  let resolvedRanges: VariableRange[] = [];
  for (const range of ranges) {
    const resolvedValue = resolveValue(range.value, elementLabels, cssvarDefinedArr, cssVarMap, seenVars, depth + 1);
    resolvedRanges = mergeRangesVariables(resolvedRanges, {
      concrete_value: resolvedValue,
      media_min: range.media_min,
      media_max: range.media_max,
      specificity: range.specificity,
      ruleIndex: range.ruleIndex,
    });
  }

  seenVars.delete(fullVarName);
  return resolvedRanges;
}

/**
 * Parse a var() function call with proper parenthesis matching.
 */
export function parseVarFunctionHelper(
  str: string,
  startIndex: number
): { varName: string; defaultValue: string | null; endIndex: number; fullMatch: string } | null {
  if (!str.substring(startIndex).startsWith('var(')) return null;

  let i = startIndex + 4;
  let parenCount = 1;
  let varName = '';
  let defaultValue: string | null = null;
  let inVarName = true;
  let buffer = '';

  while (i < str.length && parenCount > 0) {
    const char = str[i];
    if (char === '(') { parenCount++; buffer += char; }
    else if (char === ')') {
      parenCount--;
      if (parenCount > 0) buffer += char;
    } else if (char === ',' && parenCount === 1 && inVarName) {
      varName = buffer.trim();
      buffer = '';
      inVarName = false;
    } else {
      buffer += char;
    }
    i++;
  }

  if (parenCount === 0) {
    if (inVarName) varName = buffer.trim();
    else defaultValue = buffer.trim();

    if (!varName.startsWith('--')) return null;

    return {
      varName,
      defaultValue,
      endIndex: i,
      fullMatch: str.substring(startIndex, i),
    };
  }

  return null;
}

/**
 * Resolve all var() references in a CSS value string.
 */
export function resolveValue(
  value: string,
  elementLabels: string[],
  cssvarDefinedArr: Record<string, CssVarDefinition[]>,
  cssVarMap: Record<string, string>,
  seenVars: Set<string>,
  depth: number
): string {
  let result = value;
  let i = 0;
  const replacements: { start: number; end: number; replacement: string }[] = [];

  while (i < result.length) {
    const varIndex = result.indexOf('var(', i);
    if (varIndex === -1) break;

    const parsed = parseVarFunctionHelper(result, varIndex);
    if (!parsed) { i = varIndex + 4; continue; }

    const { varName, defaultValue, endIndex } = parsed;
    const innerVarName = varName.startsWith('--') ? varName.substring(2) : varName;

    const resolvedRanges = resolveCssVariableValue(innerVarName, elementLabels, cssvarDefinedArr, cssVarMap, seenVars, depth);
    let resolvedVal = rangesToValue(resolvedRanges);

    if (resolvedVal === '' && defaultValue !== null) {
      resolvedVal = resolveValue(defaultValue, elementLabels, cssvarDefinedArr, cssVarMap, seenVars, depth);
    }

    replacements.push({ start: varIndex, end: endIndex, replacement: resolvedVal });
    i = endIndex;
  }

  // Apply replacements in reverse order
  for (let j = replacements.length - 1; j >= 0; j--) {
    const { start, end, replacement } = replacements[j];
    result = result.substring(0, start) + replacement + result.substring(end);
  }

  return result;
}

/**
 * Select the best concrete value from a set of variable ranges.
 */
export function rangesToValue(ranges: VariableRange[]): string {
  if (ranges.length === 0) return '';
  if (ranges.length === 1) return ranges[0].concrete_value;

  let applicableRanges = ranges.filter(r => r.media_min <= -1 && r.media_max >= 9999);

  if (applicableRanges.length === 0) {
    const maxRange = Math.max(...ranges.map(r => r.media_max - r.media_min));
    applicableRanges = ranges.filter(r => (r.media_max - r.media_min) === maxRange);
  }

  applicableRanges.sort((a, b) => {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.ruleIndex !== b.ruleIndex) return b.ruleIndex - a.ruleIndex;
    return 0;
  });

  return applicableRanges[0].concrete_value;
}

/**
 * Merge variable ranges, combining overlapping ranges with same concrete value.
 */
export function mergeRangesVariables(existingRanges: VariableRange[], newRange: VariableRange): VariableRange[] {
  existingRanges.push(newRange);
  existingRanges.sort((a, b) => a.media_min - b.media_min);

  const merged: VariableRange[] = [];
  for (const range of existingRanges) {
    if (merged.length === 0) {
      merged.push(range);
    } else {
      const last = merged[merged.length - 1];
      if (last.concrete_value === range.concrete_value && last.media_max >= range.media_min) {
        last.media_max = Math.max(last.media_max, range.media_max);
      } else {
        merged.push(range);
      }
    }
  }
  return merged;
}

/** Valid Tailwind pseudo-selectors */
const validPseudos = [
  'hover', 'focus', 'focus-within', 'focus-visible', 'active',
  'visited', 'target', 'first', 'last', 'only', 'odd', 'even',
  'first-of-type', 'last-of-type', 'only-of-type', 'empty',
  'disabled', 'enabled', 'checked', 'indeterminate', 'default',
  'required', 'valid', 'invalid', 'in-range', 'out-of-range',
  'placeholder-shown', 'autofill', 'read-only', 'before', 'after',
  'placeholder', 'file', 'selection', 'first-line',
  'first-letter', 'dark', 'print', 'portrait', 'landscape',
];

/**
 * Extract valid Tailwind pseudo-selectors from a CSS selector.
 * Simplified version that doesn't require parsel AST parsing.
 */
export function getPseudos(cssSelector: string): string[] {
  const pseudos: string[] = [];

  // Extract pseudo-classes and pseudo-elements from the selector
  const pseudoMatches = Array.from(cssSelector.matchAll(/::?([a-zA-Z][\w-]*)/g));
  for (const match of pseudoMatches) {
    const name = match[1];
    if (validPseudos.includes(name)) {
      pseudos.push(name);
    }
  }

  // Check if hover exists anywhere in the selector
  const hoverExists = cssSelector.includes(':hover');
  if (hoverExists && !pseudos.includes('hover')) {
    pseudos.push('hover');
  }

  // Deduplicate and sort
  const unique = Array.from(new Set(pseudos));
  unique.sort((a, b) => a.localeCompare(b));

  return unique;
}

/**
 * Check if a CSS selector contains any known pseudo-selectors.
 */
export function containsPseudo(selector: string): boolean {
  if (!selector.includes(':')) return false;

  for (const pseudo of allPseudos) {
    const singleColon = `:${pseudo}`;
    const doubleColon = `::${pseudo}`;

    let pos = selector.indexOf(singleColon);
    while (pos !== -1) {
      if (pos === 0 || selector[pos - 1] !== '\\') return true;
      pos = selector.indexOf(singleColon, pos + 1);
    }

    pos = selector.indexOf(doubleColon);
    while (pos !== -1) {
      if (pos === 0 || selector[pos - 1] !== '\\') return true;
      pos = selector.indexOf(doubleColon, pos + 1);
    }
  }

  return false;
}

/**
 * Check if a selector contains invalid/unsupported pseudo-selectors.
 */
export function hasInvalidPseudos(selector: string): boolean {
  const invalidPseudos = [
    'backdrop', '-webkit-scrollbar', 'selection', '-webkit-scrollbar-thumb',
    '-webkit-scrollbar-track', '-webkit-scrollbar:hover', '-webkit-scrollbar-track:hover',
    'placeholder', 'marker', 'spelling-error', '::grammar-error',
    '-webkit-file-upload-button', '-webkit-inner-spin-button', '-webkit-outer-spin-button',
    '-webkit-resizer', '-webkit-calendar-picker-indicator', '-webkit-details-marker',
    '-webkit-scrollbar-corner', 'cue', '-webkit-autofill', '-webkit-full-screen',
  ];

  for (const pseudo of invalidPseudos) {
    const singleColon = `:${pseudo}`;
    const doubleColon = `::${pseudo}`;

    let pos = selector.indexOf(singleColon);
    while (pos !== -1) {
      if (pos === 0 || selector[pos - 1] !== '\\') return true;
      pos = selector.indexOf(singleColon, pos + 1);
    }

    pos = selector.indexOf(doubleColon);
    while (pos !== -1) {
      if (pos === 0 || selector[pos - 1] !== '\\') return true;
      pos = selector.indexOf(doubleColon, pos + 1);
    }
  }

  return false;
}

/**
 * Strip pseudo-classes and pseudo-elements from a CSS selector.
 */
export function stripPseudos(cssSelector: string): string {
  // Remove ::pseudo-element and :pseudo-class from selector
  return cssSelector
    .replace(/::[a-zA-Z][\w-]*/g, '')
    .replace(/:(?!not\(|where\(|is\(|has\()[a-zA-Z][\w-]*(\([^)]*\))?/g, '')
    .trim();
}

/**
 * Parse a CSS style attribute string into property-value pairs.
 */
export function parseStyleAttribute(styleAttr: string): StyleDeclaration[] {
  const declarations: StyleDeclaration[] = [];
  let buffer = '';
  let inQuotes = false;
  let quoteChar = '';
  let prop = '';
  let expecting: 'property' | 'value' = 'property';

  for (let i = 0; i < styleAttr.length; i++) {
    const char = styleAttr[i];

    if (inQuotes) {
      if (char === quoteChar) inQuotes = false;
      buffer += char;
    } else {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
        buffer += char;
      } else if (char === ':' && expecting === 'property') {
        prop = buffer.trim();
        buffer = '';
        expecting = 'value';
      } else if (char === ';' && expecting === 'value') {
        declarations.push({ property: prop, value: buffer.trim() });
        buffer = '';
        expecting = 'property';
      } else {
        buffer += char;
      }
    }
  }

  if (buffer.trim() !== '') {
    declarations.push({ property: prop, value: buffer.trim() });
  }

  return declarations;
}
