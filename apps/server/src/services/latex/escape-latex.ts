const REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['&', '\\&'],
  ['\\', '\\textbackslash{}'],
  ['~', '\\textasciitilde{}'],
  ['^', '\\textasciicircum{}'],
  ['{', '\\{'],
  ['}', '\\}'],
  ['%', '\\%'],
  ['#', '\\#'],
  ['$', '\\$'],
  ['_', '\\_'],
]);

function escapeChar(char: string): string {
  const code = char.charCodeAt(0);
  if (char === '\n' || char === '\r' || char === '\t') {
    return ' ';
  }
  if (code <= 31 || code === 127) {
    return '';
  }
  return REPLACEMENTS.get(char) ?? char;
}

export function escapeLatex(input: string): string {
  return Array.from(input, escapeChar).join('');
}
