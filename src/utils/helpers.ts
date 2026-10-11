// Utility functions ported from snipbackground.js

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function randomLetters(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Split a string by a separator but not inside parentheses
 * Port of splitNoParen from snipbackground.js
 */
export function splitNoParen(str: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0 && str.substring(i, i + separator.length) === separator) {
      result.push(current);
      current = '';
      i += separator.length - 1;
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Check if a string looks like a URL
 */
export function isUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || str.startsWith('//');
}

/**
 * Resolve a relative URL against a base URL
 */
export function resolveUrl(relative: string, base: string): string {
  if (!relative || isUrl(relative) || relative.startsWith('data:')) {
    return relative;
  }
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Strip snipkiwi marker classes from HTML
 */
export function stripMarkerClasses(html: string): string {
  // Remove snipkiwiN-... class names
  return html.replace(/\s*snipkiwi\d+-[a-z0-9-]+/g, '')
    .replace(/\s*class=""/g, '');
}

/**
 * Check if a CSS selector matches icon font patterns
 */
export function isIconFontSelector(selector: string): boolean {
  if (!selector) return false;
  const patterns = [
    /\.fa[srldb]?(?:\s|,|:|{|\[|$)/,
    /\.fa-/,
    /\.ti(?:\s|,|:|{|\[|$)/,
    /\.ti-/,
    /\.bi(?:\s|,|:|{|\[|$)/,
    /\.bi-/,
    /\.material-icons/,
    /\.glyphicon/,
    /\.icon-/,
    /\.icofont-/,
    /\.ri-/,
    /\.bx-?/,
    /\.la-?/,
  ];
  return patterns.some(pattern => pattern.test(selector));
}

/**
 * Check if CSS body contains icon font-family
 */
export function hasIconFontFamily(body: string): boolean {
  if (!body) return false;
  const fontMatch = body.match(/font-family\s*:\s*([^;]+)/i);
  if (fontMatch) {
    const fontValue = fontMatch[1].toLowerCase();
    const iconFonts = [
      'font awesome', 'fontawesome', 'tabler', 'bootstrap-icons',
      'material icons', 'glyphicons', 'icomoon', 'icofont',
      'remixicon', 'boxicons', 'line awesome'
    ];
    return iconFonts.some(font => fontValue.includes(font));
  }
  return false;
}

export function isIconFontRule(selector: string, body: string): boolean {
  return isIconFontSelector(selector) || hasIconFontFamily(body);
}

/**
 * Delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
