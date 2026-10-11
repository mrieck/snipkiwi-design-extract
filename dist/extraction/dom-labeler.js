import { randomLetters } from '../utils/helpers.js';
/**
 * Labels DOM elements with unique snipkiwi marker classes.
 * Replaces the content script's snipkiwiLabelSubelements function.
 * Runs entirely via page.evaluate() - no content script needed.
 */
export class DomLabeler {
    /**
     * Label the target element and all its descendants with unique snipkiwi classes.
     * Returns the list of classnames and the HTML.
     *
     * Port of snipkiwiLabelSubelements from sniptools.js
     */
    async labelElements(page, selector) {
        const snipId = randomLetters(4);
        const result = await page.evaluate(({ selector, snipId }) => {
            const root = document.querySelector(selector);
            if (!root) {
                return {
                    error: `Element not found: ${selector}`,
                    allClassnamesArr: [],
                    allElementOuterHtml: '',
                    allLabelOuterHtml: '',
                    rootSelector: selector,
                    rootClassname: '',
                    elementMeta: {},
                };
            }
            const allClassnamesArr = [];
            // snipkiwi classname -> per-element metadata (tag/classTokens/inputType/parents)
            const elementMeta = {};
            let idCounter = 0;
            // ancestors: this element's ancestor snipkiwi classnames within the labeled
            // subtree, closest-first — mirrors PseudoStateHandler.getParentClassnames.
            function labelElement(elem, parentId, level, ancestors) {
                if (elem.nodeType !== 1)
                    return; // Element nodes only
                const tagName = elem.tagName.toLowerCase();
                // Skip script/style/noscript
                if (['script', 'style', 'noscript', 'link', 'meta'].includes(tagName))
                    return;
                const currId = idCounter++;
                const className = `snipkiwi${snipId}-${level}-${parentId}-${currId}`;
                // Capture original author classes BEFORE injecting the snipkiwi marker.
                const classTokens = Array.from(elem.classList).filter((c) => !c.startsWith('snipkiwi'));
                elem.classList.add(className);
                allClassnamesArr.push(className);
                elementMeta[className] = {
                    tag: elem.tagName, // uppercase, matches Element.tagName / getTagName()
                    classTokens,
                    inputType: elem.tagName === 'INPUT' ? (elem.type || '') : '',
                    parentClassnames: ancestors,
                };
                // Label children recursively, threading this element onto their ancestor chain
                const childAncestors = [className, ...ancestors];
                const children = elem.children;
                for (let i = 0; i < children.length; i++) {
                    labelElement(children[i], currId, level + 1, childAncestors);
                }
            }
            // Label root and all descendants
            labelElement(root, 0, 0, []);
            const rootClassname = allClassnamesArr[0] || '';
            // Capture HTML after labeling
            const allElementOuterHtml = root.outerHTML;
            // Also capture a version with just the labels for Tailwind
            const allLabelOuterHtml = root.outerHTML;
            return {
                allClassnamesArr,
                allElementOuterHtml,
                allLabelOuterHtml,
                rootSelector: selector,
                rootClassname,
                elementMeta,
            };
        }, { selector, snipId });
        if ('error' in result && result.error) {
            throw new Error(result.error);
        }
        return result;
    }
    /**
     * Remove all snipkiwi marker classes from the page DOM.
     * Called after extraction is complete.
     */
    async removeLabels(page) {
        await page.evaluate(() => {
            const elements = document.querySelectorAll('[class*="snipkiwi"]');
            elements.forEach((elem) => {
                const classes = [...elem.classList];
                classes.forEach((cls) => {
                    if (cls.startsWith('snipkiwi')) {
                        elem.classList.remove(cls);
                    }
                });
                // Clean up empty class attributes
                if (elem.classList.length === 0) {
                    elem.removeAttribute('class');
                }
            });
        });
    }
    /**
     * Get the outerHTML of an element after labels have been removed.
     */
    async getCleanHtml(page, selector) {
        return await page.evaluate((sel) => {
            const elem = document.querySelector(sel);
            if (!elem)
                return '';
            // Clone and remove snipkiwi classes
            const clone = elem.cloneNode(true);
            const labeled = clone.querySelectorAll('[class*="snipkiwi"]');
            labeled.forEach((el) => {
                const classes = [...el.classList];
                classes.forEach((cls) => {
                    if (cls.startsWith('snipkiwi')) {
                        el.classList.remove(cls);
                    }
                });
                if (el.classList.length === 0) {
                    el.removeAttribute('class');
                }
            });
            // Also clean the root
            const rootClasses = [...clone.classList];
            rootClasses.forEach((cls) => {
                if (cls.startsWith('snipkiwi')) {
                    clone.classList.remove(cls);
                }
            });
            if (clone.classList.length === 0) {
                clone.removeAttribute('class');
            }
            return clone.outerHTML;
        }, selector);
    }
}
//# sourceMappingURL=dom-labeler.js.map