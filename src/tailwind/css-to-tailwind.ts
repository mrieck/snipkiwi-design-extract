/**
 * CSS property to Tailwind class conversion.
 * Port of tailwind_properties.js (4,001 lines)
 *
 * Exports:
 *   - cssToTailwind()        main property→class mapper
 *   - getBestTailwindClasses() optimized margin/padding classes
 *   - getTransformClasses()  transform value → Tailwind classes
 *   - getFilterClasses()     filter/backdrop-filter → Tailwind classes
 *   - getFontClasses()       font shorthand → Tailwind classes
 */

// ── Utility helpers ─────────────────────────────────────────────────

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
    .replace(/\[/g, '\\[')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

function spacesToUnderscore(value: string): string {
  return value.replace(/\s+/g, '_');
}

function getPxValue(value: string): number | null {
  value = value.trim().toLowerCase();
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return null;
  if (value.endsWith('rem')) return numValue * 16;
  if (value.endsWith('px')) return numValue;
  if (value.endsWith('em')) return numValue * 16;
  if (value.endsWith('%')) {
    return value === '100%' ? 9999 : null;
  }
  return numValue;
}

function standardizeBorderRadiusValue(value: string): string {
  value = value.trim().toLowerCase();
  if (['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].includes(value)) return value;
  const pxValue = getPxValue(value);
  if (pxValue !== null) return `${Math.round(pxValue)}px`;
  return value;
}

function standardizeSpacingValue(value: string): string {
  value = value.trim().toLowerCase();
  const knownValues = ['auto', 'px', '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96'];
  if (knownValues.includes(value)) return value;
  const pxValue = getPxValue(value);
  if (pxValue !== null) {
    const predefinedPxValues: Record<number, string> = {
      0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5', 12: '3', 14: '3.5',
      16: '4', 20: '5', 24: '6', 28: '7', 32: '8', 36: '9', 40: '10', 44: '11', 48: '12',
      56: '14', 64: '16', 80: '20', 96: '24', 112: '28', 128: '32', 144: '36', 160: '40',
      176: '44', 192: '48', 208: '52', 224: '56', 240: '60', 256: '64', 288: '72', 320: '80', 384: '96',
    };
    const rounded = Math.round(pxValue);
    return predefinedPxValues[rounded] ?? `${rounded}px`;
  }
  return value;
}

// ── Spacing scale (reused by several helpers) ───────────────────────

function makeSpacingScale(prefix: string): Record<string, string> {
  const vals = ['0', 'px', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12', '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96', 'auto'];
  const m: Record<string, string> = {};
  for (const v of vals) m[v] = `${prefix}-${v}`;
  return m;
}

// ── Handler factories ───────────────────────────────────────────────

function handleSize(dimension: string, sizeType: string): (value: string) => string {
  const prefix = sizeType === 'min' ? `min-${dimension}` : sizeType === 'max' ? `max-${dimension}` : dimension;

  const predefinedSizesNone: Record<string, string> = {
    '1/2': `${prefix}-1/2`, '1/3': `${prefix}-1/3`, '2/3': `${prefix}-2/3`,
    '1/4': `${prefix}-1/4`, '2/4': `${prefix}-1/2`, '3/4': `${prefix}-3/4`,
    '1/5': `${prefix}-1/5`, '2/5': `${prefix}-2/5`, '3/5': `${prefix}-3/5`, '4/5': `${prefix}-4/5`,
    '1/6': `${prefix}-1/6`, '2/6': `${prefix}-1/3`, '3/6': `${prefix}-1/2`,
    '4/6': `${prefix}-2/3`, '5/6': `${prefix}-5/6`,
    '1/12': `${prefix}-1/12`, '2/12': `${prefix}-1/6`, '3/12': `${prefix}-1/4`,
    '4/12': `${prefix}-1/3`, '5/12': `${prefix}-5/12`, '6/12': `${prefix}-1/2`,
    '7/12': `${prefix}-7/12`, '8/12': `${prefix}-2/3`, '9/12': `${prefix}-3/4`,
    '10/12': `${prefix}-5/6`, '11/12': `${prefix}-11/12`,
    '50%': `${prefix}-1/2`, '33.333333%': `${prefix}-1/3`, '66.666667%': `${prefix}-2/3`,
    '25%': `${prefix}-1/4`, '75%': `${prefix}-3/4`,
    '20%': `${prefix}-1/5`, '40%': `${prefix}-2/5`, '60%': `${prefix}-3/5`, '80%': `${prefix}-4/5`,
    '16.666667%': `${prefix}-1/6`, '83.333333%': `${prefix}-5/6`,
    ...Object.fromEntries(
      ['0','1','2','3','4','5','6','8','10','12','14','16','20','24','28','32','36','40','44','48','52','56','60','64','72','80','96']
        .map(v => [v, `${prefix}-${v}`])
    ),
    'auto': `${prefix}-auto`, 'px': `${prefix}-px`, 'full': `${prefix}-full`,
    'screen': `${prefix}-screen`, 'min': `${prefix}-min`, 'max': `${prefix}-max`, 'fit': `${prefix}-fit`,
  };

  const predefinedSizesMinMax: Record<string, string | undefined> = {
    '0': `${prefix}-0`, 'full': `${prefix}-full`, 'min': `${prefix}-min`,
    'max': `${prefix}-max`, 'fit': `${prefix}-fit`,
    'screen': sizeType === 'min' ? `${prefix}-screen` : undefined,
    'none': sizeType === 'max' ? `${prefix}-none` : undefined,
    ...(sizeType === 'max' && dimension === 'w' ? {
      'xs': `${prefix}-xs`, 'sm': `${prefix}-sm`, 'md': `${prefix}-md`, 'lg': `${prefix}-lg`,
      'xl': `${prefix}-xl`, '2xl': `${prefix}-2xl`, '3xl': `${prefix}-3xl`, '4xl': `${prefix}-4xl`,
      '5xl': `${prefix}-5xl`, '6xl': `${prefix}-6xl`, '7xl': `${prefix}-7xl`,
      'screen-sm': `${prefix}-screen-sm`, 'screen-md': `${prefix}-screen-md`,
      'screen-lg': `${prefix}-screen-lg`, 'screen-xl': `${prefix}-screen-xl`,
      'screen-2xl': `${prefix}-screen-2xl`,
    } : {}),
  };

  const predefined = sizeType === 'none' ? predefinedSizesNone : predefinedSizesMinMax;

  return (value: string) => {
    const v = value.trim();
    const mapped = predefined[v];
    if (mapped) return mapped;
    return `${prefix}-[${spacesToUnderscore(escapeValue(v))}]`;
  };
}

function handleBorderRadius(property: string): (value: string) => string {
  const propertyMap: Record<string, string> = {
    'border-radius': 'rounded', 'border-top-left-radius': 'rounded-tl',
    'border-top-right-radius': 'rounded-tr', 'border-bottom-left-radius': 'rounded-bl',
    'border-bottom-right-radius': 'rounded-br', 'border-top-radius': 'rounded-t',
    'border-right-radius': 'rounded-r', 'border-bottom-radius': 'rounded-b',
    'border-left-radius': 'rounded-l',
  };
  const prefix = propertyMap[property];
  if (!prefix) return (value: string) => `[${property}:${escapeValue(value)}]`;

  const predefined: Record<string, string> = {
    '0px': `${prefix}-none`, '0': `${prefix}-none`, '2px': `${prefix}-sm`,
    '4px': prefix, '6px': `${prefix}-md`, '8px': `${prefix}-lg`,
    '12px': `${prefix}-xl`, '16px': `${prefix}-2xl`, '24px': `${prefix}-3xl`,
    '9999px': `${prefix}-full`, '100%': `${prefix}-full`,
    'none': `${prefix}-none`, 'sm': `${prefix}-sm`, 'md': `${prefix}-md`,
    'lg': `${prefix}-lg`, 'xl': `${prefix}-xl`, '2xl': `${prefix}-2xl`,
    '3xl': `${prefix}-3xl`, 'full': `${prefix}-full`,
  };

  return (value: string) => {
    const trimmed = value.trim();
    const values = trimmed.split(/\s+/);
    if (values.length === 1) {
      const std = standardizeBorderRadiusValue(values[0]);
      return predefined[std] ?? `${prefix}-[${escapeValue(values[0])}]`;
    }
    return `[${property}:${escapeValue(values.join('_'))}]`;
  };
}

function handleSpacing(property: string): (value: string) => string {
  const propertyMap: Record<string, string> = {
    'padding': 'p', 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
    'padding-horizontal': 'px', 'padding-vertical': 'py',
    'padding-inline': 'px', 'padding-inline-start': 'pl', 'padding-inline-end': 'pr',
    'margin': 'm', 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml',
    'margin-horizontal': 'mx', 'margin-vertical': 'my',
    'margin-inline': 'mx', 'margin-inline-start': 'ml', 'margin-inline-end': 'mr',
    'gap': 'gap', 'gap-x': 'gap-x', 'gap-y': 'gap-y',
  };
  const prefix = propertyMap[property];
  if (!prefix) return (value: string) => `[${property}:${escapeValue(value)}]`;

  const predefined = makeSpacingScale(prefix);
  const isMargin = prefix.startsWith('m');

  return (value: string) => {
    const trimmed = value.trim();
    // Tokenize respecting parentheses
    const values: string[] = [];
    let token = '';
    let parenCount = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') { parenCount++; token += ch; }
      else if (ch === ')') { parenCount--; token += ch; }
      else if (/\s/.test(ch) && parenCount === 0) {
        if (token.trim()) { values.push(token.trim()); token = ''; }
      } else { token += ch; }
    }
    if (token.trim()) values.push(token.trim());

    let sidePrefix = prefix;
    if (property.endsWith('-start')) sidePrefix = isMargin ? 'ml' : 'pl';
    else if (property.endsWith('-end')) sidePrefix = isMargin ? 'mr' : 'pr';

    if (values.length === 1) {
      return predefined[values[0]] ?? `${sidePrefix}-[${spacesToUnderscore(escapeValue(values[0]))}]`;
    } else if (values.length === 2) {
      const [v1, v2] = values;
      const startPfx = isMargin ? 'ml' : 'pl';
      const endPfx = isMargin ? 'mr' : 'pr';
      const startClass = predefined[v1]
        ? predefined[v1].replace(prefix, startPfx)
        : `${startPfx}-[${spacesToUnderscore(escapeValue(v1))}]`;
      const endClass = predefined[v2]
        ? predefined[v2].replace(prefix, endPfx)
        : `${endPfx}-[${spacesToUnderscore(escapeValue(v2))}]`;
      return `${startClass} ${endClass}`;
    }
    return `${sidePrefix}-[${spacesToUnderscore(escapeValue(trimmed))}]`;
  };
}

function handleGapSpacing(property: string): (value: string) => string {
  const prefixMap: Record<string, string> = {
    'row-gap': 'gap-y', 'column-gap': 'gap-x', 'grid-row-gap': 'gap-y', 'grid-column-gap': 'gap-x',
  };
  const prefix = prefixMap[property];
  const predefined = makeSpacingScale(prefix);

  return (value: string) => {
    const v = value.trim();
    return predefined[v] ?? `${prefix}-[${spacesToUnderscore(escapeValue(v))}]`;
  };
}

function handleFlex(): (value: string) => string {
  const predefined: Record<string, string> = { '1': 'flex-1', 'auto': 'flex-auto', 'initial': 'flex-initial', 'none': 'flex-none' };
  return (value: string) => {
    const v = value.trim();
    if (predefined[v]) return predefined[v];
    return `flex-[${escapeValue(v).replace(/\s+/g, '_')}]`;
  };
}

function handlePosition(property: string): (value: string) => string {
  const prefix = property; // top, right, bottom, left
  const predefined = makeSpacingScale(prefix);

  return (value: string) => {
    const std = standardizeSpacingValue(value);
    return predefined[std] ?? `${prefix}-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

function handleGridTemplate(property: string): (value: string) => string {
  return (value: string) => {
    const v = value.trim();
    if (v === 'none') return property === 'grid-template-columns' ? 'grid-cols-none' : 'grid-rows-none';
    const repeatMatch = v.match(/^repeat\((\d+),\s*1fr\)$/);
    if (repeatMatch) {
      return property === 'grid-template-columns' ? `grid-cols-${repeatMatch[1]}` : `grid-rows-${repeatMatch[1]}`;
    }
    const escaped = escapeValue(v).replace(/\s+/g, '_');
    return property === 'grid-template-columns' ? `grid-cols-[${escaped}]` : `grid-rows-[${escaped}]`;
  };
}

function handleGridColumnStart(): (value: string) => string {
  return (value: string) => {
    if (value === 'auto') return 'col-start-auto';
    const spanMatch = value.match(/^span\s+(\d+)$/i);
    if (spanMatch) return `col-span-${spanMatch[1]}`;
    if (/^\d+$/.test(value)) return `col-start-[${value}]`;
    return `[grid-column-start:${escapeValue(value)}]`;
  };
}

function handleGridColumnEnd(): (value: string) => string {
  return (value: string) => {
    if (value === 'auto') return 'col-end-auto';
    const spanMatch = value.match(/^span\s+(\d+)$/i);
    if (spanMatch) return `col-span-${spanMatch[1]}`;
    if (/^\d+$/.test(value)) return `col-end-[${value}]`;
    return `[grid-column-end:${escapeValue(value)}]`;
  };
}

function handleGridRowStart(): (value: string) => string {
  return (value: string) => {
    if (value === 'auto') return 'row-start-auto';
    const spanMatch = value.match(/^span\s+(\d+)$/i);
    if (spanMatch) return `row-span-${spanMatch[1]}`;
    if (/^\d+$/.test(value)) return `row-start-[${value}]`;
    return `[grid-row-start:${escapeValue(value)}]`;
  };
}

function handleGridRowEnd(): (value: string) => string {
  return (value: string) => {
    if (value === 'auto') return 'row-end-auto';
    const spanMatch = value.match(/^span\s+(\d+)$/i);
    if (spanMatch) return `row-span-${spanMatch[1]}`;
    if (/^\d+$/.test(value)) return `row-end-[${value}]`;
    return `[grid-row-end:${escapeValue(value)}]`;
  };
}

function handleBorderWidth(property: string): (value: string) => string {
  const side = property.match(/border-(top|right|bottom|left)-width/);
  const prefix = side ? `border-${side[1][0]}` : 'border';
  return (value: string) => {
    const widthMap: Record<string, string> = {
      'thin': prefix, 'medium': `${prefix}-2`, 'thick': `${prefix}-4`,
      '0': `${prefix}-0`, '1px': prefix, '2px': `${prefix}-2`, '4px': `${prefix}-4`, '8px': `${prefix}-8`,
    };
    return widthMap[value] ?? `${prefix}-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

function handleBorderStyle(property: string): (value: string) => string {
  const side = property.match(/border-(top|right|bottom|left)-style/);
  return (value: string) => {
    if (side) return `[${property}:${value}]`;
    const styleMap: Record<string, string> = {
      'none': 'border-none', 'hidden': 'border-none', 'solid': 'border-solid',
      'dashed': 'border-dashed', 'dotted': 'border-dotted', 'double': 'border-double',
      'groove': '[border-style:groove]', 'ridge': '[border-style:ridge]',
      'inset': '[border-style:inset]', 'outset': '[border-style:outset]',
    };
    return styleMap[value] ?? `border-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

function handleBorderColor(property: string): (value: string) => string {
  const side = property.match(/border-(top|right|bottom|left)-color/);
  const prefix = side ? `border-${side[1][0]}` : 'border';
  return (value: string) => {
    const colorMap: Record<string, string> = {
      'transparent': `${prefix}-transparent`, 'current': `${prefix}-current`,
      'black': `${prefix}-black`, 'white': `${prefix}-white`,
      'inherit': `${prefix}-inherit`, 'currentColor': `${prefix}-current`,
    };
    if (colorMap[value]) return colorMap[value];
    if (/^#([0-9a-fA-F]{3,8})$/.test(value)) return `${prefix}-[${value}]`;
    if (/^rgb[a]?\([\d\s,%.]+\)$/.test(value)) return `${prefix}-[${value.replace(/\s+/g, '_')}]`;
    if (/^hsl[a]?\([\d\s%,.]+\)$/.test(value)) return `${prefix}-[${value.replace(/\s+/g, '_')}]`;
    if (value.startsWith('var(')) return `${prefix}-[${value}]`;
    if (/^[a-z]+-\d+$/.test(value)) return `${prefix}-${value}`;
    return `${prefix}-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

function handleOutlineWidth(): (value: string) => string {
  return (value: string) => {
    const widthMap: Record<string, string> = {
      '0': 'outline-0', '1px': 'outline-[0.0625rem]', '2px': 'outline-[0.125rem]',
      '4px': 'outline-[0.25rem]', '8px': 'outline-[0.5rem]',
    };
    return widthMap[value] ?? `outline-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

function handleOutlineStyle(): (value: string) => string {
  return (value: string) => {
    const styleMap: Record<string, string> = {
      'none': 'outline-none', 'solid': 'outline-[solid]', 'dashed': 'outline-[dashed]',
      'dotted': 'outline-[dotted]', 'double': 'outline-[double]', 'groove': 'outline-[groove]',
      'ridge': 'outline-[ridge]', 'inset': 'outline-[inset]', 'outset': 'outline-[outset]',
    };
    return styleMap[value] ?? `outline-[${spacesToUnderscore(escapeValue(value.trim()))}]`;
  };
}

// ── Color mapping helper (shared by color / outline-color) ──────────

function makeColorMapping(prefix: string): Record<string, string> {
  const colors = ['slate', 'gray', 'red', 'blue', 'green', 'yellow'];
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
  const m: Record<string, string> = { 'black': `${prefix}-black`, 'white': `${prefix}-white` };
  for (const c of colors) {
    for (const s of shades) m[`${c}-${s}`] = `${prefix}-${c}-${s}`;
  }
  m['transparent'] = `${prefix}-transparent`;
  m['current'] = `${prefix}-current`;
  m['inherit'] = `${prefix}-inherit`;
  return m;
}

// ── Main cssToTailwind function ─────────────────────────────────────

type MappingEntry = Record<string, string> | ((value: string) => string | null);

export function cssToTailwind(property: string, value: string): string | null {
  try {
    const mappings: Record<string, MappingEntry> = {
      'position': { 'static': 'static', 'relative': 'relative', 'absolute': 'absolute', 'fixed': 'fixed', 'sticky': 'sticky' },
      'clear': { 'none': 'clear-none', 'left': 'clear-left', 'right': 'clear-right', 'both': 'clear-both' },
      'resize': { 'none': 'resize-none', 'y': 'resize-y', 'x': 'resize-x', 'both': 'resize' },
      'background': (v) => `[background:${spacesToUnderscore(escapeValue(v))}]`,
      'object-fit': { 'contain': 'object-contain', 'cover': 'object-cover', 'fill': 'object-fill', 'none': 'object-none', 'scale-down': 'object-scale-down' },
      'min-height': handleSize('h', 'min'),
      'max-height': handleSize('h', 'max'),
      'min-width': handleSize('w', 'min'),
      'max-width': handleSize('w', 'max'),
      'width': handleSize('w', 'none'),
      'height': handleSize('h', 'none'),
      'padding': () => { throw new Error('padding not expanded'); },
      'padding-top': handleSpacing('padding-top'),
      'padding-right': handleSpacing('padding-right'),
      'padding-bottom': handleSpacing('padding-bottom'),
      'padding-left': handleSpacing('padding-left'),
      'padding-horizontal': handleSpacing('padding-horizontal'),
      'padding-vertical': handleSpacing('padding-vertical'),
      'padding-inline': handleSpacing('padding-inline'),
      'padding-inline-start': handleSpacing('padding-inline-start'),
      'padding-inline-end': handleSpacing('padding-inline-end'),
      'margin': () => { throw new Error('margin not expanded'); },
      'margin-top': handleSpacing('margin-top'),
      'margin-right': handleSpacing('margin-right'),
      'margin-bottom': handleSpacing('margin-bottom'),
      'margin-left': handleSpacing('margin-left'),
      'margin-horizontal': handleSpacing('margin-horizontal'),
      'margin-vertical': handleSpacing('margin-vertical'),
      'margin-inline': handleSpacing('padding-inline'),
      'margin-inline-start': handleSpacing('padding-inline-start'),
      'margin-inline-end': handleSpacing('padding-inline-end'),
      'grid-row-gap': handleGapSpacing('row-gap'),
      'row-gap': handleGapSpacing('row-gap'),
      'grid-column-gap': handleGapSpacing('column-gap'),
      'column-gap': handleGapSpacing('column-gap'),
      'grid-template-columns': handleGridTemplate('grid-template-columns'),
      'grid-template-rows': handleGridTemplate('grid-template-rows'),
      'gap': handleSpacing('gap'),
      'gap-x': handleSpacing('gap-x'),
      'gap-y': handleSpacing('gap-y'),
      'grid-column': () => { throw new Error('grid-column not expanded'); },
      'grid-row': () => { throw new Error('grid-row not expanded'); },
      'grid-template': () => { throw new Error('grid-template not expanded'); },
      'grid-area': () => { throw new Error('grid-area not expanded'); },
      'grid-column-start': handleGridColumnStart(),
      'grid-column-end': handleGridColumnEnd(),
      'grid-row-start': handleGridRowStart(),
      'grid-row-end': handleGridRowEnd(),
      'grid-auto-flow': (v) => {
        const flowMap: Record<string, string> = {
          'row': 'grid-flow-row', 'column': 'grid-flow-col',
          'row dense': 'grid-flow-row-dense', 'column dense': 'grid-flow-col-dense', 'dense': 'grid-flow-dense',
        };
        return flowMap[v] ?? `[grid-auto-flow:${escapeValue(v)}]`;
      },
      'grid-auto-columns': (v) => {
        const map: Record<string, string> = { 'auto': 'grid-auto-cols-auto', 'min-content': 'grid-auto-cols-min', 'max-content': 'grid-auto-cols-max', '1fr': 'grid-auto-cols-fr' };
        return map[v] ?? `grid-auto-cols-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'grid-auto-rows': (v) => {
        const map: Record<string, string> = { 'auto': 'grid-auto-rows-auto', 'min-content': 'grid-auto-rows-min', 'max-content': 'grid-auto-rows-max', '1fr': 'grid-auto-rows-fr' };
        return map[v] ?? `grid-auto-rows-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'grid-gap': (v) => {
        const trimmed = v.trim();
        const predefined = makeSpacingScale('gap');
        return predefined[trimmed] ?? `gap-[${spacesToUnderscore(escapeValue(trimmed))}]`;
      },
      'left': handlePosition('left'),
      'top': handlePosition('top'),
      'right': handlePosition('right'),
      'bottom': handlePosition('bottom'),
      'z-index': (v) => {
        const map: Record<string, string> = { '0': 'z-0', '10': 'z-10', '20': 'z-20', '30': 'z-30', '40': 'z-40', '50': 'z-50', 'auto': 'z-auto' };
        return map[v] ?? `z-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'color': (v) => {
        const map = makeColorMapping('text');
        return map[v] ?? `text-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'outline-color': (v) => {
        const map = makeColorMapping('outline');
        return map[v] ?? `outline-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'outline-width': handleOutlineWidth(),
      'outline-style': handleOutlineStyle(),
      'border-radius': handleBorderRadius('border-radius'),
      'border-top-left-radius': handleBorderRadius('border-top-left-radius'),
      'border-top-right-radius': handleBorderRadius('border-top-right-radius'),
      'border-bottom-left-radius': handleBorderRadius('border-bottom-left-radius'),
      'border-bottom-right-radius': handleBorderRadius('border-bottom-right-radius'),
      'border-top-radius': handleBorderRadius('border-top-radius'),
      'border-right-radius': handleBorderRadius('border-right-radius'),
      'border-bottom-radius': handleBorderRadius('border-bottom-radius'),
      'border-left-radius': handleBorderRadius('border-left-radius'),
      'border': () => { throw new Error('border not expanded'); },
      'border-bottom': () => { throw new Error('border-bottom not expanded'); },
      'border-left': () => { throw new Error('border-left not expanded'); },
      'border-top': () => { throw new Error('border-top not expanded'); },
      'border-right': () => { throw new Error('border-right not expanded'); },
      'border-width': handleBorderWidth('border-width'),
      'border-style': handleBorderStyle('border-style'),
      'border-color': handleBorderColor('border-color'),
      'border-top-width': handleBorderWidth('border-top-width'),
      'border-top-style': handleBorderStyle('border-top-style'),
      'border-top-color': handleBorderColor('border-top-color'),
      'border-right-width': handleBorderWidth('border-right-width'),
      'border-right-style': handleBorderStyle('border-right-style'),
      'border-right-color': handleBorderColor('border-right-color'),
      'border-bottom-width': handleBorderWidth('border-bottom-width'),
      'border-bottom-style': handleBorderStyle('border-bottom-style'),
      'border-bottom-color': handleBorderColor('border-bottom-color'),
      'border-left-width': handleBorderWidth('border-left-width'),
      'border-left-style': handleBorderStyle('border-left-style'),
      'border-left-color': handleBorderColor('border-left-color'),
      'opacity': (v) => {
        const num = parseFloat(v);
        if (isNaN(num)) return `opacity-[${v}]`;
        const pct = Math.round(num * 100);
        const map: Record<number, string> = {
          0:'opacity-0',5:'opacity-5',10:'opacity-10',20:'opacity-20',25:'opacity-25',
          30:'opacity-30',40:'opacity-40',50:'opacity-50',60:'opacity-60',70:'opacity-70',
          75:'opacity-75',80:'opacity-80',90:'opacity-90',95:'opacity-95',100:'opacity-100',
        };
        return map[pct] ?? `[opacity:${spacesToUnderscore(escapeValue(v))}]`;
      },
      'flex': handleFlex(),
      'flex-direction': { 'row': 'flex-row', 'row-reverse': 'flex-row-reverse', 'column': 'flex-col', 'column-reverse': 'flex-col-reverse' },
      'justify-content': {
        'normal': 'justify-normal', 'flex-start': 'justify-start', 'start': 'justify-start', 'left': 'justify-start',
        'flex-end': 'justify-end', 'end': 'justify-end', 'right': 'justify-end', 'center': 'justify-center',
        'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
      },
      'flex-flow': () => { throw new Error('flex-flow not expanded'); },
      'place-self': () => { throw new Error('place-self not expanded'); },
      'align-self': {
        'auto': 'self-auto', 'flex-start': 'self-start', 'flex-end': 'self-end',
        'center': 'self-center', 'stretch': 'self-stretch', 'baseline': 'self-baseline',
        'initial': '[align-self:initial]', 'inherit': '[align-self:inherit]',
      },
      'justify-self': {
        'auto': 'justify-self-auto', 'start': 'justify-self-start', 'end': 'justify-self-end',
        'center': 'justify-self-center', 'stretch': 'justify-self-stretch',
        'initial': '[justify-self:initial]', 'inherit': '[justify-self:inherit]',
        'baseline': 'justify-self-baseline', 'first baseline': 'justify-self-first', 'last baseline': 'justify-self-last',
      },
      'overflow': { 'visible': 'overflow-visible', 'hidden': 'overflow-hidden', 'auto': 'overflow-auto', 'scroll': 'overflow-scroll', 'clip': 'overflow-clip' },
      'overflow-x': { 'visible': 'overflow-x-visible', 'hidden': 'overflow-x-hidden', 'auto': 'overflow-x-auto', 'scroll': 'overflow-x-scroll', 'clip': 'overflow-x-clip' },
      'overflow-y': { 'visible': 'overflow-y-visible', 'hidden': 'overflow-y-hidden', 'auto': 'overflow-y-auto', 'scroll': 'overflow-y-scroll', 'clip': 'overflow-y-clip' },
      'float': { 'left': 'float-left', 'right': 'float-right', 'none': 'float-none' },
      'line-break': { 'normal': 'break-normal', 'anywhere': 'break-anywhere', 'keep-all': 'break-keep' },
      'font-weight': {
        '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal',
        '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
        'thin': 'font-thin', 'extralight': 'font-extralight', 'light': 'font-light', 'normal': 'font-normal',
        'medium': 'font-medium', 'semibold': 'font-semibold', 'bold': 'font-bold', 'extrabold': 'font-extrabold', 'black': 'font-black',
      },
      'font-style': (v) => {
        const map: Record<string, string> = { 'normal': 'not-italic', 'italic': 'italic' };
        return map[v] ?? `[font-style:${escapeValue(v)}]`;
      },
      'font-feature-settings': (v) => {
        const map: Record<string, string> = {
          '"liga" 0': 'font-ligatures-none', '"liga" 1': 'font-ligatures-normal', 'normal': 'font-normal',
          '"kern"': 'font-kerning-auto', '"kern" 0': 'font-kerning-none', '"kern" 1': 'font-kerning-normal',
          '"clig" 0': 'font-common-ligatures-none', '"clig" 1': 'font-common-ligatures-normal',
        };
        return map[v] ?? `[font-feature-settings:${spacesToUnderscore(escapeValue(v))}]`;
      },
      'font-variation-settings': (v) => v === 'normal' ? 'font-normal' : `[font-variation-settings:${spacesToUnderscore(escapeValue(v))}]`,
      'text-align': { 'left': 'text-left', 'right': 'text-right', 'center': 'text-center', 'justify': 'text-justify' },
      'text-transform': { 'none': 'normal-case', 'capitalize': 'capitalize', 'uppercase': 'uppercase', 'lowercase': 'lowercase' },
      'text-decoration-style': { 'solid': 'decoration-solid', 'double': 'decoration-double', 'dotted': 'decoration-dotted', 'dashed': 'decoration-dashed', 'wavy': 'decoration-wavy' },
      'text-decoration-thickness': (v) => {
        const map: Record<string, string> = {
          'auto': 'decoration-auto', 'from-font': 'decoration-from-font',
          '0': 'decoration-0', '0px': 'decoration-0', '1px': 'decoration-1', '2px': 'decoration-2', '4px': 'decoration-4', '8px': 'decoration-8',
        };
        return map[v] ?? `decoration-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'text-wrap': {
        'balance': 'text-balance', 'pretty': 'text-pretty', 'nowrap': 'text-nowrap', 'wrap': 'text-wrap',
        'normal': '[text-wrap:normal]', 'initial': '[text-wrap:initial]', 'inherit': '[text-wrap:inherit]',
      },
      'scrollbar-width': { 'none': 'hide-scrollbar', 'thin': 'scrollbar-thin', 'auto': 'scrollbar' },
      'vertical-align': (v) => {
        const map: Record<string, string> = {
          'baseline': 'align-baseline', 'top': 'align-top', 'middle': 'align-middle', 'bottom': 'align-bottom',
          'text-top': 'align-text-top', 'text-bottom': 'align-text-bottom', 'sub': 'align-sub', 'super': 'align-super',
        };
        return map[v] ?? `align-[${escapeValue(v)}]`;
      },
      'line-height': (v) => {
        const map: Record<string, string> = {
          '1': 'leading-none', '1.25': 'leading-tight', '1.375': 'leading-snug', '1.5': 'leading-normal',
          '1.625': 'leading-relaxed', '2': 'leading-loose',
          '0.75rem': 'leading-3', '1rem': 'leading-4', '1.25rem': 'leading-5', '1.5rem': 'leading-6',
          '1.75rem': 'leading-7', '2rem': 'leading-8', '2.25rem': 'leading-9', '2.5rem': 'leading-10',
        };
        return map[v] ?? `leading-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'border-collapse': {
        'collapse': 'border-collapse', 'separate': 'border-separate',
        'inherit': '[border-collapse:inherit]', 'initial': '[border-collapse:initial]',
        'revert': '[border-collapse:revert]', 'unset': '[border-collapse:unset]',
      },
      'caption-side': {
        'top': 'caption-top', 'bottom': 'caption-bottom',
        'inherit': '[caption-side:inherit]', 'initial': '[caption-side:initial]',
        'revert': '[caption-side:revert]', 'unset': '[caption-side:unset]',
      },
      'empty-cells': {
        'show': '[empty-cells:show]', 'hide': '[empty-cells:hide]',
        'inherit': '[empty-cells:inherit]', 'initial': '[empty-cells:initial]',
        'revert': '[empty-cells:revert]', 'unset': '[empty-cells:unset]',
      },
      'text-indent': (v) => {
        if (v === '0' || v === '0px') return 'indent-0';
        if (v.startsWith('-')) return `-indent-[${spacesToUnderscore(escapeValue(v.slice(1)))}]`;
        return `indent-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'border-spacing': (v) => {
        if (!v.includes(' ')) {
          if (v === '0' || v === '0px') return 'border-spacing-0';
          return `border-spacing-[${spacesToUnderscore(escapeValue(v))}]`;
        }
        const [x, y] = v.split(' ').map(s => s.trim());
        if (x === y) {
          if (x === '0' || x === '0px') return 'border-spacing-0';
          return `border-spacing-[${spacesToUnderscore(escapeValue(x))}]`;
        }
        const xClass = (x === '0' || x === '0px') ? 'border-spacing-x-0' : `border-spacing-x-[${spacesToUnderscore(escapeValue(x))}]`;
        const yClass = (y === '0' || y === '0px') ? 'border-spacing-y-0' : `border-spacing-y-[${spacesToUnderscore(escapeValue(y))}]`;
        return `${xClass} ${yClass}`;
      },
      'text-decoration': { 'underline': 'underline', 'overline': 'overline', 'line-through': 'line-through', 'none': 'no-underline' },
      'text-decoration-line': { 'underline': 'underline', 'overline': 'overline', 'line-through': 'line-through', 'none': 'no-underline' },
      'text-decoration-color': (v) => `decoration-[${spacesToUnderscore(escapeValue(v))}]`,
      'text-underline-offset': (v) => {
        const map: Record<string, string> = {
          'auto': 'underline-offset-auto', '0': 'underline-offset-0', '0px': 'underline-offset-0',
          '1px': 'underline-offset-1', '2px': 'underline-offset-2', '4px': 'underline-offset-4', '8px': 'underline-offset-8',
        };
        return map[v] ?? `underline-offset-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'text-decoration-skip-ink': (v) => `[text-decoration-skip-ink:${spacesToUnderscore(escapeValue(v))}]`,
      'transform': () => { throw new Error('transform has special function'); },
      'aspect-ratio': (v) => {
        const map: Record<string, string> = { 'auto': 'aspect-auto', '1/1': 'aspect-square', 'square': 'aspect-square', '16/9': 'aspect-video' };
        if (map[v]) return map[v];
        if (/^\d+$/.test(v)) return `aspect-[${v}/1]`;
        return `aspect-[${v}]`;
      },
      'transition-duration': (v) => {
        const map: Record<string, string> = {
          '75ms': 'duration-75', '100ms': 'duration-100', '150ms': 'duration-150', '200ms': 'duration-200',
          '300ms': 'duration-300', '500ms': 'duration-500', '700ms': 'duration-700', '1000ms': 'duration-1000',
        };
        return map[v] ?? `duration-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'transition-property': (v) => {
        const map: Record<string, string> = {
          'none': 'transition-none', 'all': 'transition-all', 'colors': 'transition-colors',
          'opacity': 'transition-opacity', 'shadow': 'transition-shadow', 'transform': 'transition-transform',
          'height': 'transition-[height]', 'width': 'transition-[width]', 'spacing': 'transition-[spacing]', 'default': 'transition',
        };
        return map[v] ?? `transition-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'transition-timing-function': (v) => {
        const map: Record<string, string> = {
          'linear': 'ease-linear', 'ease': 'ease-in-out', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out',
        };
        return map[v] ?? `ease-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'transition': (v) => {
        const map: Record<string, string> = {
          'none': 'transition-none', 'all': 'transition-all', 'colors': 'transition-colors',
          'opacity': 'transition-opacity', 'shadow': 'transition-shadow', 'transform': 'transition-transform',
        };
        return map[v] ?? `[transition:${v.replace(/\s+/g, '_')}]`;
      },
      'animation': (v) => `[animation:${spacesToUnderscore(escapeValue(v.trim()))}]`,
      'animation-timing-function': (v) => `[animation-timing-function:${spacesToUnderscore(escapeValue(v))}]`,
      'animation-duration': (v) => `[animation-duration:${spacesToUnderscore(escapeValue(v))}]`,
      'animation-delay': (v) => `[animation-delay:${spacesToUnderscore(escapeValue(v))}]`,
      'animation-iteration-count': (v) => `[animation-iteration-count:${escapeValue(v)}]`,
      'animation-direction': (v) => `[animation-direction:${escapeValue(v)}]`,
      'animation-fill-mode': (v) => `[animation-fill-mode:${escapeValue(v)}]`,
      'animation-play-state': (v) => `[animation-play-state:${escapeValue(v)}]`,
      'animation-name': (v) => v === 'none' ? 'animate-none' : `[animation-name:${spacesToUnderscore(escapeValue(v))}]`,
      'animation-composition': (v) => `[animation-composition:${escapeValue(v)}]`,
      'animation-timeline': (v) => `[animation-timeline:${escapeValue(v)}]`,
      'mix-blend-mode': {
        'normal': 'mix-blend-normal', 'multiply': 'mix-blend-multiply', 'screen': 'mix-blend-screen',
        'overlay': 'mix-blend-overlay', 'darken': 'mix-blend-darken', 'lighten': 'mix-blend-lighten',
        'color-dodge': 'mix-blend-color-dodge', 'color-burn': 'mix-blend-color-burn',
        'difference': 'mix-blend-difference', 'exclusion': 'mix-blend-exclusion',
      },
      'text-overflow': { 'ellipsis': 'text-ellipsis', 'clip': 'text-clip' },
      'word-break': { 'break-all': 'break-all', 'break-word': 'break-words', 'normal': 'break-normal' },
      'isolation': { 'isolate': 'isolate', 'auto': 'isolation-auto' },
      'white-space': { 'normal': 'whitespace-normal', 'nowrap': 'whitespace-nowrap', 'pre': 'whitespace-pre', 'pre-line': 'whitespace-pre-line', 'pre-wrap': 'whitespace-pre-wrap' },
      'will-change': { 'auto': '[will-change:auto]', 'scroll-position': '[will-change:scroll-position]', 'contents': '[will-change:contents]', 'transform': '[will-change:transform]' },
      'transform-style': { 'flat': '[transform-style:flat]', 'preserve-3d': '[transform-style:preserve-3d]' },
      'box-shadow': (v) => {
        const map: Record<string, string> = {
          '0 1px 2px 0 rgba(0, 0, 0, 0.05)': 'shadow-sm', '0 1px 3px 0 rgba(0, 0, 0, 0.1)': 'shadow',
          '0 4px 6px -1px rgba(0, 0, 0, 0.1)': 'shadow-md', '0 10px 15px -3px rgba(0, 0, 0, 0.1)': 'shadow-lg',
          '0 20px 25px -5px rgba(0, 0, 0, 0.1)': 'shadow-xl', '0 25px 50px -12px rgba(0, 0, 0, 0.25)': 'shadow-2xl',
          'inset 0 2px 4px 0 rgba(0,0,0,0.05)': 'shadow-inner', 'none': 'shadow-none',
        };
        return map[v] ?? `shadow-[${v.replace(/\s+/g, '_')}]`;
      },
      'font-family': (v) => {
        const builtIn: Record<string, string> = { 'sans-serif': 'font-sans', 'serif': 'font-serif', 'monospace': 'font-mono' };
        const families = v.split(',').map(f => f.trim());
        if (families.length === 1) {
          const single = families[0].toLowerCase();
          if (builtIn[single]) return builtIn[single];
          const isMultiWord = /\s/.test(families[0]);
          const isQuoted = (families[0].startsWith("'") && families[0].endsWith("'")) || (families[0].startsWith('"') && families[0].endsWith('"'));
          const finalFamily = isMultiWord && !isQuoted ? `'${families[0]}'` : families[0];
          return `font-[${finalFamily}]`;
        }
        const parsed = families.map(fam => {
          const lower = fam.toLowerCase();
          if (builtIn[lower]) return lower;
          const isMultiWord = /\s/.test(fam);
          const isQuoted = (fam.startsWith("'") && fam.endsWith("'")) || (fam.startsWith('"') && fam.endsWith('"'));
          return isMultiWord && !isQuoted ? `'${fam}'` : fam;
        });
        return `font-[${parsed.join(',')}]`;
      },
      'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
      'flex-wrap': { 'nowrap': 'flex-nowrap', 'wrap': 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse' },
      'flex-basis': (v) => {
        v = v.trim();
        const map: Record<string, string> = {
          'auto': 'basis-auto', '0': 'basis-0', '1': 'basis-1', '0px': 'basis-0',
          '0.5': 'basis-1/2', '0.25': 'basis-1/4', '0.33': 'basis-1/3', '0.66': 'basis-2/3', '0.75': 'basis-3/4',
          '1.0': 'basis-full', '100%': 'basis-full', '50%': 'basis-1/2',
          '33.333333%': 'basis-1/3', '66.666667%': 'basis-2/3', '25%': 'basis-1/4', '75%': 'basis-3/4',
        };
        if (map[v]) return map[v];
        const numericValue = parseFloat(v.replace('%', '')) / 100;
        if (map[numericValue.toString()]) return map[numericValue.toString()];
        return `basis-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'flex-grow': (v) => {
        v = v.trim();
        const map: Record<string, string> = {
          '0': 'grow-0', '1': 'grow', 'auto': '[flex-grow:auto]',
          'initial': 'grow-0', 'inherit': '[flex-grow:inherit]', 'unset': '[flex-grow:unset]',
        };
        return map[v] ?? `grow-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'column-count': (v) => {
        const map: Record<string, string> = {
          ...Object.fromEntries(Array.from({length: 12}, (_, i) => [`${i+1}`, `columns-${i+1}`])),
          'auto': 'columns-auto', 'initial': '[column-count:initial]', 'inherit': '[column-count:inherit]',
        };
        return map[v] ?? `columns-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'flex-shrink': (v) => {
        const map: Record<string, string> = { '0': 'shrink-0', '1': 'shrink', 'initial': 'shrink-0', 'inherit': '[flex-shrink:inherit]' };
        return map[v] ?? `shrink-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'align-items': {
        'stretch': 'items-stretch', 'flex-start': 'items-start', 'flex-end': 'items-end',
        'center': 'items-center', 'baseline': 'items-baseline',
        'initial': '[align-items:initial]', 'inherit': '[align-items:inherit]',
      },
      'align-content': {
        'normal': 'content-normal', 'center': 'content-center', 'start': 'content-start', 'end': 'content-end',
        'flex-start': 'content-start', 'flex-end': 'content-end',
        'space-between': 'content-between', 'space-around': 'content-around', 'space-evenly': 'content-evenly',
        'baseline': 'content-baseline', 'stretch': 'content-stretch',
        'initial': '[align-content:initial]', 'inherit': '[align-content:inherit]',
      },
      'cursor': {
        'auto': 'cursor-auto', 'default': 'cursor-default', 'pointer': 'cursor-pointer', 'wait': 'cursor-wait',
        'text': 'cursor-text', 'move': 'cursor-move', 'not-allowed': 'cursor-not-allowed', 'help': 'cursor-help',
        'progress': 'cursor-progress', 'cell': 'cursor-cell', 'crosshair': 'cursor-crosshair',
        'vertical-text': 'cursor-vertical-text', 'alias': 'cursor-alias', 'copy': 'cursor-copy',
        'no-drop': 'cursor-no-drop', 'grab': 'cursor-grab', 'grabbing': 'cursor-grabbing',
        'all-scroll': 'cursor-all-scroll', 'col-resize': 'cursor-col-resize', 'row-resize': 'cursor-row-resize',
        'n-resize': 'cursor-n-resize', 'e-resize': 'cursor-e-resize', 's-resize': 'cursor-s-resize', 'w-resize': 'cursor-w-resize',
        'ne-resize': 'cursor-ne-resize', 'nw-resize': 'cursor-nw-resize', 'se-resize': 'cursor-se-resize', 'sw-resize': 'cursor-sw-resize',
        'ew-resize': 'cursor-ew-resize', 'ns-resize': 'cursor-ns-resize', 'nesw-resize': 'cursor-nesw-resize', 'nwse-resize': 'cursor-nwse-resize',
        'zoom-in': 'cursor-zoom-in', 'zoom-out': 'cursor-zoom-out',
      },
      'user-select': {
        'none': 'select-none', 'auto': 'select-auto', 'text': 'select-text', 'all': 'select-all',
      },
      '-webkit-user-select': {
        'none': 'select-none', 'auto': 'select-auto', 'text': 'select-text', 'all': 'select-all',
      },
      'outline': (v) => {
        const map: Record<string, string> = {
          '0': 'outline-none', 'none': 'outline-none', '1px solid': 'outline', '2px solid': 'outline-2',
          '4px solid': 'outline-4', '8px solid': 'outline-8', 'solid': 'outline', 'dashed': 'outline-dashed',
          'dotted': 'outline-dotted', 'double': 'outline-double', 'hidden': 'outline-none',
          'inherit': '[outline:inherit]', 'initial': '[outline:initial]', 'revert': '[outline:revert]',
          'unset': '[outline:unset]', 'auto': '[outline:auto]',
        };
        if (v.includes('offset')) return `outline-offset-[${v}]`;
        if (map[v]) return map[v];
        const parts = v.split(' ');
        if (parts.length >= 2) {
          if (parts[0].endsWith('px') && parts[1] === 'solid') {
            const px = parts[0].replace('px', '');
            if (['1', '2', '4', '8'].includes(px)) return px === '1' ? 'outline' : `outline-${px}`;
          }
          if (['solid', 'dashed', 'dotted', 'double'].includes(parts[0])) return `outline-${parts[0]}`;
        }
        return `outline-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'outline-offset': (v) => {
        const map: Record<string, string> = { '0': 'outline-offset-0', '1': 'outline-offset-1', '2': 'outline-offset-2', '4': 'outline-offset-4', '8': 'outline-offset-8' };
        return map[v] ?? `outline-offset-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'inset': (v) => {
        const map: Record<string, string> = {
          '0': 'inset-0', '0px': 'inset-0', 'auto': 'inset-auto', '50%': 'inset-1/2', '100%': 'inset-full',
          ...Object.fromEntries(['1','2','3','4','5','6','8','10','12','16','20','24','32','36','40','44','48','52','56','60','64','72','80','96'].map(n => [n, `inset-${n}`])),
          '25%': 'inset-1/4', '33%': 'inset-1/3', '33.333333%': 'inset-1/3', '66.666667%': 'inset-2/3', '75%': 'inset-3/4',
          'initial': '[inset:initial]', 'inherit': '[inset:inherit]',
        };
        if (v.startsWith('-')) {
          const pos = v.slice(1);
          if (map[pos]) return `-${map[pos]}`;
        }
        if (map[v]) return map[v];
        if (v.endsWith('px')) { const n = v.replace('px', ''); if (map[n]) return map[n]; }
        if (v.endsWith('rem')) { const r = parseFloat(v) * 4; if (map[r.toString()]) return map[r.toString()]; }
        return `inset-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'display': {
        'none': 'hidden', 'block': 'block', 'inline-block': 'inline-block', 'inline': 'inline',
        'flex': 'flex', 'inline-flex': 'inline-flex', 'grid': 'grid', 'inline-grid': 'inline-grid',
        'contents': 'contents', 'list-item': 'list-item', 'table': 'table', 'table-row': 'table-row', 'table-cell': 'table-cell',
      },
      'visibility': (v) => {
        const map: Record<string, string> = { 'visible': 'visible', 'hidden': 'invisible' };
        return map[v] ?? `[visibility:${escapeValue(v)}]`;
      },
      'list-style': (v) => `[list-style:${escapeValue(v)}]`,
      'list-style-type': (v) => {
        const map: Record<string, string> = { 'none': 'list-none', 'disc': 'list-disc', 'decimal': 'list-decimal' };
        return map[v] ?? `[list-style-type:${spacesToUnderscore(escapeValue(v))}]`;
      },
      'list-style-position': (v) => {
        const map: Record<string, string> = { 'inside': 'list-inside', 'outside': 'list-outside' };
        return map[v] ?? `[list-style-position:${spacesToUnderscore(escapeValue(v))}]`;
      },
      'list-style-image': (v) => {
        const trimmed = v.trim();
        if (trimmed === 'none') return '[list-style-image:none]';
        const urlMatch = trimmed.match(/^url\((['"]?)(.*?)\1\)$/);
        if (urlMatch) return `list-[url('${urlMatch[2].replace(/'/g, "\\'")}')]`;
        return `[list-style-image:${escapeValue(trimmed)}]`;
      },
      'font-size': (v) => {
        const map: Record<string, string> = {
          '0.75rem': 'text-xs', '0.875rem': 'text-sm', '1rem': 'text-base', '1.125rem': 'text-lg',
          '1.25rem': 'text-xl', '1.5rem': 'text-2xl', '1.875rem': 'text-3xl', '2.25rem': 'text-4xl',
          '3rem': 'text-5xl', '3.75rem': 'text-6xl', '4.5rem': 'text-7xl', '6rem': 'text-8xl', '8rem': 'text-9xl',
        };
        if (map[v]) return map[v];
        const prefix = v.startsWith('var') ? 'length:' : '';
        return `text-[${prefix}${spacesToUnderscore(escapeValue(v))}]`;
      },
      'letter-spacing': (v) => {
        if (v === 'normal' || v === '0') return 'tracking-normal';
        const predefined = [
          { value: -0.05, class: 'tracking-tighter' }, { value: -0.025, class: 'tracking-tight' },
          { value: 0, class: 'tracking-normal' }, { value: 0.025, class: 'tracking-wide' },
          { value: 0.05, class: 'tracking-wider' }, { value: 0.1, class: 'tracking-widest' },
        ];
        let emValue: number | null = null;
        if (v.endsWith('px')) emValue = parseFloat(v) / 16;
        else if (v.endsWith('em')) emValue = parseFloat(v);
        else return `tracking-[${spacesToUnderscore(escapeValue(v))}]`;

        let closest: { class: string; diff: number } | null = null;
        for (const p of predefined) {
          const diff = p.value === 0 && emValue === 0 ? 0 :
            (p.value === 0 || emValue === 0) ? Infinity :
            Math.abs((emValue - p.value) / emValue) * 100;
          if (!closest || diff < closest.diff) closest = { class: p.class, diff };
        }
        return closest && closest.diff <= 3 ? closest.class : `tracking-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'fill': (v) => {
        const map: Record<string, string> = {
          'none': 'fill-none', 'currentColor': 'fill-current', 'current': 'fill-current',
          'inherit': 'fill-inherit', 'transparent': 'fill-transparent', 'black': 'fill-black', 'white': 'fill-white',
        };
        if (map[v]) return map[v];
        return `fill-[${spacesToUnderscore(escapeValue(v))}]`;
      },
      'break-inside': {
        'auto': 'break-inside-auto', 'avoid': 'break-inside-avoid',
        'avoid-page': 'break-inside-avoid-page', 'avoid-column': 'break-inside-avoid-column',
        'initial': '[break-inside:initial]', 'inherit': '[break-inside:inherit]',
      },
      'background-color': (v) => {
        const map: Record<string, string> = {
          'transparent': 'bg-transparent', 'currentColor': 'bg-current', 'black': 'bg-black', 'white': 'bg-white', 'none': 'bg-none',
        };
        const trimmed = v.trim();
        if (map[trimmed]) return map[trimmed];
        if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed) || /^rgb/.test(trimmed) || /^hsl/.test(trimmed)) {
          return `bg-[${escapeValue(trimmed).replace(/\s+/g, '_')}]`;
        }
        if (/^var\(--.*\)$/.test(trimmed)) return `bg-[${escapeValue(trimmed)}]`;
        return `bg-[${escapeValue(trimmed).replace(/\s+/g, '_')}]`;
      },
      'background-image': (v) => {
        if (v === 'none') return 'bg-none';
        if (v.startsWith('url(')) {
          const urlMatch = v.match(/^url\((['"]?)(.*?)\1\)$/);
          if (urlMatch) {
            const escapedUrl = spacesToUnderscore(urlMatch[2].replace(/\s+/g, '_').replace(/([\[\]'"`\\])/g, '\\$1'));
            return `bg-[url('${escapedUrl}')]`;
          }
          return `bg-[${spacesToUnderscore(v.replace(/([\[\]'"`\\])/g, '\\$1'))}]`;
        }
        if (/^(linear-gradient|radial-gradient|repeating-linear-gradient|repeating-radial-gradient)/.test(v)) {
          return `bg-[${spacesToUnderscore(v.replace(/([\[\]'"`\\])/g, '\\$1'))}]`;
        }
        return `[background-image:${spacesToUnderscore(v.replace(/([\[\]'"`\\])/g, '\\$1'))}]`;
      },
      'mask-image': (v) => {
        v = v.trim();
        if (v === 'none') return 'mask-none';
        if (v.startsWith('url(')) {
          const urlMatch = v.match(/^url\((['"]?)(.*?)\1\)$/);
          if (urlMatch) {
            const url = urlMatch[2].replace(/'/g, "\\'").replace(/\s+/g, '_');
            return `mask-[url('${url}')]`;
          }
          return `mask-[${escapeValue(v)}]`;
        }
        const escaped = escapeValue(v).replace(/\s+/g, '_');
        if (/^(linear-gradient|radial-gradient|repeating-linear-gradient|repeating-radial-gradient)/.test(v)) {
          return `mask-[${escaped}]`;
        }
        return `[mask-image:${escaped}]`;
      },
      'background-repeat': (v) => {
        const map: Record<string, string> = {
          'repeat': 'bg-repeat', 'no-repeat': 'bg-no-repeat', 'repeat-x': 'bg-repeat-x',
          'repeat-y': 'bg-repeat-y', 'round': 'bg-repeat-round', 'space': 'bg-repeat-space',
        };
        return map[v] ?? `[background-repeat:${escapeValue(v)}]`;
      },
      'background-position': (v) => {
        const map: Record<string, string> = {
          'bottom': 'bg-bottom', 'center': 'bg-center', 'left': 'bg-left',
          'left bottom': 'bg-left-bottom', 'left top': 'bg-left-top', 'right': 'bg-right',
          'right bottom': 'bg-right-bottom', 'right top': 'bg-right-top', 'top': 'bg-top',
        };
        return map[v] ?? `[background-position:${escapeValue(v)}]`;
      },
      'background-size': (v) => {
        const map: Record<string, string> = { 'auto': 'bg-auto', 'cover': 'bg-cover', 'contain': 'bg-contain' };
        return map[v] ?? `[background-size:${escapeValue(v)}]`;
      },
      'background-attachment': (v) => {
        const map: Record<string, string> = { 'fixed': 'bg-fixed', 'local': 'bg-local', 'scroll': 'bg-scroll' };
        return map[v] ?? `[background-attachment:${escapeValue(v)}]`;
      },
      'background-origin': (v) => {
        const map: Record<string, string> = { 'border-box': 'bg-origin-border', 'padding-box': 'bg-origin-padding', 'content-box': 'bg-origin-content' };
        return map[v] ?? `[background-origin:${escapeValue(v)}]`;
      },
      'background-clip': (v) => {
        const map: Record<string, string> = { 'border-box': 'bg-clip-border', 'padding-box': 'bg-clip-padding', 'content-box': 'bg-clip-content', 'text': 'bg-clip-text' };
        return map[v] ?? `[background-clip:${escapeValue(v)}]`;
      },
      'clip-path': (v) => `[clip-path:${spacesToUnderscore(escapeValue(v))}]`,
      '-webkit-text-stroke-width': (v) => `[-webkit-text-stroke-width:${spacesToUnderscore(escapeValue(v.trim()))}]`,
      '-webkit-text-stroke-color': (v) => `[-webkit-text-stroke-color:${spacesToUnderscore(escapeValue(v.trim()))}]`,
      '-webkit-text-fill-color': (v) => v === 'transparent' ? 'text-transparent' : `[--webkit-text-fill-color:${escapeValue(v)}]`,
      '-webkit-background-clip': (v) => {
        const map: Record<string, string> = { 'border-box': 'bg-clip-border', 'padding-box': 'bg-clip-padding', 'content-box': 'bg-clip-content', 'text': 'bg-clip-text' };
        return map[v] ?? `[--webkit-background-clip:${escapeValue(v)}]`;
      },
    };

    // Handle !important
    let importantSetting = '';
    if (value.includes('!important')) {
      value = value.replace(/\s*!important\s*/g, '').trim();
      importantSetting = '!';
    }

    // Skip empty values — don't produce broken classes like bg-[] or text-[]
    if (!value || value.trim() === '') return null;

    // Handle vendor prefixes (except specific ones handled above)
    if (property !== '-webkit-text-fill-color' && property !== '-webkit-background-clip' &&
        property !== '-webkit-text-stroke-color' && property !== '-webkit-text-stroke-width') {
      const vendorPrefixes = ['-webkit-', '-moz-', '-ms-', '-o-'];
      for (const pfx of vendorPrefixes) {
        if (property.startsWith(pfx)) return null;
      }
    }

    const mapping = mappings[property];

    if (mapping) {
      if (typeof mapping === 'function') {
        const tailwindClass = mapping(value);
        return tailwindClass ? `${importantSetting}${tailwindClass}` : null;
      } else if (typeof mapping === 'object') {
        const tailwindClass = (mapping as Record<string, string>)[value];
        if (tailwindClass) return `${importantSetting}${tailwindClass}`;
        return `${importantSetting}[${property}:${value}]`;
      }
      return `${importantSetting}${property}-[${value}]`;
    }

    // Unsupported property fallback
    const tailwindProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return `${importantSetting}${tailwindProperty}-[${value}]`;
  } catch (error) {
    console.warn(`cssToTailwind error for ${property}: ${value}`, error);
    return null;
  }
}

// ── getBestTailwindClasses ──────────────────────────────────────────

export function getBestTailwindClasses(property: string, pOverwritten: Record<string, string>): string[] {
  const sides = ['top', 'right', 'bottom', 'left'];
  const sideValues: Record<string, string> = {};
  for (const side of sides) {
    sideValues[side] = pOverwritten[`${property}-${side}`];
  }
  const values = sides.map(s => sideValues[s]);
  const allSame = values.every(v => v === values[0]);

  const tailwindSpacingScale: Record<string, string> = {
    '0px': '0', '0.125rem': '0.5', '0.25rem': '1', '0.375rem': '1.5', '0.5rem': '2', '0.625rem': '2.5',
    '0.75rem': '3', '0.875rem': '3.5', '1rem': '4', '1.25rem': '5', '1.5rem': '6', '1.75rem': '7',
    '2rem': '8', '2.25rem': '9', '2.5rem': '10', '2.75rem': '11', '3rem': '12', '3.5rem': '14',
    '4rem': '16', '5rem': '20', '6rem': '24', '7rem': '28', '8rem': '32', '9rem': '36',
    '10rem': '40', '11rem': '44', '12rem': '48', '13rem': '52', '14rem': '56', '15rem': '60',
    '16rem': '64', '18rem': '72', '20rem': '80', '24rem': '96',
  };

  function mapValueToTailwind(val: string): string {
    if (val === '0' || val === '0px') return '0';
    if (val === 'auto') return 'auto';
    let remValue = val;
    if (val.endsWith('px')) {
      remValue = `${parseFloat(val.replace('px', '')) / 16}rem`;
    } else if (!val.endsWith('rem')) {
      return `[${val}]`;
    }
    return tailwindSpacingScale[remValue] ?? `[${val}]`;
  }

  function generateTailwindClass(prefix: string, val: string): string {
    const tw = mapValueToTailwind(val);
    return tw === 'auto' ? `${prefix}-auto` : `${prefix}-${tw}`;
  }

  const tailClasses: string[] = [];
  const isMargin = property === 'margin';
  const basePrefix = isMargin ? 'm' : 'p';

  if (allSame) {
    tailClasses.push(generateTailwindClass(basePrefix, values[0]));
  } else {
    const topBottomSame = sideValues.top === sideValues.bottom;
    const leftRightSame = sideValues.left === sideValues.right;

    if (topBottomSame && leftRightSame) {
      tailClasses.push(generateTailwindClass(`${basePrefix}y`, sideValues.top));
      tailClasses.push(generateTailwindClass(`${basePrefix}x`, sideValues.left));
    } else {
      if (topBottomSame) {
        tailClasses.push(generateTailwindClass(`${basePrefix}y`, sideValues.top));
      } else {
        tailClasses.push(generateTailwindClass(`${basePrefix}t`, sideValues.top));
        tailClasses.push(generateTailwindClass(`${basePrefix}b`, sideValues.bottom));
      }
      if (leftRightSame) {
        tailClasses.push(generateTailwindClass(`${basePrefix}x`, sideValues.left));
      } else {
        tailClasses.push(generateTailwindClass(`${basePrefix}r`, sideValues.right));
        tailClasses.push(generateTailwindClass(`${basePrefix}l`, sideValues.left));
      }
    }
  }

  return tailClasses;
}

// ── getTransformClasses ─────────────────────────────────────────────

function hasConflictingTransforms(classes: string[]): boolean {
  const groups: Record<string, string[]> = { scale: [], scaleX: [], scaleY: [] };
  for (const cls of classes) {
    if (cls.includes('scale-') && !cls.includes('scale-x-') && !cls.includes('scale-y-')) groups.scale.push(cls);
    else if (cls.includes('scale-x-')) groups.scaleX.push(cls);
    else if (cls.includes('scale-y-')) groups.scaleY.push(cls);
  }
  return Object.values(groups).some(g => g.length > 1);
}

function getMultipleTransformClasses(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === 'none') return ['transform-none'];
  const transforms = trimmed.match(/(\w+\([^)]+\))/gi);
  if (!transforms) return [`[transform:${spacesToUnderscore(escapeValue(trimmed))}]`];

  const funcs: string[] = [];
  for (const transform of transforms) {
    const match = transform.match(/(\w+)\(([^)]+)\)/i);
    if (!match) { funcs.push(transform.trim()); continue; }
    const [, func, val] = match;
    funcs.push(`${func}(${spacesToUnderscore(escapeValue(val.trim()))})`);
  }
  return [`[transform:${funcs.join('_')}]`];
}

export function getTransformClasses(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === 'none') return ['transform-none'];

  const transforms = trimmed.match(/(\w+\([^)]+\))/gi);
  if (!transforms) return [`[transform:${escapeValue(trimmed)}]`];

  const classes: string[] = [];
  for (const transform of transforms) {
    const match = transform.match(/(\w+)\(([^)]+)\)/i);
    if (!match) { classes.push(`[transform:${spacesToUnderscore(escapeValue(transform.trim()))}]`); continue; }

    const [, func, val] = match;
    const numericValue = parseFloat(val);
    const funcLower = func.toLowerCase();

    switch (funcLower) {
      case 'translate': {
        const vals = val.split(',').map(v => v.trim());
        if (vals.length === 2) {
          const [xVal, yVal] = vals;
          const xNum = parseFloat(xVal);
          const yNum = parseFloat(yVal);

          if (xVal === '-50%' && yVal === '-50%') { classes.push('-translate-x-1/2', '-translate-y-1/2'); break; }

          // Handle X
          if (xNum === 50 && xVal.includes('%')) classes.push('translate-x-1/2');
          else if (xNum === -50 && xVal.includes('%')) classes.push('-translate-x-1/2');
          else if (xNum === 100 && xVal.includes('%')) classes.push('translate-x-full');
          else if (xNum === -100 && xVal.includes('%')) classes.push('-translate-x-full');
          else if (xNum < 0) classes.push(`-translate-x-[${Math.abs(xNum)}${xVal.replace(xNum.toString(), '')}]`);
          else classes.push(`translate-x-[${xVal}]`);

          // Handle Y
          if (yNum === 50 && yVal.includes('%')) classes.push('translate-y-1/2');
          else if (yNum === -50 && yVal.includes('%')) classes.push('-translate-y-1/2');
          else if (yNum === 100 && yVal.includes('%')) classes.push('translate-y-full');
          else if (yNum === -100 && yVal.includes('%')) classes.push('-translate-y-full');
          else if (yNum < 0) classes.push(`-translate-y-[${Math.abs(yNum)}${yVal.replace(yNum.toString(), '')}]`);
          else classes.push(`translate-y-[${yVal}]`);
        }
        break;
      }
      case 'translatex': {
        if (numericValue === 0) { classes.push('translate-x-0'); break; }
        if (val.trim() === '-50%') { classes.push('-translate-x-1/2'); break; }
        if (val.trim() === '50%') { classes.push('translate-x-1/2'); break; }
        if (val.trim() === '100%') { classes.push('translate-x-full'); break; }
        if (val.trim() === '-100%') { classes.push('-translate-x-full'); break; }
        if (numericValue < 0) { classes.push(`-translate-x-[${Math.abs(numericValue)}${val.replace(numericValue.toString(), '').trim()}]`); break; }
        classes.push(`translate-x-[${val.trim()}]`);
        break;
      }
      case 'translatey': {
        if (numericValue === 0) { classes.push('translate-y-0'); break; }
        if (val.trim() === '-50%') { classes.push('-translate-y-1/2'); break; }
        if (val.trim() === '50%') { classes.push('translate-y-1/2'); break; }
        if (val.trim() === '100%') { classes.push('translate-y-full'); break; }
        if (val.trim() === '-100%') { classes.push('-translate-y-full'); break; }
        if (numericValue < 0) { classes.push(`-translate-y-[${Math.abs(numericValue)}${val.replace(numericValue.toString(), '').trim()}]`); break; }
        classes.push(`translate-y-[${val.trim()}]`);
        break;
      }
      case 'rotate': {
        const deg = parseFloat(val);
        const degMap: Record<number, string> = { 0:'rotate-0', 1:'rotate-1', 2:'rotate-2', 3:'rotate-3', 6:'rotate-6', 12:'rotate-12', 45:'rotate-45', 90:'rotate-90', 180:'rotate-180' };
        if (degMap[deg]) { classes.push(degMap[deg]); break; }
        if (deg < 0 && degMap[Math.abs(deg)]) { classes.push(`-${degMap[Math.abs(deg)]}`); break; }
        classes.push(`rotate-[${val.trim()}]`);
        break;
      }
      case 'scale': {
        const scale = parseFloat(val);
        const scaleMap: Record<number, string> = { 0:'scale-0', 0.5:'scale-50', 0.75:'scale-75', 1:'scale-100', 1.25:'scale-125', 1.5:'scale-150' };
        if (scaleMap[scale]) { classes.push(scaleMap[scale]); break; }
        classes.push(`scale-[${val.trim()}]`);
        break;
      }
      case 'scalex': {
        const scale = parseFloat(val);
        const scaleMap: Record<number, string> = { 0:'scale-x-0', 0.5:'scale-x-50', 0.75:'scale-x-75', 1:'scale-x-100', 1.25:'scale-x-125', 1.5:'scale-x-150' };
        if (scaleMap[scale]) { classes.push(scaleMap[scale]); break; }
        classes.push(`scale-x-[${val.trim()}]`);
        break;
      }
      case 'scaley': {
        const scale = parseFloat(val);
        const scaleMap: Record<number, string> = { 0:'scale-y-0', 0.5:'scale-y-50', 0.75:'scale-y-75', 1:'scale-y-100', 1.25:'scale-y-125', 1.5:'scale-y-150' };
        if (scaleMap[scale]) { classes.push(scaleMap[scale]); break; }
        classes.push(`scale-y-[${val.trim()}]`);
        break;
      }
      case 'skewx': {
        const deg = parseFloat(val);
        const skewMap: Record<number, string> = { 0:'skew-x-0', 1:'skew-x-1', 2:'skew-x-2', 3:'skew-x-3', 6:'skew-x-6', 12:'skew-x-12' };
        if (skewMap[deg]) { classes.push(skewMap[deg]); break; }
        classes.push(`skew-x-[${val.trim()}]`);
        break;
      }
      case 'skewy': {
        const deg = parseFloat(val);
        const skewMap: Record<number, string> = { 0:'skew-y-0', 1:'skew-y-1', 2:'skew-y-2', 3:'skew-y-3', 6:'skew-y-6', 12:'skew-y-12' };
        if (skewMap[deg]) { classes.push(skewMap[deg]); break; }
        classes.push(`skew-y-[${val.trim()}]`);
        break;
      }
      default:
        classes.push(`transform-[${func}(${val.trim()})]`);
        break;
    }
  }

  if (classes.length > 1 && hasConflictingTransforms(classes)) {
    return getMultipleTransformClasses(value);
  }
  return classes;
}

// ── getFilterClasses ────────────────────────────────────────────────

export function getFilterClasses(value: string, isBackdrop = false): string[] {
  const prefix = isBackdrop ? 'backdrop-' : 'filter-';
  const trimmed = value.trim();

  if (trimmed === 'none') return [`${prefix}none`];

  const filters = trimmed.match(/(\w+\([^)]+\))/gi);
  if (!filters) return [`${prefix}[${escapeValue(trimmed)}]`];

  const classes: string[] = [];
  for (const filter of filters) {
    const match = filter.match(/(\w+)-?(\w+)?\(([^)]+)\)/i);
    if (!match) { classes.push(`${prefix}[${escapeValue(filter.trim())}]`); continue; }

    const [, func, subFunc, val] = match;
    const fullFunc = subFunc ? `${func}-${subFunc}` : func;
    const numericValue = parseFloat(val);
    const funcLower = fullFunc.toLowerCase();

    switch (funcLower) {
      case 'grayscale':
        if (numericValue === 100 || val === '1') classes.push(`${prefix}grayscale`);
        else if (numericValue === 0) classes.push(`${prefix}grayscale-0`);
        else classes.push(`${prefix}grayscale-[${val}]`);
        break;
      case 'invert':
        if (numericValue === 100 || val === '1') classes.push(`${prefix}invert`);
        else if (numericValue === 0) classes.push(`${prefix}invert-0`);
        else classes.push(`${prefix}invert-[${val}]`);
        break;
      case 'sepia':
        if (numericValue === 100 || val === '1') classes.push(`${prefix}sepia`);
        else if (numericValue === 0) classes.push(`${prefix}sepia-0`);
        else classes.push(`${prefix}sepia-[${val}]`);
        break;
      case 'blur':
        if (val === '0px' || val === '0') classes.push(`${prefix}blur-none`);
        else if (val === '8px') classes.push(`${prefix}blur`);
        else classes.push(`${prefix}blur-[${val}]`);
        break;
      case 'brightness': {
        const bMap: Record<number, string> = { 0:'0',50:'50',75:'75',90:'90',95:'95',100:'100',105:'105',110:'110',125:'125',150:'150',200:'200' };
        if (bMap[numericValue]) classes.push(`${prefix}brightness-${bMap[numericValue]}`);
        else classes.push(`${prefix}brightness-[${val}]`);
        break;
      }
      case 'contrast': {
        const cMap: Record<number, string> = { 0:'0',50:'50',75:'75',100:'100',125:'125',150:'150',200:'200' };
        if (cMap[numericValue]) classes.push(`${prefix}contrast-${cMap[numericValue]}`);
        else classes.push(`${prefix}contrast-[${val}]`);
        break;
      }
      case 'saturate': {
        const sMap: Record<number, string> = { 0:'0',50:'50',100:'100',150:'150',200:'200' };
        if (sMap[numericValue]) classes.push(`${prefix}saturate-${sMap[numericValue]}`);
        else classes.push(`${prefix}saturate-[${val}]`);
        break;
      }
      case 'hue-rotate': {
        const hMap: Record<string, string> = { '0deg':'0','15deg':'15','30deg':'30','60deg':'60','90deg':'90','180deg':'180' };
        if (hMap[val]) classes.push(`${prefix}hue-rotate-${hMap[val]}`);
        else classes.push(`${prefix}hue-rotate-[${val}]`);
        break;
      }
      default:
        classes.push(`${prefix}[${func}(${val})]`);
        break;
    }
  }

  return classes;
}

// ── getFontClasses ──────────────────────────────────────────────────

export function getFontClasses(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed === 'inherit' || trimmed === 'initial' || trimmed === 'unset') {
    return [`font-${trimmed}`];
  }

  // Tokenize font value respecting quotes
  function tokenize(val: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < val.length; i++) {
      const c = val[i];
      if (c === '"' || c === "'") {
        if (!inQuotes) { inQuotes = true; quoteChar = c; current += c; }
        else if (c === quoteChar) { inQuotes = false; current += c; tokens.push(current.trim()); current = ''; }
        else { current += c; }
      } else if (c === ' ' && !inQuotes) {
        if (current.trim()) { tokens.push(current.trim()); current = ''; }
      } else { current += c; }
    }
    if (current.trim()) tokens.push(current.trim());
    return tokens;
  }

  const tokens = tokenize(trimmed);

  let fontStyle: string | null = null;
  let fontVariant: string | null = null;
  let fontWeight: string | null = null;
  let fontStretch: string | null = null;
  let fontSize: string | null = null;
  let lineHeight: string | null = null;
  let fontFamily: string | null = null;

  const fontStyles = ['normal', 'italic', 'oblique'];
  const fontVariants = ['normal', 'small-caps'];
  const fontWeights = ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
  const fontStretches = ['normal', 'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'];

  let reachedFontSize = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!reachedFontSize) {
      const lower = token.toLowerCase();
      if (fontStyles.includes(lower) && !fontStyle) fontStyle = lower;
      else if (fontVariants.includes(lower) && !fontVariant) fontVariant = lower;
      else if (fontWeights.includes(lower) && !fontWeight) fontWeight = lower;
      else if (fontStretches.includes(lower) && !fontStretch) fontStretch = lower;
      else {
        const parts = token.split('/');
        fontSize = parts[0];
        if (parts.length > 1) lineHeight = parts[1];
        else if (tokens[i + 1] === '/') { lineHeight = tokens[i + 2]; i += 2; }
        reachedFontSize = true;
      }
    } else {
      fontFamily = tokens.slice(i).join(' ').trim();
      break;
    }
  }

  const classes: string[] = [];

  // font-style
  if (fontStyle === 'italic' || fontStyle === 'oblique') classes.push('italic');
  else if (fontStyle === 'normal') classes.push('not-italic');

  // font-variant
  if (fontVariant === 'small-caps') classes.push('font-variant-[small-caps]');

  // font-weight
  if (fontWeight) {
    const weightMap: Record<string, string> = {
      '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal',
      '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
      'normal': 'font-normal', 'bold': 'font-bold', 'bolder': 'font-bold', 'lighter': 'font-light',
    };
    classes.push(weightMap[fontWeight.toLowerCase()] ?? `font-[${escapeValue(fontWeight)}]`);
  }

  // font-size
  if (fontSize) {
    const sizeMap: Record<string, string> = {
      'xx-small': 'text-[xx-small]', 'x-small': 'text-xs', 'small': 'text-sm', 'medium': 'text-base',
      'large': 'text-lg', 'x-large': 'text-xl', 'xx-large': 'text-2xl', 'xxx-large': 'text-3xl',
      'smaller': 'text-sm', 'larger': 'text-lg',
    };
    const lower = fontSize.toLowerCase();
    classes.push(sizeMap[lower] ?? `text-[${spacesToUnderscore(escapeValue(fontSize))}]`);
  }

  // line-height
  if (lineHeight) {
    const lhMap: Record<string, string> = {
      'normal': 'leading-normal', 'none': 'leading-none', 'tight': 'leading-tight',
      'snug': 'leading-snug', 'relaxed': 'leading-relaxed', 'loose': 'leading-loose',
      '3': 'leading-3', '4': 'leading-4', '5': 'leading-5', '6': 'leading-6',
      '7': 'leading-7', '8': 'leading-8', '9': 'leading-9', '10': 'leading-10',
    };
    classes.push(lhMap[lineHeight.toLowerCase()] ?? `leading-[${spacesToUnderscore(escapeValue(lineHeight))}]`);
  }

  // font-family
  if (fontFamily) {
    const familyMap: Record<string, string> = { 'sans-serif': 'font-sans', 'serif': 'font-serif', 'monospace': 'font-mono', 'system-ui': 'font-sans' };
    const names = fontFamily.split(',');
    let added = false;
    for (const name of names) {
      let familyName = name.trim();
      if ((familyName.startsWith('"') && familyName.endsWith('"')) || (familyName.startsWith("'") && familyName.endsWith("'"))) {
        familyName = familyName.slice(1, -1);
      }
      if (familyMap[familyName.toLowerCase()]) {
        classes.push(familyMap[familyName.toLowerCase()]);
        added = true;
        break;
      }
    }
    if (!added) {
      const first = names[0].trim();
      classes.push(`font-[${spacesToUnderscore(escapeValue(first))}]`);
    }
  }

  return classes;
}
