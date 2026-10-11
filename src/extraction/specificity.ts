// Port of calculateSingle from snipbackground.js:996-1124
// CSS specificity calculator

export interface SpecificityResult {
  selector: string;
  specificity: string;
  specificityArray: [number, number, number, number];
  parts: { selector: string; type: string; index: number; length: number }[];
}

export function calculateSingle(input: string): SpecificityResult {
  let selector = input;
  const typeCount: Record<string, number> = { a: 0, b: 0, c: 0 };
  const parts: { selector: string; type: string; index: number; length: number }[] = [];

  const attributeRegex = /(\[[^\]]+\])/g;
  const idRegex = /(#[^\#\s\+>~\.\[:\)]+)/g;
  const classRegex = /(\.[^\s\+>~\.\[:\)]+)/g;
  const pseudoElementRegex = /(::[^\s\+>~\.\[:]+|:first-line|:first-letter|:before|:after)/gi;
  const pseudoClassWithBracketsRegex = /(:(?!not|global|local)[\w-]+\([^\)]*\))/gi;
  const pseudoClassRegex = /(:(?!not|global|local)[^\s\+>~\.\[:]+)/g;
  const elementRegex = /([^\s\+>~\.\[:]+)/g;

  const findMatch = (regex: RegExp, type: string) => {
    if (regex.test(selector)) {
      regex.lastIndex = 0;
      const matches = selector.match(regex);
      if (matches) {
        for (const match of matches) {
          typeCount[type] += 1;
          const index = selector.indexOf(match);
          const length = match.length;
          parts.push({
            selector: input.substr(index, length),
            type,
            index,
            length,
          });
          selector = selector.replace(match, Array(length + 1).join(' '));
        }
      }
    }
  };

  // Replace escaped characters
  const replaceWithPlainText = (regex: RegExp) => {
    if (regex.test(selector)) {
      regex.lastIndex = 0;
      const matches = selector.match(regex);
      if (matches) {
        for (const match of matches) {
          selector = selector.replace(match, Array(match.length + 1).join('A'));
        }
      }
    }
  };

  replaceWithPlainText(/\\[0-9A-Fa-f]{6}\s?/g);
  replaceWithPlainText(/\\[0-9A-Fa-f]{1,5}\s/g);
  replaceWithPlainText(/\\./g);

  // Remove anything after a left brace
  const braceRegex = /{[^]*/gm;
  if (braceRegex.test(selector)) {
    braceRegex.lastIndex = 0;
    const matches = selector.match(braceRegex);
    if (matches) {
      for (const match of matches) {
        selector = selector.replace(match, Array(match.length + 1).join(' '));
      }
    }
  }

  findMatch(attributeRegex, 'b');
  findMatch(idRegex, 'a');
  findMatch(classRegex, 'b');
  findMatch(pseudoElementRegex, 'c');
  findMatch(pseudoClassWithBracketsRegex, 'b');
  findMatch(pseudoClassRegex, 'b');

  selector = selector.replace(/[\*\s\+>~]/g, ' ');
  selector = selector.replace(/[#\.]/g, ' ');
  selector = selector.replace(/:not/g, '    ');
  selector = selector.replace(/:local/g, '      ');
  selector = selector.replace(/:global/g, '       ');
  selector = selector.replace(/[\(\)]/g, ' ');

  findMatch(elementRegex, 'c');

  parts.sort((a, b) => a.index - b.index);

  return {
    selector: input,
    specificity: `0,${typeCount.a},${typeCount.b},${typeCount.c}`,
    specificityArray: [0, typeCount.a, typeCount.b, typeCount.c],
    parts,
  };
}

/**
 * Calculate a numeric specificity score from a specificity string like "0,1,2,3"
 */
export function specificityScore(specificityStr: string): number {
  const parts = specificityStr.split(',').map(Number);
  return parts[0] * 1000000 + parts[1] * 10000 + parts[2] * 100 + parts[3];
}
