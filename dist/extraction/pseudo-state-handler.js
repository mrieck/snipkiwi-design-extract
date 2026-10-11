/**
 * Handles forcing pseudo-states (:hover, :active, :checked) on elements
 * and extracting the resulting matched styles.
 *
 * Port of snipbackground.js:1822-1995
 *
 * Element tag / input type / parent-snipkiwi-chain now come from ElementMeta
 * (captured once in the labeling pass), so no per-element DOM round-trips here.
 */
export class PseudoStateHandler {
    /**
     * Force hover/active pseudo-state on an element and its parents,
     * then extract the hover-specific matched styles.
     *
     * Returns only the rules that contain :hover in their selector.
     */
    async extractHoverStyles(cdp, meta, nodeId, classname, docRootNodeId) {
        const tagName = meta.tag;
        // Only hover-capable elements
        const hoverCapable = ['A', 'SPAN', 'BUTTON', 'DIV', 'LI', 'IMG'];
        if (!hoverCapable.includes(tagName))
            return [];
        const hoverRules = [];
        try {
            // Force hover on the element only — forcing active too causes active selectors
            // to match and produce malformed active:hover: Tailwind prefixes
            await cdp.send('CSS.forcePseudoState', {
                nodeId,
                forcedPseudoClasses: ['hover'],
            });
            // Force hover on parent elements too
            const parentClassnames = meta.parentClassnames;
            const parentNodes = [];
            for (const parentCls of parentClassnames) {
                try {
                    const pnode = await cdp.send('DOM.querySelector', {
                        nodeId: docRootNodeId,
                        selector: '.' + parentCls,
                    });
                    if (pnode.nodeId) {
                        parentNodes.push(pnode.nodeId);
                        await cdp.send('CSS.forcePseudoState', {
                            nodeId: pnode.nodeId,
                            forcedPseudoClasses: ['hover'],
                        });
                    }
                }
                catch {
                    // Parent may not be found
                }
            }
            // Re-fetch matched styles with hover state active
            const allMatchedStyles2 = await cdp.send('CSS.getMatchedStylesForNode', {
                nodeId,
            });
            // Collect normal hover rules — strip matchingSelectors to only the :hover
            // selector parts so the converter doesn't produce active:hover: or focus:hover: prefixes
            for (const matchNormal of allMatchedStyles2.matchedCSSRules || []) {
                const selectorText = matchNormal.rule.selectorList?.text || '';
                if (selectorText.includes(':hover')) {
                    matchNormal.rule.origin = 'pseudo';
                    const selectors = matchNormal.rule.selectorList?.selectors || [];
                    const hoverOnlySelectors = matchNormal.matchingSelectors.filter((idx) => {
                        const selText = selectors[idx]?.text || '';
                        return selText.includes(':hover');
                    });
                    hoverRules.push({
                        ...matchNormal,
                        matchingSelectors: hoverOnlySelectors.length > 0 ? hoverOnlySelectors : matchNormal.matchingSelectors,
                    });
                }
            }
            // Note: inherited hover rules are intentionally excluded — parent :hover rules
            // applied via inheritance would bleed hover: classes onto child elements
            // Collect pseudo-element hover rules
            for (const pseudoMatch of allMatchedStyles2.pseudoElements || []) {
                for (const pMatch of pseudoMatch.matches) {
                    const selectorText = pMatch.rule.selectorList?.text || '';
                    if (selectorText.includes(':hover')) {
                        pMatch.rule.origin = 'psuedo';
                        hoverRules.push({
                            rule: pMatch.rule,
                            matchingSelectors: pMatch.matchingSelectors,
                        });
                    }
                }
            }
            // Reset pseudo states
            await cdp.send('CSS.forcePseudoState', {
                nodeId,
                forcedPseudoClasses: [],
            });
            for (const parentNodeId of parentNodes) {
                try {
                    await cdp.send('CSS.forcePseudoState', {
                        nodeId: parentNodeId,
                        forcedPseudoClasses: [],
                    });
                }
                catch {
                    // Ignore cleanup failures
                }
            }
        }
        catch (e) {
            console.error('Pseudo hover extraction error:', e);
        }
        return hoverRules;
    }
    /**
     * Extract :checked pseudo-state styles for checkbox/radio inputs.
     * Port of snipbackground.js:1933-1988
     */
    async extractCheckedStyles(cdp, meta, nodeId, classname, docRootNodeId) {
        const tagName = meta.tag;
        if (tagName !== 'INPUT')
            return [];
        const isCheckbox = meta.inputType === 'checkbox' || meta.inputType === 'radio';
        if (!isCheckbox)
            return [];
        const checkedRules = [];
        try {
            // Force hover on parents (same pattern as hover extraction)
            const parentClassnames = meta.parentClassnames;
            const parentNodes = [];
            for (const parentCls of parentClassnames) {
                try {
                    const pnode = await cdp.send('DOM.querySelector', {
                        nodeId: docRootNodeId,
                        selector: '.' + parentCls,
                    });
                    if (pnode.nodeId) {
                        parentNodes.push(pnode.nodeId);
                        await cdp.send('CSS.forcePseudoState', {
                            nodeId: pnode.nodeId,
                            forcedPseudoClasses: ['hover'],
                        });
                    }
                }
                catch {
                    // Ignore
                }
            }
            const allMatchedStyles2 = await cdp.send('CSS.getMatchedStylesForNode', {
                nodeId,
            });
            for (const matchNormal of allMatchedStyles2.matchedCSSRules || []) {
                const selectorText = matchNormal.rule.selectorList?.text || '';
                if (selectorText.includes(':checked')) {
                    checkedRules.push(matchNormal);
                }
            }
            // Reset parent pseudo states
            for (const parentNodeId of parentNodes) {
                try {
                    await cdp.send('CSS.forcePseudoState', {
                        nodeId: parentNodeId,
                        forcedPseudoClasses: [],
                    });
                }
                catch {
                    // Ignore
                }
            }
        }
        catch (e) {
            console.error('Checkbox extraction error:', e);
        }
        return checkedRules;
    }
}
//# sourceMappingURL=pseudo-state-handler.js.map