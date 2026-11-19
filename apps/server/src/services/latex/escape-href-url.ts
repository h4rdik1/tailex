/**
 * Prepares a URL for the first argument of `\href{url}{text}`.
 *
 * Only URLs matching SAFE_URL_PATTERN (packages/shared) reach this function, so backslashes,
 * braces and spaces are impossible here. Of the characters that remain, these three need a
 * backslash inside `\href`: `%` would start a comment, `#` is a macro parameter, `&` an alignment tab.
 * hyperref turns `\%`, `\#`, `\&` back into plain characters in the PDF link.
 */
export function escapeHrefUrl(url: string): string {
  return url.replace(/[%#&]/g, (char) => `\\${char}`);
}
