/**
 * CSS shorthand property expansion.
 * Port of tailwind_shortlong.js (1,504 lines)
 */

export interface ExpandedResult {
  matched_properties: Record<string, string>;
  overwritten_properties: Record<string, string>;
}

export type PropertyType = {
  type: 'short' | 'long' | 'unique';
  short: string;
  long: string;
};

/** Properties that inherit from parent elements */
export const passedDownProps = [
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch',
  'font-size-adjust', 'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-optical-sizing', 'font-synthesis',
  'font-variant-alternates', 'font-variant-caps', 'font-variant-east-asian', 'font-variant-ligatures', 'font-variant-numeric',
  'font-variant-position', 'color', 'line-height', 'text-align', 'text-decoration', 'text-decoration-color', 'text-decoration-line', 'text-decoration-style',
  'text-decoration-thickness', 'text-underline-offset', 'text-indent', 'text-transform', 'text-shadow', 'text-overflow', 'text-size-adjust', 'text-rendering',
  'letter-spacing', 'word-spacing', 'white-space', 'direction', 'unicode-bidi', 'writing-mode', 'hyphens', 'tab-size', 'list-style', 'list-style-type',
  'list-style-position', 'list-style-image', 'cursor', 'visibility', 'opacity', 'quotes', 'orphans', 'widows', 'user-select', 'pointer-events',
];

/** Shorthand-to-longhand mapping used for property type detection */
const shorthandToLonghand: Record<string, string[]> = {
  'background': ['background-color', 'background-image', 'background-repeat', 'background-attachment', 'background-position', 'background-size', 'background-origin', 'background-clip'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'grid-column': ['grid-column-start', 'grid-column-end'],
  'grid-row': ['grid-row-start', 'grid-row-end'],
  'border': ['border-width', 'border-style', 'border-color'],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  'grid-area': ['grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end'],
  'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
  'place-self': ['align-self', 'justify-self'],
  'place-content': ['align-content', 'justify-content'],
  'place-items': ['align-items', 'justify-items'],
  'transition': ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
};

/** Full shorthand-to-longhand mapping (for reference/expansion) */
export const fullShorthandToLonghand: Record<string, string[]> = {
  'border': ['border-width', 'border-style', 'border-color'],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  'background': ['background-color', 'background-image', 'background-repeat', 'background-attachment', 'background-position', 'background-size', 'background-origin', 'background-clip'],
  'font': ['font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'transition': ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
  'animation': ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state'],
  'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
  'outline': ['outline-width', 'outline-style', 'outline-color'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness'],
  'columns': ['column-width', 'column-count'],
  'place-content': ['align-content', 'justify-content'],
  'place-items': ['align-items', 'justify-items'],
  'place-self': ['align-self', 'justify-self'],
  'overflow': ['overflow-x', 'overflow-y'],
  'inset': ['top', 'right', 'bottom', 'left'],
  'gap': ['row-gap', 'column-gap'],
  'border-image': ['border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat'],
  'scroll-margin': ['scroll-margin-top', 'scroll-margin-right', 'scroll-margin-bottom', 'scroll-margin-left'],
  'scroll-padding': ['scroll-padding-top', 'scroll-padding-right', 'scroll-padding-bottom', 'scroll-padding-left'],
  'grid': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow'],
  'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
  'grid-area': ['grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end'],
  'grid-column': ['grid-column-start', 'grid-column-end'],
  'grid-row': ['grid-row-start', 'grid-row-end'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'border-block': ['border-block-start', 'border-block-end'],
  'border-inline': ['border-inline-start', 'border-inline-end'],
  'offset': ['offset-anchor', 'offset-distance', 'offset-path', 'offset-position', 'offset-rotate'],
  'column-rule': ['column-rule-width', 'column-rule-style', 'column-rule-color'],
  'mask': ['mask-image', 'mask-mode', 'mask-position', 'mask-size', 'mask-repeat', 'mask-origin', 'mask-clip', 'mask-composite'],
  'font-variant': ['font-variant-ligatures', 'font-variant-alternates', 'font-variant-caps', 'font-variant-numeric', 'font-variant-east-asian'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'padding-block': ['padding-block-start', 'padding-block-end'],
  'padding-inline': ['padding-inline-start', 'padding-inline-end'],
  'margin-block': ['margin-block-start', 'margin-block-end'],
  'margin-inline': ['margin-inline-start', 'margin-inline-end'],
};

/**
 * Determine if a CSS property is shorthand, longhand, or unique.
 */
export function getPropertyType(propertyName: string): PropertyType {
  if (propertyName in shorthandToLonghand) {
    return { type: 'short', short: propertyName, long: '' };
  }

  for (const shorthand in shorthandToLonghand) {
    if (shorthandToLonghand[shorthand].includes(propertyName)) {
      return { type: 'long', short: shorthand, long: propertyName };
    }
  }

  return { type: 'unique', short: propertyName, long: propertyName };
}

/** Tokenize a CSS value respecting parentheses */
function tokenizeValue(value: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let parenCount = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') {
      parenCount++;
      currentToken += char;
    } else if (char === ')') {
      parenCount--;
      currentToken += char;
      if (parenCount === 0) {
        tokens.push(currentToken.trim());
        currentToken = '';
      }
    } else if (parenCount === 0 && /\s/.test(char)) {
      if (currentToken.trim()) tokens.push(currentToken.trim());
      currentToken = '';
    } else {
      currentToken += char;
    }
  }
  if (currentToken.trim()) tokens.push(currentToken.trim());
  return tokens;
}

/** Split value by commas respecting parentheses */
function splitByComma(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenCount = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') {
      parenCount++;
      current += char;
    } else if (char === ')') {
      parenCount--;
      current += char;
    } else if (char === ',' && parenCount === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Expand a CSS shorthand property into its longhand components.
 * Returns null for unsupported properties.
 */
export function expandShorthandProperty(property: string, value: string): ExpandedResult | null {
  if (property === 'background') {
    return expandBackground(value);
  } else if (property === 'transition') {
    return expandTransition(value);
  } else if (property === 'list-style') {
    return expandListStyle(value);
  } else if (property === 'grid-column') {
    return expandGridColumn(value);
  } else if (property === 'grid-row') {
    return expandGridRow(value);
  } else if (property === 'grid-template') {
    return expandGridTemplate(value);
  } else if (property === 'grid-area') {
    return expandGridArea(value);
  } else if (property === 'place-self') {
    return expandPlaceProperty(value, 'align-self', 'justify-self');
  } else if (property === 'place-content') {
    return expandPlaceProperty(value, 'align-content', 'justify-content');
  } else if (property === 'place-items') {
    return expandPlaceProperty(value, 'align-items', 'justify-items');
  } else if (property === 'flex-flow') {
    return expandFlexFlow(value);
  } else if (property === 'border' || property === 'border-top' || property === 'border-right' ||
             property === 'border-bottom' || property === 'border-left') {
    return expandBorder(property, value);
  } else if (property === 'padding' || property === 'margin') {
    return expandSpacing(property, value);
  } else if (property === 'animation') {
    return expandAnimation(value);
  }

  return null;
}

function expandBackground(value: string): ExpandedResult {
  let expandedProperties: Record<string, string> = {};
  let overwrittenProperties: Record<string, string> = {};

  const layers = splitByComma(value);
  let hasConflict = layers.length > 1;

  const bgImages: string[] = [];
  const bgColors: string[] = [];
  const bgRepeats: string[] = [];
  const bgAttachments: string[] = [];
  const bgPositions: string[] = [];
  const bgSizes: string[] = [];
  const bgOrigins: string[] = [];
  const bgClips: string[] = [];

  const repeatValues = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'space', 'round'];
  const attachmentValues = ['scroll', 'fixed', 'local'];
  const positionKeywords = ['left', 'center', 'right', 'top', 'bottom'];
  const sizeValues = ['auto', 'cover', 'contain'];
  const boxValues = ['border-box', 'padding-box', 'content-box'];

  layers.forEach(layer => {
    const tokens: string[] = [];
    let currentToken = '';
    let parenCount = 0;

    for (let i = 0; i < layer.length; i++) {
      const char = layer[i];
      if (char === '(') { parenCount++; currentToken += char; }
      else if (char === ')') {
        parenCount--;
        currentToken += char;
        if (parenCount === 0) { tokens.push(currentToken.trim()); currentToken = ''; }
      } else if (parenCount === 0 && /\s/.test(char)) {
        if (currentToken.trim()) tokens.push(currentToken.trim());
        currentToken = '';
      } else if (parenCount === 0 && char === '/') {
        if (currentToken.trim()) tokens.push(currentToken.trim());
        tokens.push('/');
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    if (currentToken.trim()) tokens.push(currentToken.trim());

    let layerImage = '', layerColor = '', layerRepeat = '', layerAttachment = '';
    let layerPosition = '', layerSize = '', layerOrigin = '', layerClip = '';
    let isAfterSlash = false;

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token === '/') { isAfterSlash = true; i++; continue; }

      if (token.includes('gradient') || token.startsWith('url(') || token === 'none') {
        layerImage = token; i++; continue;
      }
      if (repeatValues.includes(token)) {
        layerRepeat = layerRepeat ? layerRepeat + ' ' + token : token; i++; continue;
      }
      if (attachmentValues.includes(token)) { layerAttachment = token; i++; continue; }
      if (positionKeywords.includes(token) || /^[+-]?\d+(\.\d+)?(px|em|rem|%)?$/.test(token)) {
        if (isAfterSlash) { layerSize = layerSize ? layerSize + ' ' + token : token; }
        else { layerPosition = layerPosition ? layerPosition + ' ' + token : token; }
        i++; continue;
      }
      if (sizeValues.includes(token) && isAfterSlash) {
        layerSize = layerSize ? layerSize + ' ' + token : token; i++; continue;
      }
      if (boxValues.includes(token)) {
        if (!layerOrigin) layerOrigin = token;
        else if (!layerClip) layerClip = token;
        i++; continue;
      }
      if (/^(#[0-9a-fA-F]{3,8}|rgba?\(.*?\)|hsla?\(.*?\)|[a-zA-Z]+)$/.test(token)) {
        layerColor = token; i++; continue;
      }
      i++;
    }

    if (!layerClip && layerOrigin) layerClip = layerOrigin;

    bgImages.push(layerImage || 'none');
    if (layerColor) bgColors.push(layerColor);
    bgRepeats.push(layerRepeat || 'repeat');
    bgAttachments.push(layerAttachment || 'scroll');
    bgPositions.push(layerPosition || '0% 0%');
    bgSizes.push(layerSize || 'auto');
    bgOrigins.push(layerOrigin || 'padding-box');
    bgClips.push(layerClip || 'border-box');
  });

  const numLayers = bgImages.length;
  const baseDefaults: Record<string, string> = {
    'background-image': 'none', 'background-color': 'transparent', 'background-repeat': 'repeat',
    'background-attachment': 'scroll', 'background-position': '0% 0%', 'background-size': 'auto',
    'background-origin': 'padding-box', 'background-clip': 'border-box',
  };

  const defaults: Record<string, string> = {};
  for (const prop in baseDefaults) {
    defaults[prop] = prop === 'background-color' ? baseDefaults[prop] : Array(numLayers).fill(baseDefaults[prop]).join(', ');
  }

  let conflicts = false;
  const addProp = (key: string, vals: string[]) => {
    const joined = vals.join(', ');
    if (joined !== defaults[key]) {
      expandedProperties[key] = joined;
      overwrittenProperties[key] = joined;
      if (vals.length > 1) conflicts = true;
    }
  };

  addProp('background-image', bgImages);
  if (bgColors.length > 0 && bgColors[bgColors.length - 1] !== defaults['background-color']) {
    expandedProperties['background-color'] = bgColors[bgColors.length - 1];
    overwrittenProperties['background-color'] = bgColors[bgColors.length - 1];
  }
  addProp('background-repeat', bgRepeats);
  addProp('background-attachment', bgAttachments);
  addProp('background-position', bgPositions);
  addProp('background-size', bgSizes);
  addProp('background-origin', bgOrigins);
  addProp('background-clip', bgClips);

  if (conflicts) {
    expandedProperties = { background: value };
    overwrittenProperties = { background: value };
  }

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}

function expandTransition(value: string): ExpandedResult {
  let expandedProperties: Record<string, string> = {};
  let overwrittenProperties: Record<string, string> = {};

  const transitions = splitByComma(value);
  let conflicts = transitions.length > 1;

  const propertiesList: string[] = [];
  const durationsList: string[] = [];
  const timingFunctionsList: string[] = [];
  const delaysList: string[] = [];
  const timingFunctionValues = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];

  transitions.forEach(transition => {
    const tokens = tokenizeValue(transition);
    let propertyName = 'all', duration = '0s', timingFunction = 'ease', delay = '0s';

    tokens.forEach(token => {
      if (/^[\d.]+(ms|s)$/.test(token)) {
        if (duration === '0s') duration = token; else delay = token;
        return;
      }
      if (timingFunctionValues.includes(token) || token.startsWith('cubic-bezier') || token.startsWith('steps')) {
        timingFunction = token; return;
      }
      propertyName = token;
    });

    propertiesList.push(propertyName);
    durationsList.push(duration);
    timingFunctionsList.push(timingFunction);
    delaysList.push(delay);
  });

  if (propertiesList.join(', ') !== 'all') {
    expandedProperties['transition-property'] = propertiesList.join(', ');
    overwrittenProperties['transition-property'] = propertiesList.join(', ');
    if (propertiesList.length > 1) conflicts = true;
  }
  if (durationsList.join(', ') !== '0s') {
    expandedProperties['transition-duration'] = durationsList.join(', ');
    overwrittenProperties['transition-duration'] = durationsList.join(', ');
    if (durationsList.length > 1) conflicts = true;
  }
  if (timingFunctionsList.join(', ') !== 'ease') {
    expandedProperties['transition-timing-function'] = timingFunctionsList.join(', ');
    overwrittenProperties['transition-timing-function'] = timingFunctionsList.join(', ');
    if (timingFunctionsList.length > 1) conflicts = true;
  }
  if (delaysList.join(', ') !== '0s') {
    expandedProperties['transition-delay'] = delaysList.join(', ');
    overwrittenProperties['transition-delay'] = delaysList.join(', ');
    if (delaysList.length > 1) conflicts = true;
  }

  if (conflicts) {
    expandedProperties = { transition: value };
    overwrittenProperties = { transition: value };
  }

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}

function expandListStyle(value: string): ExpandedResult {
  let expandedProperties: Record<string, string> = {};
  let overwrittenProperties: Record<string, string> = {};

  if (['inherit', 'initial', 'unset'].includes(value.trim())) {
    const v = value.trim();
    return {
      matched_properties: { 'list-style-type': v, 'list-style-position': v, 'list-style-image': v },
      overwritten_properties: { 'list-style-type': v, 'list-style-position': v, 'list-style-image': v },
    };
  }

  const tokens: string[] = [];
  let currentToken = '';
  let inUrl = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === 'u' && value.slice(i, i + 4) === 'url(') { inUrl = true; currentToken += 'url('; i += 3; }
    else if (char === ')' && inUrl) { inUrl = false; currentToken += ')'; }
    else if (/\s/.test(char) && !inUrl) {
      if (currentToken.trim()) { tokens.push(currentToken.trim()); currentToken = ''; }
    } else { currentToken += char; }
  }
  if (currentToken.trim()) tokens.push(currentToken.trim());

  const typeValues = ['disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-roman', 'upper-roman', 'lower-greek', 'lower-latin', 'upper-latin', 'armenian', 'georgian', 'lower-alpha', 'upper-alpha', 'none', 'inherit', 'initial', 'unset'];
  const positionValues = ['inside', 'outside'];

  let listStyleType = '', listStylePosition = '', listStyleImage = '';

  tokens.forEach(token => {
    if (token.startsWith('url(')) listStyleImage = token;
    else if (positionValues.includes(token)) listStylePosition = token;
    else if (typeValues.includes(token) || token.startsWith('"') || token.startsWith("'")) listStyleType = token;
    else listStyleType = token;
  });

  if (!listStyleType) listStyleType = 'disc';
  if (!listStylePosition) listStylePosition = 'outside';
  if (!listStyleImage) listStyleImage = 'none';

  expandedProperties = { 'list-style-type': listStyleType, 'list-style-position': listStylePosition, 'list-style-image': listStyleImage };

  const defaults: Record<string, string> = { 'list-style-type': 'disc', 'list-style-position': 'outside', 'list-style-image': 'none' };
  let conflicts = false;

  for (const prop in expandedProperties) {
    if (expandedProperties[prop] !== defaults[prop]) {
      overwrittenProperties[prop] = expandedProperties[prop];
    }
  }

  if (tokens.length > 3 || Object.keys(overwrittenProperties).length !== tokens.length) {
    conflicts = true;
  }

  if (conflicts) {
    expandedProperties = {};
    overwrittenProperties = {};
    if (value === 'none') {
      expandedProperties['list-style-type'] = value;
      overwrittenProperties['list-style-type'] = value;
    } else {
      expandedProperties['list-style'] = value;
      overwrittenProperties['list-style'] = value;
    }
  }

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}

function expandGridColumn(value: string): ExpandedResult {
  const expanded: Record<string, string> = {};
  const parts = value.trim().split('/').map(p => p.trim());

  if (parts.length === 1) {
    if (value === 'auto') { expanded['grid-column-start'] = 'auto'; expanded['grid-column-end'] = 'auto'; }
    else if (value.startsWith('span')) { expanded['grid-column-start'] = 'auto'; expanded['grid-column-end'] = value; }
    else { expanded['grid-column-start'] = value; expanded['grid-column-end'] = 'auto'; }
  } else if (parts.length === 2) {
    expanded['grid-column-start'] = parts[0];
    expanded['grid-column-end'] = parts[1];
  }

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandGridRow(value: string): ExpandedResult {
  const expanded: Record<string, string> = {};
  const parts = value.trim().split('/').map(p => p.trim());

  if (parts.length === 1) {
    if (value === 'auto') { expanded['grid-row-start'] = 'auto'; expanded['grid-row-end'] = 'auto'; }
    else if (value.startsWith('span')) { expanded['grid-row-start'] = 'auto'; expanded['grid-row-end'] = value; }
    else { expanded['grid-row-start'] = value; expanded['grid-row-end'] = 'auto'; }
  } else if (parts.length === 2) {
    expanded['grid-row-start'] = parts[0];
    expanded['grid-row-end'] = parts[1];
  }

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandGridTemplate(value: string): ExpandedResult {
  const expanded: Record<string, string> = {};

  if (value === 'none') {
    expanded['grid-template-rows'] = 'none';
    expanded['grid-template-columns'] = 'none';
    expanded['grid-template-areas'] = 'none';
    return { matched_properties: expanded, overwritten_properties: expanded };
  }

  const parts = value.split(/(['"].*?['"])/g).filter(Boolean);
  const areaStrings: string[] = [];
  const rowTrackList: string[] = [];
  let columnTrackList = '';

  parts.forEach(part => {
    if (part.trim().startsWith('"') || part.trim().startsWith("'")) {
      areaStrings.push(part.trim().replace(/['"]/g, ''));
    } else {
      const tracks = part.trim().split('/');
      if (tracks.length > 1) {
        columnTrackList = tracks.pop()!.trim();
      }
      const rowTracks = tracks.join(' ').trim();
      if (rowTracks) rowTrackList.push(rowTracks);
    }
  });

  if (areaStrings.length > 0) expanded['grid-template-areas'] = `"${areaStrings.join('" "')}"`;
  if (rowTrackList.length > 0) expanded['grid-template-rows'] = rowTrackList.join(' ');
  if (columnTrackList) expanded['grid-template-columns'] = columnTrackList;

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandGridArea(value: string): ExpandedResult {
  const expanded: Record<string, string> = {};
  const parts = value.trim().split('/').map(p => p.trim());

  if (parts.length === 1 && !parts[0].includes('span') && isNaN(Number(parts[0]))) {
    expanded['grid-row-start'] = parts[0];
    expanded['grid-column-start'] = parts[0];
    expanded['grid-row-end'] = parts[0];
    expanded['grid-column-end'] = parts[0];
  } else {
    switch (parts.length) {
      case 1:
        expanded['grid-row-start'] = parts[0]; expanded['grid-column-start'] = parts[0];
        expanded['grid-row-end'] = 'auto'; expanded['grid-column-end'] = 'auto'; break;
      case 2:
        expanded['grid-row-start'] = parts[0]; expanded['grid-column-start'] = parts[1];
        expanded['grid-row-end'] = 'auto'; expanded['grid-column-end'] = 'auto'; break;
      case 3:
        expanded['grid-row-start'] = parts[0]; expanded['grid-column-start'] = parts[1];
        expanded['grid-row-end'] = parts[2]; expanded['grid-column-end'] = 'auto'; break;
      case 4:
        expanded['grid-row-start'] = parts[0]; expanded['grid-column-start'] = parts[1];
        expanded['grid-row-end'] = parts[2]; expanded['grid-column-end'] = parts[3]; break;
    }
  }

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandPlaceProperty(value: string, alignProp: string, justifyProp: string): ExpandedResult {
  const expanded: Record<string, string> = {};
  const values = value.trim().split(/\s+/);

  if (values.length === 1) {
    expanded[alignProp] = values[0];
    expanded[justifyProp] = values[0];
  } else if (values.length === 2) {
    expanded[alignProp] = values[0];
    expanded[justifyProp] = values[1];
  }

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandFlexFlow(value: string): ExpandedResult {
  const [firstValue, secondValue] = value.trim().split(/\s+/);
  const expanded: Record<string, string> = {};

  const directionValues = ['row', 'row-reverse', 'column', 'column-reverse'];
  const wrapValues = ['nowrap', 'wrap', 'wrap-reverse'];

  if (firstValue) {
    if (directionValues.includes(firstValue)) {
      expanded['flex-direction'] = firstValue;
      if (!secondValue) expanded['flex-wrap'] = 'nowrap';
    } else if (wrapValues.includes(firstValue)) {
      expanded['flex-wrap'] = firstValue;
      if (!secondValue) expanded['flex-direction'] = 'row';
    }
  }

  if (secondValue) {
    if (directionValues.includes(secondValue)) expanded['flex-direction'] = secondValue;
    else if (wrapValues.includes(secondValue)) expanded['flex-wrap'] = secondValue;
  }

  return { matched_properties: expanded, overwritten_properties: expanded };
}

function expandBorder(property: string, value: string): ExpandedResult {
  let expandedProperties: Record<string, string> = {};
  let overwrittenProperties: Record<string, string> = {};

  let widthProp = 'border-width', styleProp = 'border-style', colorProp = 'border-color';
  if (property !== 'border') {
    const side = property.split('-')[1];
    widthProp = `border-${side}-width`;
    styleProp = `border-${side}-style`;
    colorProp = `border-${side}-color`;
  }

  if (['inherit', 'initial', 'unset', 'revert'].includes(value.trim())) {
    const v = value.trim();
    return {
      matched_properties: { [widthProp]: v, [styleProp]: v, [colorProp]: v },
      overwritten_properties: { [widthProp]: v, [styleProp]: v, [colorProp]: v },
    };
  }

  if (value.trim() === 'none') {
    return {
      matched_properties: { [widthProp]: '0', [styleProp]: 'none', [colorProp]: 'currentColor' },
      overwritten_properties: { [widthProp]: '0', [styleProp]: 'none', [colorProp]: 'currentColor' },
    };
  }

  const tokens = tokenizeValue(value);
  const borderStyleValues = ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];
  const borderWidthKeywords = ['thin', 'medium', 'thick'];

  let borderWidth = '', borderStyle = '', borderColor = '';

  for (const token of tokens) {
    if (borderStyleValues.includes(token.toLowerCase())) { borderStyle = token; continue; }
    if (borderWidthKeywords.includes(token.toLowerCase()) ||
        /^[+-]?(\d+(\.\d+)?|\.\d+)(px|em|rem|%|vh|vw|vmin|vmax|in|cm|mm|pt|pc|ex|ch|lh|rlh|q)?$/i.test(token)) {
      borderWidth = token; continue;
    }
    borderColor = token;
  }

  if (!borderStyle) borderStyle = 'none';
  if (!borderWidth) borderWidth = 'medium';
  if (!borderColor) borderColor = 'currentColor';

  expandedProperties = { [widthProp]: borderWidth, [styleProp]: borderStyle, [colorProp]: borderColor };

  const defaults: Record<string, string> = { [widthProp]: 'medium', [styleProp]: 'none', [colorProp]: 'currentColor' };
  for (const prop in expandedProperties) {
    if (expandedProperties[prop] !== defaults[prop]) {
      overwrittenProperties[prop] = expandedProperties[prop];
    }
  }

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}

function expandSpacing(property: string, value: string): ExpandedResult | null {
  const expandedProperties: Record<string, string> = {};
  const overwrittenProperties: Record<string, string> = {};

  const sides = ['top', 'right', 'bottom', 'left'];
  const properties = sides.map(side => `${property}-${side}`);

  if (['inherit', 'initial', 'unset', 'revert'].includes(value.trim())) {
    const v = value.trim();
    properties.forEach(prop => { expandedProperties[prop] = v; overwrittenProperties[prop] = v; });
    return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
  }

  const tokens = value.trim().split(/\s+/);
  let values: string[];

  if (tokens.length === 1) values = [tokens[0], tokens[0], tokens[0], tokens[0]];
  else if (tokens.length === 2) values = [tokens[0], tokens[1], tokens[0], tokens[1]];
  else if (tokens.length === 3) values = [tokens[0], tokens[1], tokens[2], tokens[1]];
  else if (tokens.length === 4) values = [tokens[0], tokens[1], tokens[2], tokens[3]];
  else return null;

  properties.forEach((prop, index) => {
    expandedProperties[prop] = values[index];
    overwrittenProperties[prop] = values[index];
  });

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}

function expandAnimation(value: string): ExpandedResult {
  let expandedProperties: Record<string, string> = {};
  let overwrittenProperties: Record<string, string> = {};

  const animations = splitByComma(value);
  const names: string[] = [], durations: string[] = [], timingFunctions: string[] = [], delays: string[] = [];
  const iterationCounts: string[] = [], directions: string[] = [], fillModes: string[] = [], playStates: string[] = [];

  const timingFunctionValues = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];
  const directionValues = ['normal', 'reverse', 'alternate', 'alternate-reverse'];
  const fillModeValues = ['none', 'forwards', 'backwards', 'both'];
  const playStateValues = ['running', 'paused'];

  animations.forEach(animation => {
    const tokens = tokenizeValue(animation);
    let name = 'none', duration = '0s', timingFunction = 'ease', delay = '0s';
    let iterationCount = '1', direction = 'normal', fillMode = 'none', playState = 'running';

    tokens.forEach(token => {
      if (/^[\d.]+(s|ms)$/.test(token)) {
        if (!duration || duration === '0s') duration = token; else delay = token; return;
      }
      if (timingFunctionValues.includes(token) || token.includes('cubic-bezier') || token.includes('steps')) {
        timingFunction = token; return;
      }
      if (token === 'infinite' || /^\d+$/.test(token)) { iterationCount = token; return; }
      if (directionValues.includes(token)) { direction = token; return; }
      if (fillModeValues.includes(token)) { fillMode = token; return; }
      if (playStateValues.includes(token)) { playState = token; return; }
      if (token !== 'none') name = token;
    });

    names.push(name); durations.push(duration); timingFunctions.push(timingFunction);
    delays.push(delay); iterationCounts.push(iterationCount); directions.push(direction);
    fillModes.push(fillMode); playStates.push(playState);
  });

  const addIfNotDefault = (key: string, vals: string[], defaultVal: string) => {
    if (vals.join(', ') !== defaultVal) {
      expandedProperties[key] = vals.join(', ');
      overwrittenProperties[key] = vals.join(', ');
    }
  };

  addIfNotDefault('animation-name', names, 'none');
  addIfNotDefault('animation-duration', durations, '0s');
  addIfNotDefault('animation-timing-function', timingFunctions, 'ease');
  addIfNotDefault('animation-delay', delays, '0s');
  addIfNotDefault('animation-iteration-count', iterationCounts, '1');
  addIfNotDefault('animation-direction', directions, 'normal');
  addIfNotDefault('animation-fill-mode', fillModes, 'none');
  addIfNotDefault('animation-play-state', playStates, 'running');

  return { matched_properties: expandedProperties, overwritten_properties: overwrittenProperties };
}
