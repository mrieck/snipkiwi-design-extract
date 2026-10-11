import { CDPMatchedStyles, ExtractionContext } from '../types/index.js';

/**
 * Collects @keyframes animation rules from matched styles.
 * Port of snipbackground.js:1997-2035
 */
export class KeyframeCollector {
  /**
   * Extract keyframe animations from matched styles.
   */
  collect(allMatchedStyles: CDPMatchedStyles, ctx: ExtractionContext): void {
    const keyframesRules = allMatchedStyles.cssKeyframesRules || [];

    for (const keyframesMatch of keyframesRules) {
      const animationName = keyframesMatch.animationName?.text;
      if (!animationName) continue;

      // Skip if already collected
      if (ctx.animationKeyframesArr[animationName]) continue;

      const keyframes: Record<string, string> = {};

      for (const aKeyframe of keyframesMatch.keyframes) {
        const keyText = aKeyframe.keyText?.text || '';
        const keyStyle = aKeyframe.style;

        if (!keyStyle || !keyStyle.cssProperties) continue;

        const props: string[] = [];
        for (const prop of keyStyle.cssProperties) {
          if (!prop.name || !prop.value) continue;
          if (prop.disabled) continue;
          if (prop.parsedOk === false) continue;

          const important = prop.important ? ' !important' : '';
          props.push(`  ${prop.name}: ${prop.value}${important};`);
        }

        if (props.length > 0) {
          keyframes[keyText] = props.join('\n');
        }
      }

      if (Object.keys(keyframes).length > 0) {
        ctx.animationKeyframesArr[animationName] = keyframes;
      }
    }
  }

  /**
   * Generate CSS text for all collected keyframes.
   */
  generateCss(ctx: ExtractionContext): string {
    const lines: string[] = [];

    for (const [name, keyframes] of Object.entries(ctx.animationKeyframesArr)) {
      lines.push(`@keyframes ${name} {`);
      for (const [keyText, props] of Object.entries(keyframes as Record<string, string>)) {
        lines.push(`  ${keyText} {`);
        lines.push(props);
        lines.push('  }');
      }
      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }
}
