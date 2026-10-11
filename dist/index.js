#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import { BrowserManager } from './browser/browser-manager.js';
import { ExtractionPipeline } from './extraction/extraction-pipeline.js';
import { discoverElements } from './extraction/element-discovery.js';
import { spawn, spawnSync } from 'child_process';
/**
 * Resolve a command that actually opens a browser. On Linux we deliberately
 * avoid `xdg-open`: the default *web browser* may be Firefox while the
 * `text/html` MIME association is hijacked by another app (e.g. Slack), so
 * xdg-open would open the wrong thing. Prefer an explicit browser binary.
 */
function pickOpener() {
    if (process.platform === 'darwin')
        return 'open';
    if (process.platform === 'win32')
        return 'start';
    const candidates = [process.env.BROWSER, 'x-www-browser', 'firefox', 'chromium', 'google-chrome', 'xdg-open']
        .filter(Boolean);
    for (const c of candidates) {
        if (spawnSync('which', [c], { stdio: 'ignore' }).status === 0)
            return c;
    }
    return 'xdg-open';
}
function openInBrowser(files) {
    const opener = pickOpener();
    for (const f of files) {
        try {
            spawn(opener, [f], { detached: true, stdio: 'ignore' }).unref();
        }
        catch {
            /* best-effort: the paths are printed anyway */
        }
    }
    console.error(`Opened ${files.length} file(s) with ${opener}`);
}
function makeFilename(urlStr, selector, variant, timestamp) {
    const domain = new URL(urlStr).hostname.replace(/^www\./, '');
    const sel = selector.replace(/^[.#]/, '').replace(/[^a-zA-Z0-9-]/g, '-');
    const ts = timestamp.replace(/[-:T]/g, '').replace(/\..+/, '');
    return `${domain}_${variant}_${sel}_${ts}.html`;
}
function buildTailwindHtmlFile(result, urlStr, selector, timestamp) {
    const domain = new URL(urlStr).hostname.replace(/^www\./, '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${selector} (tailwind) \u2014 ${domain}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    /* Extracted CSS: variables, fonts, keyframes, fallback rules for unconverted properties */
${result.css.split('\n').map((l) => '    ' + l).join('\n')}
  </style>
</head>
<body class="${result.tailwindBodyClasses || ''}">
  <!-- Extracted from ${urlStr} | selector: ${selector} | ${timestamp} -->
  ${result.tailwindHtml || result.html}
</body>
</html>`;
}
function buildOriginalHtmlFile(result, urlStr, selector, timestamp) {
    const domain = new URL(urlStr).hostname.replace(/^www\./, '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${selector} (original CSS) \u2014 ${domain}</title>
  <style>
${result.css.split('\n').map((l) => '    ' + l).join('\n')}
  </style>
</head>
<body>
  <!-- Extracted from ${urlStr} | selector: ${selector} | ${timestamp} -->
  ${result.html}
</body>
</html>`;
}
async function main() {
    const argv = await yargs(hideBin(process.argv))
        .usage('Usage: $0 --url <url> --selector <selector> [options]')
        .option('url', {
        alias: 'u',
        type: 'string',
        description: 'URL of the page to extract from',
        demandOption: true,
    })
        .option('selector', {
        alias: 's',
        type: 'string',
        description: 'CSS selector for the target element (not needed with --list)',
    })
        .option('list', {
        alias: 'l',
        type: 'boolean',
        description: 'Discover sections and print their selectors, then exit (no extraction)',
        default: false,
    })
        .option('open', {
        type: 'boolean',
        description: 'Open the generated preview(s) in a browser (implies --format html)',
        default: false,
    })
        .option('viewport', {
        alias: 'v',
        type: 'string',
        description: 'Viewport: all, responsive (desktop+tablet+mobile), desktop, tablet, mobile, or a width in px',
        default: 'all',
    })
        .option('format', {
        alias: 'f',
        type: 'string',
        choices: ['css', 'tailwind', 'both', 'json', 'html'],
        description: 'Output format (html writes preview files)',
        default: 'both',
    })
        .option('resolve-vars', {
        type: 'boolean',
        description: 'Resolve CSS variables to computed values',
        default: true,
    })
        .option('no-hover', {
        type: 'boolean',
        description: 'Skip hover/active state extraction',
        default: false,
    })
        .option('keep-unused-classes', {
        type: 'boolean',
        description: 'Keep CSS classes not found in extracted rules',
        default: false,
    })
        .option('keep-unused-attrs', {
        type: 'boolean',
        description: 'Keep data-* and other non-essential HTML attributes',
        default: false,
    })
        .option('output', {
        alias: 'o',
        type: 'string',
        description: 'Output file/directory path (default: stdout, or cwd for html format)',
    })
        .option('json', {
        type: 'boolean',
        description: 'Output as structured JSON',
        default: false,
    })
        .option('timeout', {
        type: 'number',
        description: 'Page load timeout in ms',
        default: 30000,
    })
        .check((argv) => {
        if (!argv.list && !argv.selector) {
            throw new Error('--selector is required (or use --list to discover selectors first)');
        }
        return true;
    })
        .help()
        .argv;
    const browserManager = new BrowserManager();
    try {
        await browserManager.launch();
        // --list: run the same segmentation engine as discovery/section-shooter and
        // print the discovered selectors, ready to paste into a real extraction run.
        if (argv.list) {
            const bp = await browserManager.createPage(argv.url, argv.timeout);
            await browserManager.navigatePage(bp, argv.url, argv.timeout);
            console.error(`Discovering sections on ${argv.url} …`);
            const elements = await discoverElements(bp.page);
            await browserManager.closePage(bp);
            const useJson = argv.json || argv.format === 'json';
            if (useJson) {
                const rows = elements.map((el) => ({
                    label: el.label,
                    selector: el.selector,
                    semanticType: el.semanticType,
                    rect: el.rect,
                    textPreview: el.textPreview,
                }));
                console.log(JSON.stringify(rows, null, 2));
            }
            else {
                console.error(`Found ${elements.length} sections:\n`);
                for (const el of elements) {
                    const size = `${Math.round(el.rect.width)}x${Math.round(el.rect.height)}`;
                    console.log(`#${String(el.label).padEnd(3)} ${el.semanticType.padEnd(12)} ${size.padEnd(11)} ${el.selector}`);
                    const preview = el.textPreview.replace(/\s+/g, ' ').trim().slice(0, 60);
                    if (preview)
                        console.log(`      "${preview}"`);
                }
                console.error(`\nExtract one with:\n  node dist/index.js --url ${argv.url} --selector '<selector>' --format json --json`);
            }
            return;
        }
        const pipeline = new ExtractionPipeline(browserManager);
        const options = {
            viewport: argv.viewport,
            resolveVariables: argv['resolve-vars'],
            includeHoverStates: !argv['no-hover'],
            removeUnusedClasses: !argv['keep-unused-classes'],
            removeUnusedAttributes: !argv['keep-unused-attrs'],
        };
        // Parse custom width viewport
        if (options.viewport && /^\d+$/.test(options.viewport)) {
            options.customWidth = parseInt(options.viewport, 10);
            options.viewport = 'custom';
        }
        console.error(`Extracting CSS from ${argv.url} for selector: ${argv.selector}`);
        const result = await pipeline.extract(argv.url, argv.selector, options);
        // --open implies HTML preview mode (opening only makes sense for a rendered page).
        const format = argv.open ? 'html' : argv.format;
        const timestamp = new Date().toISOString();
        // HTML preview mode: write both tailwind and original files
        if (format === 'html') {
            const outDir = argv.output || process.cwd();
            fs.mkdirSync(outDir, { recursive: true });
            const twFile = makeFilename(argv.url, argv.selector, 'tailwind', timestamp);
            const origFile = makeFilename(argv.url, argv.selector, 'original', timestamp);
            const twHtml = buildTailwindHtmlFile(result, argv.url, argv.selector, timestamp);
            const origHtml = buildOriginalHtmlFile(result, argv.url, argv.selector, timestamp);
            const twPath = path.join(outDir, twFile);
            const origPath = path.join(outDir, origFile);
            fs.writeFileSync(twPath, twHtml, 'utf-8');
            fs.writeFileSync(origPath, origHtml, 'utf-8');
            console.error(`Tailwind: ${twPath}`);
            console.error(`Original: ${origPath}`);
            if (argv.open) {
                openInBrowser([twPath, origPath]);
            }
            return;
        }
        // JSON mode
        const useJson = argv.json || format === 'json';
        let output;
        if (useJson) {
            output = JSON.stringify({
                url: argv.url,
                selector: argv.selector,
                timestamp,
                html: result.html,
                css: result.css,
                tailwindHtml: result.tailwindHtml || result.html,
                tailwindBodyClasses: result.tailwindBodyClasses,
                fonts: result.fonts,
                cssVariables: result.cssVariables,
            }, null, 2);
        }
        else {
            const sections = [];
            if (format === 'css' || format === 'both') {
                sections.push('=== HTML ===');
                sections.push(result.html);
                sections.push('');
                sections.push('=== CSS ===');
                sections.push(result.css);
            }
            if (format === 'tailwind' || format === 'both') {
                if (result.tailwindHtml) {
                    sections.push('');
                    sections.push('=== TAILWIND HTML ===');
                    sections.push(result.tailwindHtml);
                }
                if (result.tailwindBodyClasses) {
                    sections.push('');
                    sections.push('=== TAILWIND BODY CLASSES ===');
                    sections.push(result.tailwindBodyClasses);
                }
            }
            output = sections.join('\n');
        }
        if (argv.output) {
            fs.writeFileSync(argv.output, output, 'utf-8');
            console.error(`Output written to ${argv.output}`);
        }
        else {
            console.log(output);
        }
    }
    catch (error) {
        console.error('Extraction error:', error.message);
        process.exit(1);
    }
    finally {
        await browserManager.close();
    }
}
main();
//# sourceMappingURL=index.js.map