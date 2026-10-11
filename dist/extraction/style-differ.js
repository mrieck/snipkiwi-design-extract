// Curated set of visually load-bearing properties. Computed values come back
// in a canonical form (px lengths, rgb() colors) so string comparison is sound
// after pixel-tolerance normalization.
const COMPARED_PROPERTIES = [
    'display',
    'position',
    'flex-direction',
    'flex-wrap',
    'justify-content',
    'align-items',
    'gap',
    'grid-template-columns',
    'padding',
    'margin',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-align',
    'text-transform',
    'text-decoration-line',
    'color',
    'background-color',
    'background-image',
    'border-width',
    'border-style',
    'border-color',
    'border-radius',
    'box-shadow',
    'opacity',
    'overflow',
];
const MAX_ELEMENTS = 50;
const MAX_DEPTH = 4;
/** px differences at or below this are treated as equal (sub-pixel rounding, font metrics) */
const PX_TOLERANCE = 1.5;
export async function captureElementStyles(page, selector) {
    return page.evaluate(({ selector, props, maxElements, maxDepth }) => {
        const root = document.querySelector(selector);
        if (!root)
            return null;
        const out = [];
        const walk = (el, path, depth) => {
            if (out.length >= maxElements || depth > maxDepth)
                return;
            const cs = getComputedStyle(el);
            const styles = {};
            for (const p of props) {
                styles[p] = cs.getPropertyValue(p);
            }
            const rect = el.getBoundingClientRect();
            out.push({
                path,
                tag: el.tagName.toLowerCase(),
                styles,
                rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
            });
            // Index children per tag so paths stay stable when unrelated siblings differ
            const tagCounts = {};
            for (const child of Array.from(el.children)) {
                const tag = child.tagName.toLowerCase();
                const idx = tagCounts[tag] || 0;
                tagCounts[tag] = idx + 1;
                walk(child, `${path} > ${tag}[${idx}]`, depth + 1);
            }
        };
        walk(root, root.tagName.toLowerCase(), 0);
        return out;
    }, { selector, props: COMPARED_PROPERTIES, maxElements: MAX_ELEMENTS, maxDepth: MAX_DEPTH });
}
function valuesEqual(a, b) {
    if (a === b)
        return true;
    // Tokenwise compare with px tolerance, e.g. "16px 24px" vs "16.5px 24px"
    const aTokens = a.split(/\s+/);
    const bTokens = b.split(/\s+/);
    if (aTokens.length !== bTokens.length)
        return false;
    for (let i = 0; i < aTokens.length; i++) {
        const at = aTokens[i];
        const bt = bTokens[i];
        if (at === bt)
            continue;
        const aPx = at.match(/^(-?\d+(?:\.\d+)?)px$/);
        const bPx = bt.match(/^(-?\d+(?:\.\d+)?)px$/);
        if (aPx && bPx && Math.abs(parseFloat(aPx[1]) - parseFloat(bPx[1])) <= PX_TOLERANCE) {
            continue;
        }
        return false;
    }
    return true;
}
export function diffStyles(reference, candidate) {
    const refByPath = new Map(reference.map((s) => [s.path, s]));
    const candByPath = new Map(candidate.map((s) => [s.path, s]));
    const differences = [];
    const structure = [];
    let matched = 0;
    for (const ref of reference) {
        const cand = candByPath.get(ref.path);
        if (!cand) {
            structure.push({ path: ref.path, tag: ref.tag, issue: 'missing-in-candidate' });
            continue;
        }
        matched++;
        for (const prop of COMPARED_PROPERTIES) {
            const rv = ref.styles[prop] ?? '';
            const cv = cand.styles[prop] ?? '';
            if (!valuesEqual(rv, cv)) {
                differences.push({ path: ref.path, property: prop, reference: rv, candidate: cv });
            }
        }
        // Rendered size as pseudo-properties (both captured at the same viewport)
        if (Math.abs(ref.rect.width - cand.rect.width) > 2) {
            differences.push({
                path: ref.path,
                property: 'rendered-width',
                reference: `${ref.rect.width}px`,
                candidate: `${cand.rect.width}px`,
            });
        }
        if (Math.abs(ref.rect.height - cand.rect.height) > 2) {
            differences.push({
                path: ref.path,
                property: 'rendered-height',
                reference: `${ref.rect.height}px`,
                candidate: `${cand.rect.height}px`,
            });
        }
    }
    for (const cand of candidate) {
        if (!refByPath.has(cand.path)) {
            structure.push({ path: cand.path, tag: cand.tag, issue: 'extra-in-candidate' });
        }
    }
    return {
        matchedElements: matched,
        referenceElements: reference.length,
        candidateElements: candidate.length,
        differences,
        structure,
    };
}
export function formatDiffReport(report, referenceLabel, candidateLabel) {
    const lines = [];
    lines.push(`## Style Comparison`);
    lines.push('');
    lines.push(`- **Reference:** ${referenceLabel}`);
    lines.push(`- **Candidate:** ${candidateLabel}`);
    lines.push(`- **Elements:** ${report.matchedElements} matched ` +
        `(${report.referenceElements} in reference, ${report.candidateElements} in candidate)`);
    lines.push('');
    if (report.differences.length === 0 && report.structure.length === 0) {
        lines.push('✅ **No style or structure deviations found.** The candidate matches the reference.');
        return lines.join('\n');
    }
    if (report.structure.length > 0) {
        lines.push(`### Structure Deviations (${report.structure.length})`);
        lines.push('');
        for (const s of report.structure) {
            const note = s.issue === 'missing-in-candidate' ? 'missing in candidate' : 'extra in candidate';
            lines.push(`- \`${s.path}\` (<${s.tag}>) — ${note}`);
        }
        lines.push('');
    }
    if (report.differences.length > 0) {
        lines.push(`### Style Deviations (${report.differences.length})`);
        lines.push('');
        lines.push('| Element | Property | Reference | Candidate |');
        lines.push('|---|---|---|---|');
        for (const d of report.differences) {
            const esc = (v) => (v || '_(empty)_').replace(/\|/g, '\\|');
            lines.push(`| \`${d.path}\` | ${d.property} | \`${esc(d.reference)}\` | \`${esc(d.candidate)}\` |`);
        }
        lines.push('');
        lines.push('_Fix the candidate styles to match the reference values, then run compare_to_reference again._');
    }
    return lines.join('\n');
}
//# sourceMappingURL=style-differ.js.map