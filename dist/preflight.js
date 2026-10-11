import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const REQUIRED = ['patchright', '@modelcontextprotocol/sdk/package.json', 'cheerio', 'yargs'];
/** Absolute path of the plugin root (the directory that holds package.json). */
export function pluginRoot() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}
/**
 * Verify the runtime dependencies resolve. Claude Code installs them into the
 * plugin cache automatically when it copies the plugin (package.json +
 * package-lock.json are committed for that). If that step was skipped or timed
 * out, tell the user exactly what to run.
 */
export function preflight() {
    const require = createRequire(import.meta.url);
    const missing = REQUIRED.filter((m) => {
        try {
            require.resolve(m);
            return false;
        }
        catch {
            return true;
        }
    });
    if (missing.length === 0)
        return;
    const root = pluginRoot();
    process.stderr.write([
        '',
        'SnipKiwi: runtime packages are missing (' + missing.map((m) => m.split('/')[0]).join(', ') + ').',
        'Install them once with:',
        '',
        `    cd "${root}" && npm install --omit=dev`,
        '',
        'Then restart Claude Code (or `/reload-plugins`). Node 18+ and Google Chrome are required.',
        '',
    ].join('\n'));
    process.exit(1);
}
/** Message shown when no browser can be launched. */
export const NO_BROWSER_MESSAGE = 'SnipKiwi could not launch a browser. Install Google Chrome, or run ' +
    `\`cd "${pluginRoot()}" && npx patchright install chromium\` to download a bundled Chromium.`;
//# sourceMappingURL=preflight.js.map