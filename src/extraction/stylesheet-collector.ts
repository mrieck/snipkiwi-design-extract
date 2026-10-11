import { CDPSession } from 'patchright';
import { StylesheetInfo, CDPStylesheet } from '../types/index.js';

/**
 * Collects stylesheets from the page using CDP CSS domain events.
 * Replaces the onDebuggerEvent handler for CSS.styleSheetAdded in snipbackground.js:573-696
 */
export class StylesheetCollector {
  private stylesheets: StylesheetInfo[] = [];
  private collecting = false;

  /**
   * Start collecting stylesheet events. Call this BEFORE navigation or
   * immediately after CSS.enable so we catch all CSS.styleSheetAdded events.
   */
  async startCollecting(cdp: CDPSession): Promise<void> {
    this.stylesheets = [];
    this.collecting = true;

    cdp.on('CSS.styleSheetAdded', (params: { header: CDPStylesheet }) => {
      if (!this.collecting) return;

      const header = params.header;
      this.stylesheets.push({
        stylesheet_id: header.styleSheetId,
        source_url: header.sourceURL || '',
        frame_id: header.frameId,
        origin: header.origin,
        is_inline: header.isInline || false,
      });
    });
  }

  /**
   * Stop collecting and return all captured stylesheets.
   */
  stopCollecting(): StylesheetInfo[] {
    this.collecting = false;
    return [...this.stylesheets];
  }

  /**
   * Fetch the text content of all collected stylesheets.
   * Parallelizes the CSS.getStyleSheetText calls.
   */
  async fetchAllStylesheetTexts(cdp: CDPSession): Promise<StylesheetInfo[]> {
    const results = await Promise.all(
      this.stylesheets.map(async (ss) => {
        // Skip user-agent stylesheets - they don't have text
        if (ss.origin === 'user-agent') return ss;

        try {
          const result = await cdp.send('CSS.getStyleSheetText', {
            styleSheetId: ss.stylesheet_id,
          });
          ss.text = result.text;
        } catch (e) {
          // Some stylesheets may not be accessible (cross-origin)
          ss.text = '';
        }
        return ss;
      })
    );

    return results;
  }

  /**
   * Get collected stylesheets (without text content).
   */
  getStylesheets(): StylesheetInfo[] {
    return [...this.stylesheets];
  }

  /**
   * Get a specific stylesheet by ID.
   */
  getStylesheetById(id: string): StylesheetInfo | undefined {
    return this.stylesheets.find(s => s.stylesheet_id === id);
  }
}
