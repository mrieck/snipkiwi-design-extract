import { CDPSession, Page } from 'patchright';
import {
  ExtractionContext, ExtractionOptions, ExtractionResult,
  CDPMatchedStyles, ViewportConfig,
} from '../types/index.js';
import { BrowserManager, BrowserPage } from '../browser/browser-manager.js';
import { ViewportManager } from '../browser/viewport-manager.js';
import { StylesheetCollector } from './stylesheet-collector.js';
import { DomLabeler } from './dom-labeler.js';
import { StyleMatcher } from './style-matcher.js';
import { PseudoStateHandler } from './pseudo-state-handler.js';
import { PseudoScanner, elementMayHaveHover } from './pseudo-scanner.js';
import { KeyframeCollector } from './keyframe-collector.js';
import { FontCollector } from './font-collector.js';
import { CssVariableResolver } from './css-variable-resolver.js';
import { SelectorFixer } from './selector-fixer.js';
import { RuleDeduplicator } from './rule-deduplicator.js';
import { ResultBuilder } from './result-builder.js';
import { removeExtraAttributes } from './html-cleaner.js';
import { getTailwindHtml, getTailwindBodyClasses } from '../tailwind/tailwind-converter.js';

const BATCH_SIZE = 12; // Elements processed in parallel per batch (pure reads; order preserved)

/**
 * Safety valve: setting SNIPKIWI_NO_PSEUDO_SKIP=1 disables the pseudo-scan
 * optimization, restoring the pre-optimization behavior of forcing pseudo-states
 * on every hover-capable element. Use if a site's hover/checked styles ever look
 * wrong — and to A/B verify the optimization is lossless.
 */
function forcePseudoScanOff(scan: { hasAnyHover: boolean; hasAnyChecked: boolean; hoverHasNonClassSelector: boolean }): void {
  if (process.env.SNIPKIWI_NO_PSEUDO_SKIP === '1') {
    scan.hasAnyHover = true;
    scan.hasAnyChecked = true;
    scan.hoverHasNonClassSelector = true; // makes elementMayHaveHover() always true
  }
}

/**
 * Main extraction pipeline orchestrator.
 * Replaces the doSnipper() function from snipbackground.js.
 */
export class ExtractionPipeline {
  private browserManager: BrowserManager;
  private viewportManager = new ViewportManager();
  private stylesheetCollector = new StylesheetCollector();
  private domLabeler = new DomLabeler();
  private styleMatcher = new StyleMatcher();
  private pseudoStateHandler = new PseudoStateHandler();
  private pseudoScanner = new PseudoScanner();
  private keyframeCollector = new KeyframeCollector();
  private fontCollector = new FontCollector();
  private variableResolver = new CssVariableResolver();
  private selectorFixer = new SelectorFixer();
  private ruleDeduplicator = new RuleDeduplicator();
  private resultBuilder = new ResultBuilder();

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  /**
   * Extract CSS from a page element and optionally convert to Tailwind.
   */
  async extract(
    url: string,
    selector: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const ctx = new ExtractionContext();
    ctx.siteUrl = url;
    ctx.logger = options.logger;

    const resolveVariables = options.resolveVariables !== false;
    const includeHoverStates = options.includeHoverStates !== false;
    const doRemoveClasses = options.removeUnusedClasses ?? true;
    const doRemoveAttrs = options.removeUnusedAttributes ?? true;
    const viewportOption = options.viewport || 'all';

    let bp: BrowserPage | null = null;

    try {
      // STEP 1: Create page and CDP session
      bp = await this.browserManager.createPage(url);
      const { page, cdp } = bp;

      // STEP 2: Attach stylesheet listener BEFORE navigation so CSS.styleSheetAdded
      // events fired during page load are captured (fonts, 3rd-party stylesheets, etc.)
      await this.stylesheetCollector.startCollecting(cdp);

      // STEP 2b: Now navigate — all stylesheet events during load will be captured
      await this.browserManager.navigatePage(bp, url);

      // STEP 3: Get DOM document
      const doc = await cdp.send('DOM.getDocument');
      const docRootNodeId = doc.root.nodeId;

      // STEP 4: Stop collecting and get stylesheets
      const stylesheets = this.stylesheetCollector.stopCollecting();
      ctx.stylesheetArr = stylesheets;

      // STEP 5: Label elements in the DOM
      const labelResult = await this.domLabeler.labelElements(page, selector);
      ctx.allClassnamesArr = labelResult.allClassnamesArr;
      ctx.elementMeta = labelResult.elementMeta;

      console.error(`Labeled ${labelResult.allClassnamesArr.length} elements`);

      // STEP 6: Parse fonts and CSS variables from stylesheets
      await this.fontCollector.collectAll(cdp, stylesheets, url, ctx);

      // STEP 6b: Scan collected CSS for pseudo-class rules so the per-viewport
      // loop can skip pseudo-state forcing for elements no such rule can match.
      const pseudoScan = await this.pseudoScanner.scan(cdp, stylesheets);
      forcePseudoScanOff(pseudoScan); // SNIPKIWI_NO_PSEUDO_SKIP=1 escape valve
      ctx.hasAnyHover = pseudoScan.hasAnyHover;
      ctx.hasAnyChecked = pseudoScan.hasAnyChecked;

      // STEP 7: Determine viewports to process
      const viewports = this.viewportManager.getViewportsForOption(
        viewportOption,
        options.customWidth
      );

      // STEP 8: For each viewport, extract matched styles.
      // nodeIds stay valid across viewport emulation (no navigation/reload), so
      // resolve the document root + each element's nodeId ONCE and reuse them;
      // only getMatchedStylesForNode must re-run per viewport (media queries).
      const nodeIdCache = new Map<string, number>();
      let vpRootNodeId = 0;
      for (const viewport of viewports) {
        console.error(`Processing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

        // Set viewport (skip for default)
        if (viewport.name !== 'default') {
          await this.viewportManager.setViewport(cdp, viewport);
          // Wait for layout to stabilize
          await page.waitForTimeout(500);
        }

        // Resolve the document root once (reused across viewports).
        if (vpRootNodeId === 0) {
          const vpDoc = await cdp.send('DOM.getDocument');
          vpRootNodeId = vpDoc.root.nodeId;
        }

        // Process elements in batches for parallelization
        // NOTE: getMatchedStylesForNode is parallelizable, but
        // forcePseudoState is NOT (it mutates global state)
        for (let i = 0; i < ctx.allClassnamesArr.length; i += BATCH_SIZE) {
          const batch = ctx.allClassnamesArr.slice(i, i + BATCH_SIZE);

          // Parallel: Get matched styles for batch
          const batchResults = await Promise.all(
            batch.map(async (classname) => {
              try {
                // Resolve the element's nodeId once, then reuse across viewports.
                let elemNodeId = nodeIdCache.get(classname);
                if (elemNodeId === undefined) {
                  const node = await cdp.send('DOM.querySelector', {
                    nodeId: vpRootNodeId,
                    selector: '.' + classname,
                  });
                  if (!node.nodeId || node.nodeId === 0) {
                    console.error(`Element not found: .${classname}`);
                    return null;
                  }
                  elemNodeId = node.nodeId;
                  nodeIdCache.set(classname, elemNodeId);
                }

                // Get matched styles (THE core CDP call) — re-run per viewport.
                const allMatchedStyles = await this.styleMatcher.getMatchedStyles(
                  cdp, elemNodeId
                );

                return { classname, nodeId: elemNodeId, allMatchedStyles };
              } catch (e) {
                console.error(`Error matching styles for .${classname}:`, e);
                return null;
              }
            })
          );

          // Process results (sequential for state-dependent operations)
          for (const result of batchResults) {
            if (!result) continue;
            const { classname, nodeId, allMatchedStyles } = result;

            // Process matched rules
            const matchedRules = this.styleMatcher.processMatchedStyles(
              allMatchedStyles,
              classname,
              ctx,
              { resolveVariables, mediaQueriesOnly: viewport.name !== 'default' && viewport.name.startsWith('custom') }
            );

            // Extract CSS variables
            this.styleMatcher.extractCssVariables(matchedRules, classname, ctx);

            // Collect keyframes
            this.keyframeCollector.collect(allMatchedStyles, ctx);

            // Convert to SnippedRules and add (deduplicated)
            for (const ruleMatch of matchedRules) {
              const snippedRule = this.styleMatcher.toSnippedRule(
                ruleMatch, classname, viewport.name, ctx
              );
              if (snippedRule) {
                this.ruleDeduplicator.addRule(snippedRule, ctx);
              }
            }
          }

          // Sequential: Extract hover/checked styles (mutates page state).
          // Gated by the CSS pre-scan: skip when the page has no such rules, and
          // per element when no :hover/:active rule could possibly match it.
          if (includeHoverStates && (pseudoScan.hasAnyHover || pseudoScan.hasAnyChecked)) {
            for (const result of batchResults) {
              if (!result) continue;
              const { classname, nodeId } = result;
              const meta = ctx.elementMeta[classname];
              if (!meta) continue;

              // Hover styles
              if (pseudoScan.hasAnyHover && elementMayHaveHover(pseudoScan, meta.tag, meta.classTokens)) {
                const hoverRules = await this.pseudoStateHandler.extractHoverStyles(
                  cdp, meta, nodeId, classname, vpRootNodeId
                );
                for (const ruleMatch of hoverRules) {
                  const snippedRule = this.styleMatcher.toSnippedRule(
                    ruleMatch, classname, viewport.name, ctx
                  );
                  if (snippedRule) {
                    snippedRule.is_hover = true;
                    this.ruleDeduplicator.addRule(snippedRule, ctx);
                  }
                }
              }

              // Checked styles (for checkboxes/radios)
              if (pseudoScan.hasAnyChecked && meta.tag === 'INPUT') {
                const checkedRules = await this.pseudoStateHandler.extractCheckedStyles(
                  cdp, meta, nodeId, classname, vpRootNodeId
                );
                for (const ruleMatch of checkedRules) {
                  const snippedRule = this.styleMatcher.toSnippedRule(
                    ruleMatch, classname, viewport.name, ctx
                  );
                  if (snippedRule) {
                    this.ruleDeduplicator.addRule(snippedRule, ctx);
                  }
                }
              }
            }
          }
        }

        // Reset viewport
        if (viewport.name !== 'default') {
          await this.viewportManager.clearViewport(cdp);
        }
      }

      console.error(`Extracted ${ctx.snippedArr.length} CSS rules`);

      // STEP 9: Build final result
      const result = this.resultBuilder.buildResult(ctx, labelResult.allElementOuterHtml, {
        resolveVariables,
      });

      // STEP 10: Tailwind conversion
      try {
        const labeledHtml = labelResult.allElementOuterHtml;
        result.tailwindHtml = getTailwindHtml(
          labeledHtml,
          result.css,
          ctx.snippedArr,
          true, // forceBreakpoints
          resolveVariables,
          ctx
        );
        result.tailwindBodyClasses = getTailwindBodyClasses(
          ctx.snippedArr,
          true,
          resolveVariables,
          [], // tailwindUltimateArr - populated inside getTailwindBodyClasses
          ctx
        );
      } catch (e) {
        console.error('Tailwind conversion error:', e);
        // Non-fatal: CSS output is still valid
      }

      // STEP 11: Get clean HTML (without marker classes)
      result.html = await this.domLabeler.getCleanHtml(page, selector);

      // STEP 12: Remove unused attributes and classes from HTML
      if (doRemoveClasses || doRemoveAttrs) {
        const cleanOpts = {
          removeUnusedClasses: doRemoveClasses,
          removeUnusedAttributes: doRemoveAttrs,
          keepTailwindLabels: false,
        };
        result.html = removeExtraAttributes(result.html, ctx.snippedArr, cleanOpts);
        if (result.tailwindHtml) {
          result.tailwindHtml = removeExtraAttributes(
            result.tailwindHtml,
            ctx.snippedArr,
            { ...cleanOpts, keepTailwindLabels: true }
          );
        }
      }

      // STEP 13: Remove labels from DOM
      await this.domLabeler.removeLabels(page);

      return result;
    } finally {
      // Cleanup
      if (bp) {
        await this.browserManager.closePage(bp);
      }
    }
  }

  /**
   * Extract CSS from raw HTML content (e.g. email newsletters).
   * Uses page.setContent() instead of page.goto(). The extraction
   * steps after page creation are identical to extract().
   */
  async extractFromHtml(
    html: string,
    selector: string,
    options: ExtractionOptions & { baseUrl?: string } = {}
  ): Promise<ExtractionResult> {
    const ctx = new ExtractionContext();
    ctx.siteUrl = options.baseUrl || 'email://local';

    const resolveVariables = options.resolveVariables !== false;
    const includeHoverStates = options.includeHoverStates !== false;
    const doRemoveClasses = options.removeUnusedClasses ?? true;
    const doRemoveAttrs = options.removeUnusedAttributes ?? true;
    const viewportOption = options.viewport || 'all';

    let bp: BrowserPage | null = null;

    try {
      // STEP 1: Create page from HTML content (not a URL)
      bp = await this.browserManager.createPageFromHtml(html, options.baseUrl);
      const { page, cdp } = bp;

      // STEP 2: Start collecting stylesheets
      await this.stylesheetCollector.startCollecting(cdp);

      await page.waitForLoadState('networkidle');

      // STEP 3: Get DOM document
      const doc = await cdp.send('DOM.getDocument');
      const docRootNodeId = doc.root.nodeId;

      // STEP 4: Stop collecting and get stylesheets
      const stylesheets = this.stylesheetCollector.stopCollecting();
      ctx.stylesheetArr = stylesheets;

      // STEP 5: Label elements in the DOM
      const labelResult = await this.domLabeler.labelElements(page, selector);
      ctx.allClassnamesArr = labelResult.allClassnamesArr;
      ctx.elementMeta = labelResult.elementMeta;

      console.error(`Labeled ${labelResult.allClassnamesArr.length} elements`);

      // STEP 6: Parse fonts and CSS variables from stylesheets
      await this.fontCollector.collectAll(cdp, stylesheets, ctx.siteUrl, ctx);

      // STEP 6b: Scan collected CSS for pseudo-class rules (see extract()).
      const pseudoScan = await this.pseudoScanner.scan(cdp, stylesheets);
      forcePseudoScanOff(pseudoScan); // SNIPKIWI_NO_PSEUDO_SKIP=1 escape valve
      ctx.hasAnyHover = pseudoScan.hasAnyHover;
      ctx.hasAnyChecked = pseudoScan.hasAnyChecked;

      // STEP 7: Determine viewports to process
      const viewports = this.viewportManager.getViewportsForOption(
        viewportOption,
        options.customWidth
      );

      // STEP 8: For each viewport, extract matched styles (nodeIds reused across
      // viewports — see extract()).
      const nodeIdCache = new Map<string, number>();
      let vpRootNodeId = 0;
      for (const viewport of viewports) {
        console.error(`Processing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

        if (viewport.name !== 'default') {
          await this.viewportManager.setViewport(cdp, viewport);
          await page.waitForTimeout(500);
        }

        if (vpRootNodeId === 0) {
          const vpDoc = await cdp.send('DOM.getDocument');
          vpRootNodeId = vpDoc.root.nodeId;
        }

        for (let i = 0; i < ctx.allClassnamesArr.length; i += BATCH_SIZE) {
          const batch = ctx.allClassnamesArr.slice(i, i + BATCH_SIZE);

          const batchResults = await Promise.all(
            batch.map(async (classname) => {
              try {
                let elemNodeId = nodeIdCache.get(classname);
                if (elemNodeId === undefined) {
                  const node = await cdp.send('DOM.querySelector', {
                    nodeId: vpRootNodeId,
                    selector: '.' + classname,
                  });
                  if (!node.nodeId || node.nodeId === 0) {
                    console.error(`Element not found: .${classname}`);
                    return null;
                  }
                  elemNodeId = node.nodeId;
                  nodeIdCache.set(classname, elemNodeId);
                }

                const allMatchedStyles = await this.styleMatcher.getMatchedStyles(
                  cdp, elemNodeId
                );

                return { classname, nodeId: elemNodeId, allMatchedStyles };
              } catch (e) {
                console.error(`Error matching styles for .${classname}:`, e);
                return null;
              }
            })
          );

          for (const result of batchResults) {
            if (!result) continue;
            const { classname, nodeId, allMatchedStyles } = result;

            const matchedRules = this.styleMatcher.processMatchedStyles(
              allMatchedStyles,
              classname,
              ctx,
              { resolveVariables, mediaQueriesOnly: viewport.name !== 'default' && viewport.name.startsWith('custom') }
            );

            this.styleMatcher.extractCssVariables(matchedRules, classname, ctx);
            this.keyframeCollector.collect(allMatchedStyles, ctx);

            for (const ruleMatch of matchedRules) {
              const snippedRule = this.styleMatcher.toSnippedRule(
                ruleMatch, classname, viewport.name, ctx
              );
              if (snippedRule) {
                this.ruleDeduplicator.addRule(snippedRule, ctx);
              }
            }
          }

          if (includeHoverStates && (pseudoScan.hasAnyHover || pseudoScan.hasAnyChecked)) {
            for (const result of batchResults) {
              if (!result) continue;
              const { classname, nodeId } = result;
              const meta = ctx.elementMeta[classname];
              if (!meta) continue;

              if (pseudoScan.hasAnyHover && elementMayHaveHover(pseudoScan, meta.tag, meta.classTokens)) {
                const hoverRules = await this.pseudoStateHandler.extractHoverStyles(
                  cdp, meta, nodeId, classname, vpRootNodeId
                );
                for (const ruleMatch of hoverRules) {
                  const snippedRule = this.styleMatcher.toSnippedRule(
                    ruleMatch, classname, viewport.name, ctx
                  );
                  if (snippedRule) {
                    snippedRule.is_hover = true;
                    this.ruleDeduplicator.addRule(snippedRule, ctx);
                  }
                }
              }

              if (pseudoScan.hasAnyChecked && meta.tag === 'INPUT') {
                const checkedRules = await this.pseudoStateHandler.extractCheckedStyles(
                  cdp, meta, nodeId, classname, vpRootNodeId
                );
                for (const ruleMatch of checkedRules) {
                  const snippedRule = this.styleMatcher.toSnippedRule(
                    ruleMatch, classname, viewport.name, ctx
                  );
                  if (snippedRule) {
                    this.ruleDeduplicator.addRule(snippedRule, ctx);
                  }
                }
              }
            }
          }
        }

        if (viewport.name !== 'default') {
          await this.viewportManager.clearViewport(cdp);
        }
      }

      console.error(`Extracted ${ctx.snippedArr.length} CSS rules`);

      // STEP 9: Build final result
      const result = this.resultBuilder.buildResult(ctx, labelResult.allElementOuterHtml, {
        resolveVariables,
      });

      // STEP 10: Tailwind conversion
      try {
        const labeledHtml = labelResult.allElementOuterHtml;
        result.tailwindHtml = getTailwindHtml(
          labeledHtml,
          result.css,
          ctx.snippedArr,
          true,
          resolveVariables,
          ctx
        );
        result.tailwindBodyClasses = getTailwindBodyClasses(
          ctx.snippedArr,
          true,
          resolveVariables,
          [],
          ctx
        );
      } catch (e) {
        console.error('Tailwind conversion error:', e);
      }

      // STEP 11: Get clean HTML (without marker classes)
      result.html = await this.domLabeler.getCleanHtml(page, selector);

      // STEP 12: Remove unused attributes and classes from HTML
      if (doRemoveClasses || doRemoveAttrs) {
        const cleanOpts = {
          removeUnusedClasses: doRemoveClasses,
          removeUnusedAttributes: doRemoveAttrs,
          keepTailwindLabels: false,
        };
        result.html = removeExtraAttributes(result.html, ctx.snippedArr, cleanOpts);
        if (result.tailwindHtml) {
          result.tailwindHtml = removeExtraAttributes(
            result.tailwindHtml,
            ctx.snippedArr,
            { ...cleanOpts, keepTailwindLabels: true }
          );
        }
      }

      // STEP 13: Remove labels from DOM
      await this.domLabeler.removeLabels(page);

      return result;
    } finally {
      if (bp) {
        await this.browserManager.closePage(bp);
      }
    }
  }
}
