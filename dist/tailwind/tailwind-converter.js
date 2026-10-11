/**
 * Tailwind conversion orchestrator.
 * Port of tailwind_main.js (1,681 lines)
 *
 * Main entry points:
 *   - getTailwindHtml()       converts labelled HTML + CSS into Tailwind-classed HTML
 *   - getTailwindBodyClasses() extracts body-level Tailwind classes from snipped rules
 */
import * as cheerio from 'cheerio';
import { cssToTailwind, getTransformClasses, getFilterClasses, getFontClasses, getBestTailwindClasses, } from './css-to-tailwind.js';
import { getPropertyType, expandShorthandProperty, } from './shorthand-expander.js';
import { mergeRanges, getMediaPrefix, parseMediaQueryToTailwind, resolveCssVariableValue, getPseudos, parseStyleAttribute, } from './tailwind-helpers.js';
import { reduceTailwindClasses, updatePropSpecifityWithMergedProperties, } from './tailwind-reducer.js';
// ============================================================
// Cheerio options (matches the original extension's CHEERIO_OPTIONS)
// ============================================================
/**
 * Cheerio load options.
 * The original extension used htmlparser2-specific keys (decodeEntities,
 * normalizeWhitespace, recognizeSelfClosing, _useHtmlParser2).
 * In cheerio 1.x these are passed through the `xml` key.
 */
const CHEERIO_OPTIONS = {
    xml: {
        xmlMode: false,
        decodeEntities: false,
        normalizeWhitespace: false,
        recognizeSelfClosing: true,
    },
};
// ============================================================
// Icon Font Class Preservation for Tailwind Conversion
// ============================================================
/** Known icon font class name patterns (fast regex check) */
const ICON_CLASS_PATTERNS = [
    /^fa[srldb]?$/, // Font Awesome base classes (fa, fas, far, fal, fad, fab)
    /^fa-/, // Font Awesome icons (fa-chevron-right, etc.)
    /^ti$/, // Tabler Icons base
    /^ti-/, // Tabler Icons
    /^bi$/, // Bootstrap Icons base
    /^bi-/, // Bootstrap Icons
    /^material-icons/, // Material Icons
    /^glyphicon/, // Glyphicons
    /^icon-/, // Generic icon prefix
    /^icofont-/, // IcoFont
    /^ri-/, // Remix Icons
    /^bx-?/, // BoxIcons
    /^la-?/, // Line Awesome
];
/** Known icon font-family names (for CSS-based detection fallback) */
const ICON_FONT_FAMILIES = [
    'font awesome',
    'fontawesome',
    'tabler',
    'bootstrap-icons',
    'material icons',
    'glyphicons',
    'icomoon',
    'icofont',
    'remixicon',
    'boxicons',
    'line awesome',
];
// ============================================================
// Tailwind spacing scale for arbitrary-value replacement
// ============================================================
const TAILWIND_SPACING_SCALE = {
    0: '0',
    2: '0.5',
    4: '1',
    6: '1.5',
    8: '2',
    10: '2.5',
    12: '3',
    14: '3.5',
    16: '4',
    20: '5',
    24: '6',
    28: '7',
    32: '8',
    36: '9',
    40: '10',
    44: '11',
    48: '12',
    56: '14',
    64: '16',
    80: '20',
    96: '24',
    112: '28',
    128: '32',
    144: '36',
    160: '40',
    176: '44',
    192: '48',
    208: '52',
    224: '56',
    240: '60',
    256: '64',
    288: '72',
    320: '80',
    384: '96',
};
const SPACING_PIXEL_VALUES = Object.keys(TAILWIND_SPACING_SCALE).map(Number);
// ============================================================
// Utility helpers
// ============================================================
/** Check if a class name matches known icon font patterns */
function isIconClassByName(className) {
    return ICON_CLASS_PATTERNS.some(pattern => pattern.test(className));
}
/** Check if any CSS rule for this class sets an icon font-family */
function isIconClassByCSS(className, tSnippedArr) {
    if (!tSnippedArr)
        return false;
    for (const rule of tSnippedArr) {
        if (!rule.selector || !rule.selector.includes('.' + className))
            continue;
        if (!rule.body)
            continue;
        const fontMatch = rule.body.match(/font-family\s*:\s*([^;]+)/i);
        if (fontMatch) {
            const fontValue = fontMatch[1].toLowerCase();
            if (ICON_FONT_FAMILIES.some(font => fontValue.includes(font))) {
                return true;
            }
        }
    }
    return false;
}
/** Get all icon classes from an element's class attribute */
function getIconClasses(classAttr, tSnippedArr) {
    if (!classAttr)
        return [];
    const classes = classAttr.split(/\s+/).filter(c => c.trim());
    return classes.filter(cls => !cls.startsWith('snipkiwi') &&
        (isIconClassByName(cls) || isIconClassByCSS(cls, tSnippedArr)));
}
/**
 * Split a string by commas, respecting balanced parentheses.
 * Port of splitNoParen() from snipbackground.js.
 */
function splitNoParen(s) {
    const results = [];
    let str = '';
    let left = 0;
    let right = 0;
    for (let i = 0; i < s.length; i++) {
        switch (s[i]) {
            case ',':
                if (left === right) {
                    results.push(str);
                    str = '';
                    left = right = 0;
                }
                else {
                    str += s[i];
                }
                break;
            case '(':
                left++;
                str += s[i];
                break;
            case ')':
                right++;
                str += s[i];
                break;
            default:
                str += s[i];
        }
    }
    results.push(str);
    return results;
}
/**
 * Get override classes for special shorthand properties
 * (margin, padding, transform, filter, backdrop-filter, font).
 */
function getOverrideClasses(oProp, oVal) {
    let overrideClasses = null;
    const hasImportant = oVal.includes('!important');
    const cleanValue = oVal.replace(/\s*!important\s*/g, '').trim();
    if (oProp === 'margin' || oProp === 'padding') {
        const expanded = expandShorthandProperty(oProp, cleanValue);
        if (expanded) {
            const iOverwritten = expanded['overwritten_properties'];
            overrideClasses = getBestTailwindClasses(oProp, iOverwritten);
        }
    }
    else if (oProp === 'transform') {
        overrideClasses = getTransformClasses(cleanValue);
    }
    else if (oProp === 'filter') {
        overrideClasses = getFilterClasses(cleanValue);
    }
    else if (oProp === 'backdrop-filter') {
        overrideClasses = getFilterClasses(cleanValue, true);
    }
    else if (oProp === 'font') {
        overrideClasses = getFontClasses(cleanValue);
    }
    // Add '!' prefix to each class if !important was present
    if (hasImportant && Array.isArray(overrideClasses)) {
        overrideClasses = overrideClasses.map(className => `!${className}`);
    }
    return overrideClasses;
}
/**
 * Gets the ancestry chain of an element for CSS variable resolution.
 * Parses snip class names to build ancestry (snip classes encode hierarchy).
 *
 * Format: snipkiwi{device}-{level}-{parentId}-{currId}
 */
export function getElementAncestryChain(elemClass, allClassnamesArr) {
    const chain = [];
    let current = elemClass;
    while (current) {
        chain.unshift(current); // parent first
        const parts = current.split('-');
        if (parts.length < 4)
            break;
        const device = parts[0]; // e.g. 'snipkiwi0'
        const level = parseInt(parts[1], 10);
        const parentId = parseInt(parts[2], 10);
        if (level === 0 || parentId === 0)
            break;
        // Find parent: same device, level-1, currId === our parentId
        const parentClass = allClassnamesArr.find((c) => {
            const pParts = c.split('-');
            if (pParts.length >= 4) {
                return (pParts[0] === device &&
                    parseInt(pParts[1], 10) === level - 1 &&
                    parseInt(pParts[3], 10) === parentId);
            }
            return false;
        });
        current = parentClass;
    }
    return chain;
}
/**
 * Calculate a rough CSS specificity score for a single selector part.
 * This is a simplified fallback; the original uses parsel with a calculateSingle
 * backup.
 */
function calculateSpecificity(selectorPart) {
    let a = 0; // ID selectors
    let b = 0; // class selectors, attribute selectors, pseudo-classes
    let c = 0; // type selectors, pseudo-elements
    // Remove :not() content but count its internals
    const withoutNot = selectorPart.replace(/:not\(([^)]*)\)/g, (_m, inner) => {
        // Count specificity of :not() argument
        const innerScore = calculateSpecificity(inner);
        a += Math.floor(innerScore / 100);
        b += Math.floor((innerScore % 100) / 10);
        c += innerScore % 10;
        return '';
    });
    // IDs
    const ids = withoutNot.match(/#[a-zA-Z_][\w-]*/g);
    if (ids)
        a += ids.length;
    // Classes, attribute selectors, pseudo-classes
    const classes = withoutNot.match(/\.[a-zA-Z_][\w-]*/g);
    if (classes)
        b += classes.length;
    const attrs = withoutNot.match(/\[[^\]]+\]/g);
    if (attrs)
        b += attrs.length;
    // Pseudo-classes (single colon, not pseudo-elements with double colon)
    const pseudoClasses = withoutNot.match(/(?<!:):[a-zA-Z][\w-]*/g);
    if (pseudoClasses)
        b += pseudoClasses.length;
    // Pseudo-elements (double colon)
    const pseudoElements = withoutNot.match(/::[a-zA-Z][\w-]*/g);
    if (pseudoElements)
        c += pseudoElements.length;
    // Type selectors (element names) - simplified
    const typeSelectors = withoutNot.replace(/#[a-zA-Z_][\w-]*/g, '')
        .replace(/\.[a-zA-Z_][\w-]*/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/::?[a-zA-Z][\w-]*/g, '')
        .replace(/[>+~*\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(t => t && /^[a-zA-Z]/.test(t));
    c += typeSelectors.length;
    return a * 100 + b * 10 + c;
}
/**
 * Parse a var() function call with proper parenthesis matching.
 * (Local copy used by resolveAllVariables)
 */
function parseVarFunction(str, startIndex) {
    if (!str.substring(startIndex).startsWith('var('))
        return null;
    let i = startIndex + 4;
    let parenCount = 1;
    let varName = '';
    let defaultValue = null;
    let inVarName = true;
    let buffer = '';
    while (i < str.length && parenCount > 0) {
        const char = str[i];
        if (char === '(') {
            parenCount++;
            buffer += char;
        }
        else if (char === ')') {
            parenCount--;
            if (parenCount > 0)
                buffer += char;
        }
        else if (char === ',' && parenCount === 1 && inVarName) {
            varName = buffer.trim();
            buffer = '';
            inVarName = false;
        }
        else {
            buffer += char;
        }
        i++;
    }
    if (parenCount === 0) {
        if (inVarName)
            varName = buffer.trim();
        else
            defaultValue = buffer.trim();
        if (!varName.startsWith('--'))
            return null;
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
 * Resolves all CSS var() references in a value string, using context variables.
 */
function resolveAllVariables(value, elementLabels, cssvarDefinedArr, maxDepth = 10, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return value;
    }
    let resolvedValue = value;
    const cssVarMap = {};
    let i = 0;
    const replacements = [];
    while (i < resolvedValue.length) {
        const varIndex = resolvedValue.indexOf('var(', i);
        if (varIndex === -1)
            break;
        const parsed = parseVarFunction(resolvedValue, varIndex);
        if (!parsed) {
            i = varIndex + 4;
            continue;
        }
        const { varName, defaultValue, endIndex } = parsed;
        const resolvedRanges = resolveCssVariableValue(varName, elementLabels, cssvarDefinedArr, cssVarMap);
        let concreteValue;
        if (resolvedRanges && resolvedRanges.length > 0) {
            concreteValue = resolvedRanges[0].concrete_value;
        }
        else if (defaultValue !== null) {
            concreteValue = defaultValue;
            if (concreteValue.includes('var(')) {
                concreteValue = resolveAllVariables(concreteValue, elementLabels, cssvarDefinedArr, maxDepth, currentDepth + 1);
            }
        }
        else {
            // Can't resolve this variable — preserve the original var() reference
            // instead of producing empty values (e.g., rgba(,_1) from unresolved Bootstrap vars)
            concreteValue = `var(${varName})`;
        }
        // Legacy linear-gradient spacing hack
        if (value.indexOf('linear-gradient') >= 0 && concreteValue) {
            concreteValue = concreteValue + ' ';
        }
        replacements.push({ start: varIndex, end: endIndex, replacement: concreteValue });
        i = endIndex;
    }
    // Apply replacements in reverse order to keep indices valid
    for (let j = replacements.length - 1; j >= 0; j--) {
        const { start, end, replacement } = replacements[j];
        resolvedValue = resolvedValue.substring(0, start) + replacement + resolvedValue.substring(end);
    }
    // Recursively resolve any newly introduced var() references
    if (resolvedValue.includes('var(') && currentDepth < maxDepth - 1) {
        resolvedValue = resolveAllVariables(resolvedValue, elementLabels, cssvarDefinedArr, maxDepth, currentDepth + 1);
    }
    return resolvedValue;
}
// ============================================================
// Arbitrary-value post-processing
// ============================================================
/** Convert an arbitrary CSS value to a pixel amount (or null if not convertible). */
function getArbitraryPxValue(value) {
    const v = value.trim().toLowerCase();
    const numValue = parseFloat(v);
    if (isNaN(numValue))
        return null;
    if (v.endsWith('rem'))
        return numValue * 16;
    if (v.endsWith('px'))
        return numValue;
    if (v.endsWith('em'))
        return numValue * 16;
    if (v.endsWith('%') || v.endsWith('vh') || v.endsWith('vw'))
        return null;
    return numValue; // assume px
}
/** Find the closest Tailwind spacing token for a pixel value (within 0.5px). */
function getClosestTailwindSpacingClass(pxValue) {
    let closestValue = null;
    let smallestDifference = Infinity;
    for (const val of SPACING_PIXEL_VALUES) {
        const diff = Math.abs(pxValue - val);
        if (diff < smallestDifference) {
            smallestDifference = diff;
            closestValue = val;
        }
    }
    if (closestValue !== null && smallestDifference <= 0.5) {
        return TAILWIND_SPACING_SCALE[closestValue];
    }
    return null;
}
/** Replace arbitrary-value Tailwind classes (e.g. `px-[2rem]`) with standard tokens. */
function replaceArbitraryValueWithTailwindClass(tailClass) {
    const classParts = tailClass.split(':');
    const baseClass = classParts.pop();
    const prefixesToCheck = [
        'm-', 'mt-', 'mb-', 'ml-', 'mr-', 'mx-', 'my-', 'ms-', 'me-',
        'p-', 'pt-', 'pb-', 'pl-', 'pr-', 'px-', 'py-', 'ps-', 'pe-',
        'space-x-', 'space-y-',
        'gap-', 'gap-x-', 'gap-y-',
        'inset-', 'top-', 'right-', 'bottom-', 'left-', 'start-', 'end-',
        'w-', 'h-',
    ];
    const arbitraryValueRegex = new RegExp(`^(${prefixesToCheck.join('|').replace(/-/g, '\\-')})\\[(.+)\\]$`);
    const match = baseClass.match(arbitraryValueRegex);
    if (match) {
        const fullPrefix = match[1];
        const value = match[2];
        const pxValue = getArbitraryPxValue(value);
        if (pxValue !== null) {
            const closestTailwindClass = getClosestTailwindSpacingClass(pxValue);
            if (closestTailwindClass) {
                const newBaseClass = fullPrefix + closestTailwindClass;
                return [...classParts, newBaseClass].join(':');
            }
        }
    }
    return tailClass;
}
// ============================================================
// Selectors to skip during conversion
// ============================================================
const SKIP_SELECTORS = [
    '*', 'body', 'html', ':root',
    '*,:before,:after', ':backdrop', ':-webkit-scrollbar',
    ':before', ':after', ':selection', '::selection',
    ':after,:before', ':-webkit-scrollbar', ':-webkit-scrollbar-thumb',
    ':-webkit-scrollbar-track', ':-webkit-scrollbar:hover', ':-webkit-scrollbar-track:hover',
    '::-webkit-scrollbar-thumb:hover', ':-webkit-scrollbar-thumb:hover',
    '::placeholder', '::marker', '::spelling-error', '::grammar-error',
    '::-webkit-file-upload-button', '::-webkit-inner-spin-button',
    '::-webkit-outer-spin-button', '::-webkit-resizer',
    '::-webkit-calendar-picker-indicator', '::-webkit-details-marker',
    '::-webkit-scrollbar-corner', '::cue', ':-webkit-autofill', ':-webkit-full-screen',
];
// ============================================================
// Helper: process pseudo-elements for a property (shared logic)
// ============================================================
/**
 * Builds propKey and pseudoPrefix from allPseudo, then merges
 * tailwind ranges into propSpecifityWithMediaVals.
 *
 * This is a helper that encapsulates the repeated pseudo-handling
 * pattern used for both shorthand expanded properties and regular
 * properties.
 */
function processPseudoRanges(allPseudo, basePropKey, currMediaRanges, modifiedScore, ruleIndex, tailClassFn, overrideClassesFn, propSpecifityWithMediaVals) {
    const hasBefore = allPseudo.includes('before');
    const hasAfter = allPseudo.includes('after');
    const pseudoElementsToProcess = [];
    const otherPseudos = [];
    for (const p of allPseudo) {
        if (p === 'before' || p === 'after') {
            pseudoElementsToProcess.push(p);
        }
        else {
            otherPseudos.push(p);
        }
    }
    if (hasBefore && hasAfter) {
        // Process each pseudo-element separately
        for (const pseudoEl of pseudoElementsToProcess) {
            let propKey = basePropKey;
            let pseudoPrefix = '';
            for (const op of otherPseudos) {
                propKey = op + ':' + propKey;
                pseudoPrefix += op + ':';
            }
            propKey = pseudoEl + ':' + propKey;
            pseudoPrefix += pseudoEl + ':';
            if (!(propKey in propSpecifityWithMediaVals)) {
                propSpecifityWithMediaVals[propKey] = [];
            }
            for (let c = 0; c < currMediaRanges.length; c++) {
                const currMediaRange = JSON.parse(JSON.stringify(currMediaRanges[c]));
                currMediaRange['prop'] = propKey;
                currMediaRange['score'] = modifiedScore;
                currMediaRange['ruleIndex'] = ruleIndex;
                if (overrideClassesFn === null) {
                    const tailClass = tailClassFn(pseudoPrefix);
                    if (!tailClass)
                        continue;
                    currMediaRange['tailwind_classes'] = [tailClass];
                }
                else {
                    currMediaRange['tailwind_classes'] = [];
                    const oc = overrideClassesFn(pseudoPrefix);
                    for (const tc of oc) {
                        currMediaRange['tailwind_classes'].push(tc);
                    }
                }
                propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
            }
        }
    }
    else {
        // Original chaining behavior
        let propKey = basePropKey;
        let pseudoPrefix = '';
        for (const pe of allPseudo) {
            propKey = pe + ':' + propKey;
            pseudoPrefix += pe + ':';
        }
        if (!(propKey in propSpecifityWithMediaVals)) {
            propSpecifityWithMediaVals[propKey] = [];
        }
        for (let c = 0; c < currMediaRanges.length; c++) {
            const currMediaRange = currMediaRanges[c];
            currMediaRange['prop'] = propKey;
            currMediaRange['score'] = modifiedScore;
            currMediaRange['ruleIndex'] = ruleIndex;
            if (overrideClassesFn === null) {
                const tailClass = tailClassFn(pseudoPrefix);
                if (!tailClass)
                    continue;
                currMediaRange['tailwind_classes'] = [
                    ...(currMediaRange['tailwind_classes'] || []),
                    tailClass,
                ];
            }
            else {
                const oc = overrideClassesFn(pseudoPrefix);
                for (const tc of oc) {
                    currMediaRange['tailwind_classes'] = [
                        ...(currMediaRange['tailwind_classes'] || []),
                        tc,
                    ];
                }
            }
            propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
        }
    }
}
// ============================================================
// Main exports
// ============================================================
/**
 * Convert labelled HTML and CSS into Tailwind-classed HTML.
 *
 * For every element identified by a snipkiwi class, the function:
 *   1. Processes inline style attributes
 *   2. Iterates over matching CSS rules (from ctx.matchingFinalRules)
 *   3. Expands shorthands and resolves variables
 *   4. Converts each property to Tailwind classes
 *   5. Handles pseudo-classes/elements and media queries
 *   6. Merges, reduces and applies the resulting classes via cheerio
 */
export function getTailwindHtml(labelHtml, allCss, tSnippedArr, forceBreakpoints, resolveVariables, ctx) {
    const $editHtml = cheerio.load(labelHtml, CHEERIO_OPTIONS, false);
    for (let x = 0; x < ctx.allClassnamesArr.length; x++) {
        try {
            const currClass = ctx.allClassnamesArr[x];
            const theElem = $editHtml.root().find('.' + currClass).get(0);
            if (!theElem)
                continue;
            // Build ancestry chain for CSS variable resolution
            const ancestryChain = getElementAncestryChain(currClass, ctx.allClassnamesArr);
            const propSpecifityWithMediaVals = {};
            // -----------------------------------------------------------
            // 1) Process style attribute declarations
            // -----------------------------------------------------------
            let theStyleAttr = $editHtml(theElem).attr('style');
            if (theStyleAttr) {
                // Decode HTML entities in style values (Cheerio encodes " as &quot; in inline styles)
                theStyleAttr = theStyleAttr
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'");
                const declarations = parseStyleAttribute(theStyleAttr);
                // First pass: register CSS variable definitions from inline styles
                declarations.forEach(({ property: inProp, value: inVal }) => {
                    if (resolveVariables && inProp.startsWith('--')) {
                        const mediaSelector = '';
                        const selText = '.' + currClass;
                        if (!ctx.cssvarDefinedArr.hasOwnProperty(inProp)) {
                            ctx.cssvarDefinedArr[inProp] = [];
                        }
                        const newKey = mediaSelector + selText + inProp;
                        const exists = ctx.cssvarDefinedArr[inProp].some(item => item.key === newKey);
                        if (!exists) {
                            ctx.cssvarDefinedArr[inProp].push({
                                key: newKey,
                                label: currClass,
                                value: inVal,
                                media: mediaSelector,
                                selector: selText,
                                source: 'inline',
                            });
                        }
                    }
                });
                // Second pass: convert style attribute properties to Tailwind
                declarations.forEach(({ property: inProp, value: inVal }) => {
                    if (resolveVariables && inProp.startsWith('--'))
                        return;
                    const shortlongType = getPropertyType(inProp);
                    if (shortlongType.type === 'short') {
                        const expanded = expandShorthandProperty(inProp, inVal);
                        if (!expanded)
                            return;
                        const pOverwritten = expanded['overwritten_properties'];
                        for (const longProp in pOverwritten) {
                            const longVal = pOverwritten[longProp];
                            const tailClass = cssToTailwind(longProp, longVal);
                            if (!tailClass)
                                continue;
                            propSpecifityWithMediaVals[longProp] = [{
                                    media_min: -1,
                                    media_max: 9999,
                                    score: 110,
                                    tailwind_classes: [tailClass],
                                    ruleIndex: 1,
                                    prop: longProp,
                                }];
                        }
                    }
                    else {
                        let val = inVal;
                        if (resolveVariables && val.indexOf('var') >= 0) {
                            val = resolveAllVariables(val, ancestryChain, ctx.cssvarDefinedArr);
                        }
                        const overrideClasses = getOverrideClasses(inProp, val);
                        if (overrideClasses == null) {
                            const tailClass = cssToTailwind(inProp, val);
                            if (!tailClass)
                                return;
                            propSpecifityWithMediaVals[inProp] = [{
                                    media_min: -1,
                                    media_max: 9999,
                                    score: 110,
                                    tailwind_classes: [tailClass],
                                    ruleIndex: 1,
                                    prop: inProp,
                                }];
                        }
                        else {
                            if (!(inProp in propSpecifityWithMediaVals)) {
                                propSpecifityWithMediaVals[inProp] = [];
                            }
                            const currMediaRange = {
                                media_min: -1,
                                media_max: 9999,
                                score: 110,
                                tailwind_classes: [],
                                ruleIndex: 1,
                                prop: inProp,
                            };
                            for (const tailClass of overrideClasses) {
                                if (!tailClass)
                                    continue;
                                currMediaRange.tailwind_classes.push(tailClass);
                            }
                            propSpecifityWithMediaVals[inProp] = mergeRanges(propSpecifityWithMediaVals[inProp], currMediaRange);
                        }
                    }
                });
                // Remove the style attribute after processing
                $editHtml(theElem).removeAttr('style');
            }
            // -----------------------------------------------------------
            // 2) Process matching CSS rules
            // -----------------------------------------------------------
            const matchData = ctx.matchingFinalRules[currClass];
            if (!matchData)
                continue;
            const allSelectors = matchData.selectors;
            const allMedia = matchData.media_queries;
            const allMatchingIndices = matchData.indices;
            const allInheritedTypes = matchData.inherited_type;
            const allInvalidPseudos = matchData.invalid_pseudos;
            const allBodies = matchData.bodies;
            const matchingParts = matchData.matching_parts;
            for (let s = 0; s < allSelectors.length; s++) {
                const aSelector = allSelectors[s];
                const aBody = allBodies[s];
                const aMediaTarget = allMedia[s];
                const myMatchingParts = matchingParts[s];
                const ruleIndex = allMatchingIndices[s];
                const inheritedType = allInheritedTypes[s];
                const invalidPseudo = allInvalidPseudos[s];
                // Skip universal/body/html selectors and pseudo-element-only selectors
                const normalizedSel = aSelector.replace(/\s+/g, '').replace(/::/g, ':');
                if (SKIP_SELECTORS.includes(aSelector) || SKIP_SELECTORS.includes(normalizedSel))
                    continue;
                // Also skip selectors that are just * with optional pseudo-elements
                if (/^\*[\s,]/.test(aSelector) || aSelector === '*')
                    continue;
                if (invalidPseudo)
                    continue;
                if (inheritedType === 'other_inherited' || inheritedType === 'inherited')
                    continue;
                // Calculate specificity and collect pseudos for all matching parts
                let highestScore = 0;
                let allPseudo = [];
                const hasPseudoElement = aSelector.indexOf(':before') >= 0 || aSelector.indexOf(':after') >= 0 ||
                    aSelector.indexOf('::before') >= 0 || aSelector.indexOf('::after') >= 0;
                for (let m = 0; m < myMatchingParts.length; m++) {
                    const mPart = myMatchingParts[m];
                    if (mPart.indexOf(':') >= 0) {
                        const pseudoParts = getPseudos(mPart);
                        // Check for sibling pseudo-elements (before/after) in the full selector
                        if (pseudoParts.length > 0) {
                            const baseSelector = mPart.replace(/::?(before|after)/g, '');
                            for (const pseudo of ['before', 'after']) {
                                if (!pseudoParts.includes(pseudo)) {
                                    const sib1 = baseSelector + ':' + pseudo;
                                    const sib2 = baseSelector + '::' + pseudo;
                                    if (aSelector.indexOf(sib1) >= 0 || aSelector.indexOf(sib2) >= 0) {
                                        pseudoParts.push(pseudo);
                                    }
                                }
                            }
                        }
                        allPseudo = allPseudo.concat(pseudoParts);
                    }
                    let myScore;
                    if (mPart in ctx.selectorSpecifityScore) {
                        myScore = ctx.selectorSpecifityScore[mPart];
                    }
                    else {
                        myScore = calculateSpecificity(mPart);
                    }
                    if (myScore > highestScore) {
                        highestScore = myScore;
                    }
                }
                // Match against tSnippedArr to find the rule body
                for (let xi = 0; xi < tSnippedArr.length; xi++) {
                    const mySelector = tSnippedArr[xi].selector;
                    const myBody = tSnippedArr[xi].body;
                    const myMedia = tSnippedArr[xi].media;
                    if (mySelector.trim() !== aSelector.trim() || aMediaTarget.trim() !== myMedia.trim()) {
                        continue;
                    }
                    const bodyUsedProps = {};
                    const theBodySplit = myBody.split(/\r?\n/);
                    for (let bb = 0; bb < theBodySplit.length; bb++) {
                        const line = theBodySplit[bb].trim();
                        if (line === '' || line.startsWith('/*'))
                            continue;
                        if (line.indexOf(':') < 0)
                            continue;
                        const tSplit = line.split(/:(.+)/);
                        if (tSplit.length < 2)
                            continue;
                        const tProp = tSplit[0].trim();
                        if (tProp.startsWith('--'))
                            continue;
                        let modifiedScore = highestScore;
                        if (tProp in bodyUsedProps) {
                            bodyUsedProps[tProp] += 1;
                            modifiedScore += bodyUsedProps[tProp];
                        }
                        else {
                            bodyUsedProps[tProp] = 0;
                        }
                        let tVal = tSplit[1].trim().replace(/;$/, '');
                        tVal = tVal.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                        const shortlongType = getPropertyType(tProp);
                        if (shortlongType.type === 'short') {
                            // ------ Shorthand property ------
                            const expanded = expandShorthandProperty(tProp, tVal);
                            if (!expanded)
                                continue;
                            const pOverwritten = expanded['overwritten_properties'];
                            for (const longProp in pOverwritten) {
                                let currMediaRanges = [];
                                let longVal = pOverwritten[longProp];
                                const individualMediaQueries = splitNoParen(myMedia);
                                individualMediaQueries.forEach(individualMedia => {
                                    const ranges = parseMediaQueryToTailwind(individualMedia, forceBreakpoints);
                                    currMediaRanges = currMediaRanges.concat(ranges);
                                });
                                if (allPseudo.length <= 0) {
                                    // No pseudo-classes
                                    const propKey = longProp;
                                    if (!(propKey in propSpecifityWithMediaVals)) {
                                        propSpecifityWithMediaVals[propKey] = [];
                                    }
                                    for (let c = 0; c < currMediaRanges.length; c++) {
                                        const currMediaRange = currMediaRanges[c];
                                        currMediaRange['prop'] = propKey;
                                        currMediaRange['score'] = modifiedScore;
                                        currMediaRange['ruleIndex'] = ruleIndex;
                                        if (resolveVariables && longVal.indexOf('var') >= 0) {
                                            longVal = resolveAllVariables(longVal, ancestryChain, ctx.cssvarDefinedArr);
                                        }
                                        const tailClass = cssToTailwind(longProp, longVal);
                                        if (!tailClass)
                                            continue;
                                        currMediaRange['tailwind_classes'] = [
                                            ...(currMediaRange['tailwind_classes'] || []),
                                            tailClass,
                                        ];
                                        propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
                                    }
                                }
                                else {
                                    // With pseudo-classes
                                    const resolvedLongVal = (resolveVariables && longVal.indexOf('var') >= 0)
                                        ? resolveAllVariables(longVal, ancestryChain, ctx.cssvarDefinedArr)
                                        : longVal;
                                    processPseudoRanges(allPseudo, longProp, currMediaRanges, modifiedScore, ruleIndex, (prefix) => {
                                        const tc = cssToTailwind(longProp, resolvedLongVal);
                                        return tc ? prefix + tc : null;
                                    }, null, propSpecifityWithMediaVals);
                                }
                            }
                        }
                        else {
                            // ------ Not a shorthand property ------
                            let currMediaRanges = [];
                            const individualMediaQueries = splitNoParen(myMedia);
                            individualMediaQueries.forEach(individualMedia => {
                                const ranges = parseMediaQueryToTailwind(individualMedia, forceBreakpoints);
                                currMediaRanges = currMediaRanges.concat(ranges);
                            });
                            if (resolveVariables && tVal.indexOf('var') >= 0) {
                                tVal = resolveAllVariables(tVal, ancestryChain, ctx.cssvarDefinedArr);
                            }
                            const overrideClasses = getOverrideClasses(tProp, tVal);
                            if (allPseudo.length <= 0) {
                                // No pseudo-classes
                                const propKey = tProp;
                                if (!(propKey in propSpecifityWithMediaVals)) {
                                    propSpecifityWithMediaVals[propKey] = [];
                                }
                                for (let c = 0; c < currMediaRanges.length; c++) {
                                    const currMediaRange = currMediaRanges[c];
                                    currMediaRange['prop'] = propKey;
                                    currMediaRange['score'] = modifiedScore;
                                    currMediaRange['ruleIndex'] = ruleIndex;
                                    if (overrideClasses == null) {
                                        const tailClass = cssToTailwind(tProp, tVal);
                                        if (!tailClass)
                                            continue;
                                        currMediaRange['tailwind_classes'] = [
                                            ...(currMediaRange['tailwind_classes'] || []),
                                            tailClass,
                                        ];
                                    }
                                    else {
                                        for (const tailClass of overrideClasses) {
                                            currMediaRange['tailwind_classes'] = [
                                                ...(currMediaRange['tailwind_classes'] || []),
                                                tailClass,
                                            ];
                                        }
                                    }
                                    propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
                                }
                            }
                            else {
                                // With pseudo-classes
                                processPseudoRanges(allPseudo, tProp, currMediaRanges, modifiedScore, ruleIndex, (prefix) => {
                                    if (overrideClasses == null) {
                                        const tc = cssToTailwind(tProp, tVal);
                                        return tc ? prefix + tc : null;
                                    }
                                    return null; // handled by overrideClassesFn
                                }, overrideClasses != null
                                    ? (prefix) => overrideClasses.map(oc => prefix + oc)
                                    : null, propSpecifityWithMediaVals);
                            }
                        }
                    }
                }
            }
            // -----------------------------------------------------------
            // 3) Preserve icon font classes, then remove existing classes
            // -----------------------------------------------------------
            const iconClasses = getIconClasses($editHtml(theElem).attr('class'), tSnippedArr);
            $editHtml(theElem).removeAttr('class');
            // -----------------------------------------------------------
            // 4) Merge padding/margin shorthand properties
            // -----------------------------------------------------------
            const mergedPropMap = updatePropSpecifityWithMergedProperties(propSpecifityWithMediaVals);
            // -----------------------------------------------------------
            // 5) Apply Tailwind classes to the element
            // -----------------------------------------------------------
            for (const aProp in mergedPropMap) {
                const ranges = mergedPropMap[aProp];
                let hasImportantClass = false;
                let noMediaAtEdge = true;
                let hasMediaMax = false;
                for (const range of ranges) {
                    for (const tailClass of range.tailwind_classes) {
                        if (tailClass.startsWith('!')) {
                            hasImportantClass = true;
                            break;
                        }
                    }
                    if (hasImportantClass)
                        break;
                    if (range.media_min === -1 || range.media_max === 9999) {
                        noMediaAtEdge = false;
                    }
                    if (range.media_max === 9999) {
                        hasMediaMax = true;
                    }
                }
                if (hasImportantClass || noMediaAtEdge || !hasMediaMax) {
                    // Add classes with media prefix directly
                    for (const range of ranges) {
                        let mediaPrefix = '';
                        if (range.media_min > -1 || range.media_max < 9999) {
                            mediaPrefix = getMediaPrefix(range.media_min, range.media_max);
                        }
                        for (const rawTailClass of range.tailwind_classes) {
                            if (!rawTailClass)
                                continue;
                            let tailClass = mediaPrefix ? mediaPrefix + ':' + rawTailClass : rawTailClass;
                            const replaced = replaceArbitraryValueWithTailwindClass(tailClass);
                            if (!replaced)
                                continue;
                            tailClass = replaced;
                            $editHtml(theElem).addClass(tailClass);
                        }
                    }
                }
                else {
                    // Reduce the Tailwind classes for this property
                    const reducedClasses = reduceTailwindClasses(ranges);
                    for (const rawClass of reducedClasses) {
                        const replaced = replaceArbitraryValueWithTailwindClass(rawClass);
                        if (!replaced)
                            continue;
                        $editHtml(theElem).addClass(replaced);
                    }
                }
            }
            // Restore preserved icon font classes
            if (iconClasses && iconClasses.length > 0) {
                iconClasses.forEach(cls => $editHtml(theElem).addClass(cls));
            }
        }
        catch (error) {
            // Log but do not abort the whole conversion
            console.error('Error processing Tailwind element:', error);
        }
    }
    const retHtml = $editHtml.root().html() ?? '';
    return retHtml;
}
// ============================================================
// Body-level Tailwind class extraction
// ============================================================
/**
 * Extract Tailwind utility classes that should be applied to the <body>
 * element (or an equivalent wrapper) based on CSS rules targeting body,
 * html, :root, or * selectors.
 */
export function getTailwindBodyClasses(tSnippedArr, forceBreakpoints, resolveVariables, tailwindUltimateArr, ctx) {
    let propSpecifityWithMediaVals = {};
    const bodyClasses = [];
    // -----------------------------------------------------------
    // 1) Process snipped rules in reverse order (later rules win)
    // -----------------------------------------------------------
    for (let p = tSnippedArr.length - 1; p >= 0; p--) {
        try {
            const tSelector = tSnippedArr[p].selector;
            const tBody = tSnippedArr[p].body;
            const tMedia = tSnippedArr[p].media;
            const tSelIndex = tSnippedArr.length - 1 - p;
            const allSelectors = tSelector.split(',');
            let processProperties = false;
            for (const oneSelector of allSelectors) {
                const trimSelector = oneSelector.trim();
                if (trimSelector === 'body' || trimSelector === '*' || trimSelector === ':root') {
                    processProperties = true;
                }
            }
            if (!processProperties)
                continue;
            const highestScore = 100;
            const bodyUsedProps = {};
            const theBodySplit = tBody.split(/\r?\n/);
            for (let bb = 0; bb < theBodySplit.length; bb++) {
                const line = theBodySplit[bb].trim();
                if (line === '' || line.startsWith('/*'))
                    continue;
                if (line.indexOf(':') < 0)
                    continue;
                const tSplit = line.split(/:(.+)/);
                if (tSplit.length < 2)
                    continue;
                const tProp = tSplit[0].trim();
                if (tProp.startsWith('--'))
                    continue;
                let modifiedScore = highestScore;
                if (tProp in bodyUsedProps) {
                    bodyUsedProps[tProp] += 1;
                    modifiedScore += bodyUsedProps[tProp];
                }
                else {
                    bodyUsedProps[tProp] = 0;
                }
                let tVal = tSplit[1].trim().replace(/;$/, '');
                tVal = tVal.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                const shortlongType = getPropertyType(tProp);
                if (shortlongType.type === 'short') {
                    // Shorthand property
                    const expanded = expandShorthandProperty(tProp, tVal);
                    if (!expanded)
                        continue;
                    const pOverwritten = expanded['overwritten_properties'];
                    for (const longProp in pOverwritten) {
                        let currMediaRanges = [];
                        const longVal = pOverwritten[longProp];
                        const individualMediaQueries = splitNoParen(tMedia);
                        individualMediaQueries.forEach(individualMedia => {
                            const ranges = parseMediaQueryToTailwind(individualMedia, forceBreakpoints);
                            currMediaRanges = currMediaRanges.concat(ranges);
                        });
                        const propKey = longProp;
                        if (!(propKey in propSpecifityWithMediaVals)) {
                            propSpecifityWithMediaVals[propKey] = [];
                        }
                        for (let c = 0; c < currMediaRanges.length; c++) {
                            const currMediaRange = currMediaRanges[c];
                            currMediaRange['prop'] = propKey;
                            currMediaRange['score'] = modifiedScore;
                            currMediaRange['ruleIndex'] = tSelIndex;
                            let currLongVal = longVal;
                            if (resolveVariables && currLongVal.indexOf('var') >= 0) {
                                currLongVal = resolveAllVariables(currLongVal, ['html', 'body'], ctx.cssvarDefinedArr);
                            }
                            const tailClass = cssToTailwind(longProp, currLongVal);
                            if (!tailClass)
                                continue;
                            currMediaRange['tailwind_classes'] = [
                                ...(currMediaRange['tailwind_classes'] || []),
                                tailClass,
                            ];
                            propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
                        }
                    }
                }
                else {
                    // Non-shorthand property
                    let currMediaRanges = [];
                    const individualMediaQueries = splitNoParen(tMedia);
                    individualMediaQueries.forEach(individualMedia => {
                        const ranges = parseMediaQueryToTailwind(individualMedia, forceBreakpoints);
                        currMediaRanges = currMediaRanges.concat(ranges);
                    });
                    if (resolveVariables && tVal.indexOf('var') >= 0) {
                        tVal = resolveAllVariables(tVal, ['html', 'body'], ctx.cssvarDefinedArr);
                    }
                    const overrideClasses = getOverrideClasses(tProp, tVal);
                    const propKey = tProp;
                    if (!(propKey in propSpecifityWithMediaVals)) {
                        propSpecifityWithMediaVals[propKey] = [];
                    }
                    for (let c = 0; c < currMediaRanges.length; c++) {
                        const currMediaRange = currMediaRanges[c];
                        currMediaRange['prop'] = propKey;
                        currMediaRange['score'] = modifiedScore;
                        currMediaRange['ruleIndex'] = tSelIndex;
                        let currTVal = tVal;
                        if (resolveVariables && currTVal.indexOf('var') >= 0) {
                            currTVal = resolveAllVariables(currTVal, ['html', 'body'], ctx.cssvarDefinedArr);
                        }
                        if (overrideClasses == null) {
                            const tailClass = cssToTailwind(tProp, currTVal);
                            if (!tailClass)
                                continue;
                            currMediaRange['tailwind_classes'] = [
                                ...(currMediaRange['tailwind_classes'] || []),
                                tailClass,
                            ];
                        }
                        else {
                            for (const tailClass of overrideClasses) {
                                currMediaRange['tailwind_classes'] = [
                                    ...(currMediaRange['tailwind_classes'] || []),
                                    tailClass,
                                ];
                            }
                        }
                        propSpecifityWithMediaVals[propKey] = mergeRanges(propSpecifityWithMediaVals[propKey], currMediaRange);
                    }
                }
            }
        }
        catch (ex) {
            console.error('Error processing body classes:', ex);
        }
    }
    // -----------------------------------------------------------
    // 2) Process the "ultimate" rules (higher-precedence body rules)
    // -----------------------------------------------------------
    const ALLOWED_INHERITED_PROPS = [
        'background-color',
        'background',
        'font-size',
        'font',
        'font-family',
        'color',
    ];
    const ultimateSpecificity = 200;
    const ultimateRuleIndex = 9999;
    for (let i = 0; i < tailwindUltimateArr.length; i++) {
        const rule = tailwindUltimateArr[i];
        const theSelector = rule.selector.trim();
        const theBodyLines = rule.body.split(/\r?\n/);
        const theMedia = rule.media || '';
        if (theSelector !== 'body')
            continue;
        for (let line of theBodyLines) {
            line = line.trim();
            if (!line || line.startsWith('/*'))
                continue;
            if (line.indexOf(':') < 0)
                continue;
            const splitResult = line.split(/:(.+)/);
            if (!splitResult[1])
                continue;
            const prop = splitResult[0].trim();
            const val = splitResult[1].trim().replace(/;$/, '');
            if (!ALLOWED_INHERITED_PROPS.includes(prop))
                continue;
            let resolvedVal = val;
            if (resolveVariables && resolvedVal.indexOf('var') >= 0) {
                resolvedVal = resolveAllVariables(resolvedVal, ['body'], ctx.cssvarDefinedArr);
            }
            // Try shorthand override
            const oc = getOverrideClasses(prop, resolvedVal);
            let tailClasses = [];
            if (!oc) {
                const twClass = cssToTailwind(prop, resolvedVal);
                if (twClass)
                    tailClasses.push(twClass);
            }
            else {
                tailClasses = oc;
            }
            if (tailClasses.length === 0)
                continue;
            // Parse media
            let mediaRanges = parseMediaQueryToTailwind(theMedia, forceBreakpoints);
            if (mediaRanges.length === 0) {
                mediaRanges = [{ media_min: -1, media_max: 9999, tailwind_classes: [] }];
            }
            if (!propSpecifityWithMediaVals[prop]) {
                propSpecifityWithMediaVals[prop] = [];
            }
            mediaRanges.forEach(mr => {
                const newObj = {
                    media_min: mr.media_min,
                    media_max: mr.media_max,
                    tailwind_classes: [...tailClasses],
                    score: ultimateSpecificity,
                    ruleIndex: ultimateRuleIndex,
                    prop,
                };
                propSpecifityWithMediaVals[prop] = mergeRanges(propSpecifityWithMediaVals[prop], newObj);
            });
        }
    }
    // -----------------------------------------------------------
    // 3) Merge padding/margin properties and emit final classes
    // -----------------------------------------------------------
    propSpecifityWithMediaVals = updatePropSpecifityWithMergedProperties(propSpecifityWithMediaVals);
    for (const aProp in propSpecifityWithMediaVals) {
        const ranges = propSpecifityWithMediaVals[aProp];
        for (const range of ranges) {
            let mediaPrefix = '';
            if (range.media_min > -1 || range.media_max < 9999) {
                mediaPrefix = getMediaPrefix(range.media_min, range.media_max);
            }
            for (let tailClass of range.tailwind_classes) {
                if (mediaPrefix) {
                    tailClass = mediaPrefix + ':' + tailClass;
                }
                if (!bodyClasses.includes(tailClass)) {
                    bodyClasses.push(tailClass);
                }
            }
        }
    }
    return bodyClasses.join(' ');
}
//# sourceMappingURL=tailwind-converter.js.map