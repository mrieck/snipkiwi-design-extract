import { CDPSession } from 'patchright';
import { FontData, StylesheetInfo, ExtractionContext, CssVarDefinition } from '../types/index.js';
import { resolveUrl } from '../utils/helpers.js';

/**
 * Parses @font-face declarations and CSS variables from stylesheets.
 * Port of snipbackground.js:1343-1627
 */
export class FontCollector {
  /**
   * Parse @font-face rules from stylesheet text.
   */
  parseFontFaces(cssText: string, baseUrl: string): FontData[] {
    const fonts: FontData[] = [];

    // Regex to find @font-face blocks
    const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
    let match;

    while ((match = fontFaceRegex.exec(cssText)) !== null) {
      const block = match[1];
      const font: FontData = {
        font_family: '',
        font_url: '',
        full_rule: '@font-face {' + block + '}',
      };

      // Extract font-family
      const familyMatch = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1/i);
      if (familyMatch) {
        font.font_family = familyMatch[2].trim();
      }

      // Extract src URLs
      const srcMatch = block.match(/src\s*:\s*([^;]+)/i);
      if (srcMatch) {
        const urlMatch = srcMatch[1].match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (urlMatch) {
          font.font_url = resolveUrl(urlMatch[1], baseUrl);
        }
        // Extract format
        const formatMatch = srcMatch[1].match(/format\(['"]?([^'")\s]+)['"]?\)/);
        if (formatMatch) {
          font.font_format = formatMatch[1];
        }
      }

      // Extract font-weight
      const weightMatch = block.match(/font-weight\s*:\s*([^;]+)/i);
      if (weightMatch) {
        font.font_weight = weightMatch[1].trim();
      }

      // Extract font-style
      const styleMatch = block.match(/font-style\s*:\s*([^;]+)/i);
      if (styleMatch) {
        font.font_style = styleMatch[1].trim();
      }

      // Extract font-display
      const displayMatch = block.match(/font-display\s*:\s*([^;]+)/i);
      if (displayMatch) {
        font.font_display = displayMatch[1].trim();
      }

      if (font.font_family) {
        fonts.push(font);
      }
    }

    return fonts;
  }

  /**
   * Extract Google Font imports from stylesheet text.
   */
  parseGoogleFontImports(cssText: string): string[] {
    const imports: string[] = [];
    const importRegex = /@import\s+url\(['"]?(https?:\/\/fonts\.googleapis\.com[^'")\s]+)['"]?\)/gi;
    let match;

    while ((match = importRegex.exec(cssText)) !== null) {
      if (!imports.includes(match[1])) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  /**
   * Extract global CSS variables from stylesheet text.
   * Looks for :root, :host, *, html, body selectors.
   */
  parseGlobalCssVariables(
    cssText: string,
    ctx: ExtractionContext
  ): void {
    // Match :root, :host, *, html, body blocks
    const globalBlockRegex = /(?::root|:host|\*|html|body)\s*\{([^}]+)\}/gi;
    let match;

    while ((match = globalBlockRegex.exec(cssText)) !== null) {
      const block = match[1];
      const selector = match[0].split('{')[0].trim();

      // Find all --var declarations
      const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g;
      let varMatch;

      while ((varMatch = varRegex.exec(block)) !== null) {
        const prop = varMatch[1];
        const val = varMatch[2].trim();

        ctx.cssvarAllArr[prop] = val + ';';

        if (!ctx.cssvarDefinedArr[prop]) {
          ctx.cssvarDefinedArr[prop] = [];
        }

        const globalKey = `__global__${selector}${prop}`;
        const exists = ctx.cssvarDefinedArr[prop].some(
          (item: CssVarDefinition) => item.key === globalKey
        );

        if (!exists) {
          ctx.cssvarDefinedArr[prop].push({
            key: globalKey,
            label: '__global__',
            value: val,
            media: '',
            selector,
            source: 'stylesheet',
          });
        }
      }
    }
  }

  /**
   * Collect all font data and CSS variables from all stylesheets.
   */
  async collectAll(
    cdp: CDPSession,
    stylesheets: StylesheetInfo[],
    siteUrl: string,
    ctx: ExtractionContext
  ): Promise<void> {
    // Fetch all stylesheet texts in parallel
    const results = await Promise.all(
      stylesheets
        .filter(ss => ss.origin !== 'user-agent')
        .map(async (ss) => {
          try {
            const result = await cdp.send('CSS.getStyleSheetText', {
              styleSheetId: ss.stylesheet_id,
            });
            return { ss, text: result.text || '' };
          } catch {
            return { ss, text: '' };
          }
        })
    );

    for (const { ss, text } of results) {
      if (!text) continue;

      const baseUrl = ss.source_url || siteUrl;

      // Parse @font-face rules
      if (text.includes('@font-face')) {
        const fonts = this.parseFontFaces(text, baseUrl);
        for (const font of fonts) {
          // Deduplicate by font_family + font_weight + font_style
          const exists = ctx.customfontsArr.some(
            (f: FontData) =>
              f.font_family === font.font_family &&
              f.font_weight === font.font_weight &&
              f.font_style === font.font_style
          );
          if (!exists) {
            ctx.customfontsArr.push(font);
          }
        }
      }

      // Parse Google Font imports
      const imports = this.parseGoogleFontImports(text);
      for (const imp of imports) {
        if (!ctx.importfontsArr.includes(imp)) {
          ctx.importfontsArr.push(imp);
        }
      }

      // Parse global CSS variables
      if (text.includes('--')) {
        this.parseGlobalCssVariables(text, ctx);
      }
    }
  }
}
