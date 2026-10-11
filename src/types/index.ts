// CDP response types

export interface CDPNode {
  nodeId: number;
  backendNodeId?: number;
  nodeType?: number;
  nodeName?: string;
  localName?: string;
  nodeValue?: string;
  childNodeCount?: number;
  children?: CDPNode[];
  attributes?: string[];
}

export interface CDPDocument {
  root: CDPNode;
}

export interface CDPCSSProperty {
  name: string;
  value: string;
  important?: boolean;
  implicit?: boolean;
  text?: string;
  parsedOk?: boolean;
  disabled?: boolean;
  range?: CDPSourceRange;
}

export interface CDPSourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CDPCSSStyle {
  styleSheetId?: string;
  cssProperties: CDPCSSProperty[];
  shorthandEntries?: { name: string; value: string; important?: boolean }[];
  cssText?: string;
  range?: CDPSourceRange;
}

export interface CDPSelectorList {
  selectors: { text: string; range?: CDPSourceRange; specificity?: { a: number; b: number; c: number } }[];
  text: string;
}

export interface CDPCSSRule {
  styleSheetId?: string;
  selectorList: CDPSelectorList;
  style: CDPCSSStyle;
  origin: 'injected' | 'user-agent' | 'inspector' | 'regular';
  media?: CDPCSSMedia[];
}

export interface CDPCSSMedia {
  text: string;
  source: string;
  sourceURL?: string;
  range?: CDPSourceRange;
  styleSheetId?: string;
  mediaList?: { expressions: any[]; active: boolean }[];
}

export interface CDPRuleMatch {
  rule: CDPCSSRule;
  matchingSelectors: number[];
}

export interface CDPInheritedStyle {
  inlineStyle?: CDPCSSStyle;
  matchedCSSRules: CDPRuleMatch[];
}

export interface CDPMatchedStyles {
  inlineStyle?: CDPCSSStyle;
  attributesStyle?: CDPCSSStyle;
  matchedCSSRules: CDPRuleMatch[];
  inherited: CDPInheritedStyle[];
  pseudoElements: {
    pseudoType: string;
    pseudoIdentifier?: string;
    matches: CDPRuleMatch[];
  }[];
  cssKeyframesRules?: {
    animationName: { text: string };
    keyframes: { keyText: { text: string }; style: CDPCSSStyle }[];
  }[];
}

export interface CDPStylesheet {
  styleSheetId: string;
  frameId: string;
  sourceURL: string;
  origin: string;
  title?: string;
  ownerNode?: number;
  disabled?: boolean;
  isInline?: boolean;
  isMutable?: boolean;
  isConstructed?: boolean;
  length?: number;
  startLine?: number;
  startColumn?: number;
}

// Extraction types

export interface StylesheetInfo {
  stylesheet_id: string;
  source_url: string;
  frame_id: string;
  origin: string;
  is_inline: boolean;
  text?: string;
}

export interface SnippedRule {
  selector: string;
  body: string;
  media: string;
  classname: string;
  stylesheet_id: string;
  origin: string;
  is_inherited: boolean;
  other_inherited?: boolean;
  is_pseudo_element?: boolean;
  pseudo_type?: string;
  is_hover?: boolean;
  distance?: number;
  specificity_score?: number;
  viewport?: string;
  matched_selector?: string;  // The specific selector part(s) that matched (vs full comma-separated selector)
}

export interface CssVarDefinition {
  key: string;
  label: string;
  value: string;
  media: string;
  selector: string;
  source: string;
}

export interface FontData {
  font_family: string;
  font_url: string;
  font_format?: string;
  font_weight?: string;
  font_style?: string;
  font_display?: string;
  full_rule?: string;
}

export interface MatchingFinalRule {
  selector: string;
  body: string;
  media: string;
  specificity: number;
  is_inherited: boolean;
  distance?: number;
}

export interface MatchingFinalRuleEntry {
  indices: number[];
  selectors: string[];
  bodies: string[];
  media_queries: string[];
  matching_parts: string[][];
  contain_type: string[];
  inherited_type: string[];
  inherited_classes: any[];
  invalid_pseudos: boolean[];
}

/**
 * Per-element metadata captured during the single labeling page.evaluate, so the
 * pseudo-state handler doesn't need extra per-element CDP/evaluate round-trips
 * (getTagName / getParentClassnames / isCheckboxOrRadio) during extraction.
 */
export interface ElementMeta {
  /** Uppercase tag name (matches Element.tagName), e.g. 'DIV'. */
  tag: string;
  /** Original author class tokens (excludes injected snipkiwi markers). */
  classTokens: string[];
  /** input.type for INPUT elements, '' otherwise. */
  inputType: string;
  /** Ancestor snipkiwi classnames within the labeled subtree, closest-first
   *  (reproduces PseudoStateHandler.getParentClassnames). */
  parentClassnames: string[];
}

export interface LabelResult {
  allClassnamesArr: string[];
  allElementOuterHtml: string;
  allLabelOuterHtml: string;
  rootSelector: string;
  rootClassname: string;
  /** snipkiwi classname -> ElementMeta for every labeled element. */
  elementMeta: Record<string, ElementMeta>;
}

/**
 * Result of scanning the collected CSS for pseudo-class rules, used to skip
 * pseudo-state forcing for elements that provably cannot match any such rule.
 * Conservative by construction: when a :hover/:active selector can't be reduced
 * to class/tag anchors, `hoverHasNonClassSelector` forces the full (unchanged)
 * per-element fallback so no rule is ever missed.
 */
export interface PseudoScanResult {
  hasAnyHover: boolean;
  hasAnyChecked: boolean;
  hoverAnchorClassTokens: Set<string>;
  hoverAnchorTags: Set<string>;
  hoverHasNonClassSelector: boolean;
}

export interface ExtractionOptions {
  viewport?: 'all' | 'responsive' | 'desktop' | 'tablet' | 'mobile' | string;
  customWidth?: number;
  resolveVariables?: boolean;
  includeHoverStates?: boolean;
  removeUnusedClasses?: boolean;
  removeUnusedAttributes?: boolean;
  logger?: (msg: string) => void;
}

export interface ExtractionResult {
  html: string;
  css: string;
  tailwindHtml: string;
  tailwindBodyClasses: string;
  tailwindCss: string;
  fonts: FontData[];
  cssVariables: Record<string, string>;
}

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  userAgent?: string;
}

// Extraction context - replaces all global state from snipbackground.js

export class ExtractionContext {
  snippedArr: SnippedRule[] = [];
  stylesheetArr: StylesheetInfo[] = [];
  customfontsArr: FontData[] = [];
  cssvarUsedArr: string[] = [];
  cssvarDefinedArr: Record<string, CssVarDefinition[]> = {};
  cssvarAllArr: Record<string, string> = {};
  cssvarResolvedValues: Record<string, string> = {};
  matchingFinalRules: Record<string, MatchingFinalRuleEntry> = {};
  selectorSpecifityScore: Record<string, number> = {};
  selectorFixArr: Record<string, string> = {};
  selectorPartialFixArr: Record<string, boolean> = {};
  selectorContainedArr: Record<string, boolean> = {};
  selectorInheritedClassesArr: string[] = [];
  animationKeyframesArr: Record<string, any> = {};
  importfontsArr: string[] = [];
  cssfontsArr: string[] = [];
  usedFontArr: string[] = [];
  usedFontObjectArr: any[] = [];
  svgFilterReferences: string[] = [];
  allClassnamesArr: string[] = [];
  elementMeta: Record<string, ElementMeta> = {};
  hasAnyHover: boolean = true;
  hasAnyChecked: boolean = true;
  hoverAnchorClassTokens: Set<string> = new Set();
  hoverAnchorTags: Set<string> = new Set();
  hoverHasNonClassSelector: boolean = true;
  noPseudoSelectors: Record<string, string> = {};
  existingQueryRanges: Record<string, boolean> = {};
  siteUrl: string = '';
  logger?: (msg: string) => void;

  reset(): void {
    this.snippedArr = [];
    this.stylesheetArr = [];
    this.customfontsArr = [];
    this.cssvarUsedArr = [];
    this.cssvarDefinedArr = {};
    this.cssvarAllArr = {};
    this.cssvarResolvedValues = {};
    this.matchingFinalRules = {};
    this.selectorSpecifityScore = {};
    this.selectorFixArr = {};
    this.selectorPartialFixArr = {};
    this.selectorContainedArr = {};
    this.selectorInheritedClassesArr = [];
    this.animationKeyframesArr = {};
    this.importfontsArr = [];
    this.cssfontsArr = [];
    this.usedFontArr = [];
    this.usedFontObjectArr = [];
    this.svgFilterReferences = [];
    this.allClassnamesArr = [];
    this.elementMeta = {};
    this.hasAnyHover = true;
    this.hasAnyChecked = true;
    this.hoverAnchorClassTokens = new Set();
    this.hoverAnchorTags = new Set();
    this.hoverHasNonClassSelector = true;
    this.noPseudoSelectors = {};
    this.existingQueryRanges = {};
    this.siteUrl = '';
  }
}

// Constants from snipbackground.js

export const INHERITED_RULES = [
  'azimuth', 'border-collapse', 'border-spacing', 'caption-side', 'color',
  'cursor', 'direction', 'elevation', 'empty-cells', 'font-family',
  'font-size', 'font-style', 'font-variant', 'font-weight', 'font',
  'letter-spacing', 'line-height', 'list-style-image', 'list-style-position',
  'list-style-type', 'list-style', 'orphans', 'pitch-range', 'pitch quotes',
  'richness', 'speak-header', 'speak-numeral', 'speak-punctuation', 'speak',
  'speech-rate', 'stress', 'text-align', 'text-indent', 'text-transform',
  'visibility', 'voice-family', 'volume', 'white-space', 'widows',
  'word-spacing', 'background-image', 'background', 'background-color'
];

export const VENDOR_PREFIXES = ['-webkit-', '-moz-', '-ms-', '-o-'];

export const ICON_SELECTOR_PATTERNS = [
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

export const ICON_FONT_FAMILY_NAMES = [
  'font awesome', 'fontawesome', 'tabler', 'bootstrap-icons',
  'material icons', 'glyphicons', 'icomoon', 'icofont',
  'remixicon', 'boxicons', 'line awesome'
];

export const DEFAULT_VIEWPORTS: Record<string, ViewportConfig> = {
  default: { name: 'default', width: 1366, height: 768 },
  iphonexs: { name: 'iphonexs', width: 375, height: 812, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  ipad: { name: 'ipad', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  ipadlandscape: { name: 'ipadlandscape', width: 1024, height: 768, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
  pixel2: { name: 'pixel2', width: 411, height: 731, deviceScaleFactor: 2.625, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
  largedesktop: { name: 'largedesktop', width: 1920, height: 1080 },
};
