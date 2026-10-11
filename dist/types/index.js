// CDP response types
// Extraction context - replaces all global state from snipbackground.js
export class ExtractionContext {
    snippedArr = [];
    stylesheetArr = [];
    customfontsArr = [];
    cssvarUsedArr = [];
    cssvarDefinedArr = {};
    cssvarAllArr = {};
    cssvarResolvedValues = {};
    matchingFinalRules = {};
    selectorSpecifityScore = {};
    selectorFixArr = {};
    selectorPartialFixArr = {};
    selectorContainedArr = {};
    selectorInheritedClassesArr = [];
    animationKeyframesArr = {};
    importfontsArr = [];
    cssfontsArr = [];
    usedFontArr = [];
    usedFontObjectArr = [];
    svgFilterReferences = [];
    allClassnamesArr = [];
    elementMeta = {};
    hasAnyHover = true;
    hasAnyChecked = true;
    hoverAnchorClassTokens = new Set();
    hoverAnchorTags = new Set();
    hoverHasNonClassSelector = true;
    noPseudoSelectors = {};
    existingQueryRanges = {};
    siteUrl = '';
    logger;
    reset() {
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
export const DEFAULT_VIEWPORTS = {
    default: { name: 'default', width: 1366, height: 768 },
    iphonexs: { name: 'iphonexs', width: 375, height: 812, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
    ipad: { name: 'ipad', width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
    ipadlandscape: { name: 'ipadlandscape', width: 1024, height: 768, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' },
    pixel2: { name: 'pixel2', width: 411, height: 731, deviceScaleFactor: 2.625, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36' },
    largedesktop: { name: 'largedesktop', width: 1920, height: 1080 },
};
//# sourceMappingURL=index.js.map