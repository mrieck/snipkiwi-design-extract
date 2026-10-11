import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BrowserManager } from './browser/browser-manager.js';
import { ExtractionPipeline } from './extraction/extraction-pipeline.js';
import { ExtractionOptions, DEFAULT_VIEWPORTS } from './types/index.js';
import {
  discoverElements,
  injectLabelOverlay,
  removeLabelOverlay,
  formatElementLegend,
} from './extraction/element-discovery.js';
import {
  captureElementStyles,
  diffStyles,
  formatDiffReport,
} from './extraction/style-differ.js';

export const SERVER_VERSION = '1.0.0';

const browserManager = new BrowserManager();
let pipeline: ExtractionPipeline;

const server = new Server(
  {
    name: 'snipkiwi',
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'extract_css_convert_tailwind',
      description:
        'Extract the CSS of an element subtree or get a Tailwind-converted version. ' +
        'Navigates to the URL, finds the element by CSS selector, extracts all matched CSS rules ' +
        '(including media queries, hover states, pseudo-elements), and converts to Tailwind utility classes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to extract from',
          },
          selector: {
            type: 'string',
            description:
              'CSS selector for the target element (e.g., ".hero-section", "#main-nav", "header")',
          },
          viewport: {
            type: 'string',
            enum: ['all', 'desktop', 'tablet', 'mobile'],
            default: 'all',
            description:
              'Viewport(s) to extract CSS for. "all" extracts at desktop, tablet, and mobile breakpoints.',
          },
          resolveVariables: {
            type: 'boolean',
            default: true,
            description:
              'Whether to resolve CSS custom properties (--variables) to their computed values',
          },
          includeHoverStates: {
            type: 'boolean',
            default: true,
            description:
              'Whether to extract :hover, :active, and :focus pseudo-state styles',
          },
        },
        required: ['url', 'selector'],
      },
    },
    {
      name: 'list_page_elements',
      description:
        'Navigate to a URL and list the major page elements with their CSS selectors, semantic types, ' +
        'hierarchy context, and visual properties. Scans 2-3 levels deep to find cards, widgets, and forms. ' +
        'Useful for discovering which elements to extract before calling extract_css_convert_tailwind.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to analyze',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'screenshot_page',
      description:
        'Take an annotated screenshot of a webpage with numbered labels (#1, #2, #3...) overlaid on ' +
        'discovered elements. Returns the screenshot image plus a legend mapping each number to its ' +
        'CSS selector, semantic type, size, and content preview. Use this to visually identify which ' +
        'element a user is describing (e.g., "the sidebar", "the pricing card") before extracting it.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the page to screenshot',
          },
          viewport: {
            type: 'string',
            enum: ['desktop', 'tablet', 'mobile'],
            default: 'desktop',
            description: 'Viewport size for the screenshot',
          },
        },
      },
    },
    {
      name: 'compare_to_reference',
      description:
        'Compare your local implementation of an element against the reference element it was cloned from. ' +
        'Captures computed styles and screenshots of both elements at the same viewport, then returns a ' +
        'structured deviation report (e.g. "your padding is 16px, reference is 24px") plus side-by-side ' +
        'screenshots. Use this after building a component from an extracted reference to verify it matches, ' +
        'fix the reported deviations, and re-run until clean.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          reference_url: {
            type: 'string',
            description: 'URL of the reference page (the site being cloned)',
          },
          reference_selector: {
            type: 'string',
            description: 'CSS selector for the reference element',
          },
          local_url: {
            type: 'string',
            description: 'URL of your implementation (e.g. http://localhost:3000/page)',
          },
          local_selector: {
            type: 'string',
            description:
              'CSS selector for your implementation of the element. Defaults to reference_selector.',
          },
          viewport: {
            type: 'string',
            enum: ['desktop', 'tablet', 'mobile'],
            default: 'desktop',
            description: 'Viewport to compare at (both pages use the same viewport)',
          },
        },
        required: ['reference_url', 'reference_selector', 'local_url'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'extract_css_convert_tailwind') {
    try {
      if (!pipeline) {
        await browserManager.launch();
        pipeline = new ExtractionPipeline(browserManager);
      }

      const options: ExtractionOptions = {
        viewport: (args?.viewport as string) || 'all',
        resolveVariables: args?.resolveVariables !== false,
        includeHoverStates: args?.includeHoverStates !== false,
      };

      const result = await pipeline.extract(
        args!.url as string,
        args!.selector as string,
        options
      );

      const output = formatExtractionResult(
        result,
        args!.url as string,
        args!.selector as string
      );

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error extracting CSS: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'list_page_elements') {
    try {
      await browserManager.launch();

      let bp;
      let sourceLabel: string;

      if (args?.url) {
        bp = await browserManager.createPage(args.url as string);
        await browserManager.navigatePage(bp, args.url as string);
        sourceLabel = args.url as string;
      } else {
        return {
          content: [{ type: 'text', text: 'url is required.' }],
          isError: true,
        };
      }

      const elements = await discoverElements(bp.page);
      await browserManager.closePage(bp);

      let output = `## Page Elements for ${sourceLabel}\n\n`;
      output += `Found ${elements.length} elements:\n\n`;
      output += `| # | Selector | Type | Size | Context | Preview |\n`;
      output += `|---|----------|------|------|---------|--------|\n`;

      for (const el of elements) {
        const preview = el.textPreview.substring(0, 40).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const bgNote = el.backgroundColor && el.backgroundColor !== 'transparent' ? ` bg:${el.backgroundColor}` : '';
        output += `| #${el.label} | \`${el.selector}\` | ${el.semanticType} | ${el.rect.width}x${el.rect.height}${bgNote} | ${el.parentContext} | ${preview} |\n`;
      }

      output += `\n_Use screenshot_page to see these elements visually with numbered labels._`;

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing elements: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'screenshot_page') {
    try {
      await browserManager.launch();

      // Determine viewport
      const viewportName = (args?.viewport as string) || 'desktop';
      const viewportConfig = viewportName === 'tablet'
        ? DEFAULT_VIEWPORTS.ipad
        : viewportName === 'mobile'
          ? DEFAULT_VIEWPORTS.iphonexs
          : DEFAULT_VIEWPORTS.default;

      let bp;
      let pageTitle: string;

      if (args?.url) {
        bp = await browserManager.createPage(args.url as string);
        await browserManager.navigatePage(bp, args.url as string);
        pageTitle = args.url as string;
      } else {
        return {
          content: [{ type: 'text', text: 'url is required.' }],
          isError: true,
        };
      }

      // Set viewport if non-default
      if (viewportName !== 'desktop') {
        await bp.page.setViewportSize({
          width: viewportConfig.width,
          height: viewportConfig.height,
        });
        // Allow reflow
        await bp.page.waitForTimeout(500);
      }

      // Discover elements
      const elements = await discoverElements(bp.page);

      // Inject labeled overlay
      await injectLabelOverlay(bp.page, elements);

      // Take screenshot
      const screenshotBuffer = await bp.page.screenshot({
        fullPage: true,
        type: 'png',
      });

      // Remove overlay
      await removeLabelOverlay(bp.page);
      await browserManager.closePage(bp);

      // Build legend text
      const legend = formatElementLegend(elements);

      return {
        content: [
          {
            type: 'image' as const,
            data: screenshotBuffer.toString('base64'),
            mimeType: 'image/png',
          },
          {
            type: 'text',
            text: `## Annotated Screenshot: ${pageTitle}\n\nViewport: ${viewportConfig.width}x${viewportConfig.height} (${viewportName})\n${elements.length} elements labeled:\n\n${legend}\n\n_Use the # number with list_page_elements output, then call extract_css_convert_tailwind with the selector._`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error taking screenshot: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'compare_to_reference') {
    try {
      await browserManager.launch();

      const referenceUrl = args!.reference_url as string;
      const referenceSelector = args!.reference_selector as string;
      const localUrl = args!.local_url as string;
      const localSelector = (args?.local_selector as string) || referenceSelector;

      const viewportName = (args?.viewport as string) || 'desktop';
      const viewportConfig = viewportName === 'tablet'
        ? DEFAULT_VIEWPORTS.ipad
        : viewportName === 'mobile'
          ? DEFAULT_VIEWPORTS.iphonexs
          : DEFAULT_VIEWPORTS.default;

      const capture = async (url: string, selector: string, label: string) => {
        const bp = await browserManager.createPage(url);
        try {
          await browserManager.navigatePage(bp, url);
          if (viewportName !== 'desktop') {
            await bp.page.setViewportSize({
              width: viewportConfig.width,
              height: viewportConfig.height,
            });
            await bp.page.waitForTimeout(500);
          }

          const snapshot = await captureElementStyles(bp.page, selector);
          if (!snapshot) {
            throw new Error(`Selector "${selector}" not found on ${label} (${url})`);
          }

          let screenshot: string | null = null;
          try {
            const buffer = await bp.page.locator(selector).first().screenshot({ type: 'png' });
            screenshot = buffer.toString('base64');
          } catch {
            // Element may be zero-sized or off-screen; the style diff still works
          }

          return { snapshot, screenshot };
        } finally {
          await browserManager.closePage(bp);
        }
      };

      const reference = await capture(referenceUrl, referenceSelector, 'reference page');
      const candidate = await capture(localUrl, localSelector, 'local page');

      const report = diffStyles(reference.snapshot, candidate.snapshot);
      const reportText = formatDiffReport(
        report,
        `\`${referenceSelector}\` on ${referenceUrl}`,
        `\`${localSelector}\` on ${localUrl}`
      );

      const content: any[] = [];
      if (reference.screenshot) {
        content.push({ type: 'text', text: '**Reference element:**' });
        content.push({ type: 'image' as const, data: reference.screenshot, mimeType: 'image/png' });
      }
      if (candidate.screenshot) {
        content.push({ type: 'text', text: '**Your implementation:**' });
        content.push({ type: 'image' as const, data: candidate.screenshot, mimeType: 'image/png' });
      }
      content.push({
        type: 'text',
        text: `${reportText}\n\nViewport: ${viewportConfig.width}x${viewportConfig.height} (${viewportName})`,
      });

      return { content };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error comparing to reference: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

function formatExtractionResult(
  result: any,
  url: string,
  selector: string
): string {
  const sections: string[] = [];

  sections.push(`## Extracted CSS for \`${selector}\` on ${url}\n`);

  sections.push('### HTML\n');
  sections.push('```html');
  sections.push(result.html);
  sections.push('```\n');

  sections.push('### CSS\n');
  sections.push('```css');
  sections.push(result.css);
  sections.push('```\n');

  if (result.tailwindHtml) {
    sections.push('### Tailwind HTML\n');
    sections.push('```html');
    sections.push(result.tailwindHtml);
    sections.push('```\n');
  }

  if (result.tailwindBodyClasses) {
    sections.push('### Tailwind Body Classes\n');
    sections.push('```');
    sections.push(result.tailwindBodyClasses);
    sections.push('```\n');
  }

  if (result.fonts && result.fonts.length > 0) {
    sections.push('### Fonts Used\n');
    for (const font of result.fonts) {
      sections.push(`- **${font.font_family}** (${font.font_weight || 'normal'}, ${font.font_style || 'normal'})`);
    }
    sections.push('');
  }

  if (result.cssVariables && Object.keys(result.cssVariables).length > 0) {
    sections.push('### CSS Variables Resolved\n');
    for (const [name, value] of Object.entries(result.cssVariables)) {
      sections.push(`- \`${name}\`: \`${value}\``);
    }
  }

  return sections.join('\n');
}

function installStdioErrorGuards() {
  const handleStreamError = (error: NodeJS.ErrnoException) => {
    if (error?.code === 'EPIPE') {
      void browserManager.close().finally(() => process.exit(0));
      return;
    }
    void browserManager.close().finally(() => process.exit(1));
  };

  process.stdout.on('error', handleStreamError);
  process.stderr.on('error', handleStreamError);
}

// Start the server
async function main() {
  installStdioErrorGuards();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`SnipKiwi MCP server ${SERVER_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Prevent unhandled errors from crashing the server process
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  await browserManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserManager.close();
  process.exit(0);
});
