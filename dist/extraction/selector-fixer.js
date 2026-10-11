/**
 * Validates and fixes CSS selectors to be scoped to the extracted element.
 * Runs in page context via page.evaluate() since it needs live DOM access.
 *
 * Port of snipkiwiFixSelector from sniptools.js
 */
export class SelectorFixer {
    /**
     * Fix a batch of selectors at once (reduces round-trips to the browser).
     * Each selector is tested against the DOM to verify it matches within
     * the extraction root.
     */
    async fixSelectors(page, selectors, rootClassname, allClassnames) {
        return await page.evaluate(({ selectors, rootClassname, allClassnames }) => {
            const results = {};
            const rootElem = document.querySelector('.' + rootClassname);
            if (!rootElem)
                return results;
            for (const selector of selectors) {
                try {
                    // Check if selector targets elements inside the root
                    const matchingElements = document.querySelectorAll(selector);
                    let insideRoot = false;
                    for (const elem of matchingElements) {
                        if (rootElem.contains(elem) || rootElem === elem) {
                            insideRoot = true;
                            break;
                        }
                    }
                    if (insideRoot) {
                        results[selector] = selector;
                    }
                    else {
                        // The selector doesn't match anything in our root -
                        // try to see if it matches something via descendant relation
                        const parts = selector.split(/\s+/);
                        if (parts.length > 1) {
                            // Take the last part as a local selector
                            const localPart = parts[parts.length - 1];
                            try {
                                const localMatches = rootElem.querySelectorAll(localPart);
                                if (localMatches.length > 0) {
                                    results[selector] = localPart;
                                }
                                else {
                                    results[selector] = selector;
                                }
                            }
                            catch {
                                results[selector] = selector;
                            }
                        }
                        else {
                            results[selector] = selector;
                        }
                    }
                }
                catch {
                    // Invalid selector - keep as-is
                    results[selector] = selector;
                }
            }
            return results;
        }, { selectors, rootClassname, allClassnames });
    }
    /**
     * Check if a selector matches any element within the extraction root.
     */
    async selectorMatchesInRoot(page, selector, rootClassname) {
        return await page.evaluate(({ selector, rootClassname }) => {
            try {
                const rootElem = document.querySelector('.' + rootClassname);
                if (!rootElem)
                    return false;
                const matchingElements = document.querySelectorAll(selector);
                for (const elem of matchingElements) {
                    if (rootElem.contains(elem) || rootElem === elem) {
                        return true;
                    }
                }
                return false;
            }
            catch {
                return false;
            }
        }, { selector, rootClassname });
    }
    /**
     * Get the element distance (depth) for inherited rule processing.
     * Returns negative if the selector targets elements outside the root.
     */
    async getElementDistance(page, selectorClass, rootClassname) {
        return await page.evaluate(({ selectorClass, rootClassname }) => {
            const targetElem = document.querySelector('.' + selectorClass);
            const rootElem = document.querySelector('.' + rootClassname);
            if (!targetElem || !rootElem)
                return -1;
            // Count depth from root to target
            let depth = 0;
            let current = targetElem;
            while (current && current !== rootElem) {
                depth++;
                current = current.parentElement;
            }
            if (current === rootElem)
                return depth;
            return -1; // Not a descendant
        }, { selectorClass, rootClassname });
    }
}
//# sourceMappingURL=selector-fixer.js.map