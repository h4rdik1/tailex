# Spec: `escapeLatex` (owner-written)

File: `apps/server/src/services/latex/escape-latex.ts`
Tests: `apps/server/test/escape-latex.test.ts` (run `npm test`, or `npm run test:docker` for the PDF tests too)

## Why it exists

Users send resume **text**, never LaTeX. In LaTeX, ten characters are commands, not text. If a bullet
contains `\input{/etc/passwd}` and we paste it into the `.tex` file unchanged, LaTeX runs it.
`escapeLatex` turns any string into LaTeX source that **prints exactly that string** and can
**never start a command**. It is the main defense; the pdflatex sandbox is the backup
(docs/SECURITY.md T8).

## Signature

```ts
export function escapeLatex(input: string): string;
```

Pure function: no I/O, no globals, same input → same output. It runs **after** `normalizeText`
(which already removed emoji and other unprintable characters), so it only deals with the cases below.

## Rules

Process the input **one character at a time, in a single pass**, and build a new string.

| Input                                         | Output                    | Why it is special in LaTeX                              |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| `\`                                           | `\textbackslash{}`        | starts every command                                    |
| `{`                                           | `\{`                      | opens a group                                           |
| `}`                                           | `\}`                      | closes a group                                          |
| `&`                                           | `\&`                      | column separator in tables                              |
| `%`                                           | `\%`                      | starts a comment (hides the rest of the line)           |
| `$`                                           | `\$`                      | enters math mode                                        |
| `#`                                           | `\#`                      | macro parameter                                         |
| `_`                                           | `\_`                      | subscript (math only, error in text)                    |
| `~`                                           | `\textasciitilde{}`       | non-breaking space                                      |
| `^`                                           | `\textasciicircum{}`      | superscript, and `^^5c` is TeX's hex code for `\`       |
| `\n`, `\r`, `\t`                              | a single space `' '` each | a blank line would end the paragraph inside a bullet    |
| other control chars U+0000–U+001F, and U+007F | removed (`''`)            | invisible and can confuse TeX                           |
| anything else                                 | unchanged                 | letters, digits, accents, `– — “ ”` etc. are plain text |

Notes:

- **Why `{}` after `\textbackslash` etc.?** Without it, `\textbackslash` followed by a letter would be read as
  one longer (unknown) command name: `\textbackslashinput`. The empty group ends the name.
- **Why a single pass?** If you first replace `\` with `\textbackslash{}` and then replace `{`, you would escape the
  braces you just added. Looking at each input character exactly once avoids that whole class of bug.
- **Not idempotent, on purpose.** `escapeLatex(escapeLatex(x)) !== escapeLatex(x)`. Escape once, at the last
  moment before text goes into the template. The template's `safe()` helper is the only caller.

## Examples

```
escapeLatex('R&D')                  → 'R\&D'
escapeLatex('100%')                 → '100\%'
escapeLatex('C# and F#')            → 'C\# and F\#'
escapeLatex('\\input{/etc/passwd}') → '\textbackslash{}input\{/etc/passwd\}'
escapeLatex('a\nb')                 → 'a b'
escapeLatex('José – ok')            → 'José – ok'
escapeLatex('')                     → ''
```

(In the examples, `'\\input'` is the JavaScript way to write the 6-character string `\input`.)

## Suggested shape (≈ 15 lines)

- A `ReadonlyMap<string, string>` from the 10 special characters to their replacements.
- A small `escapeChar(char: string): string` that checks: whitespace control → `' '`, other control → `''`,
  in the map → replacement, else the character itself.
- `escapeLatex` = `Array.from(input, escapeChar).join('')`.

## Done when

- `npx vitest run apps/server/test/escape-latex.test.ts` is green (per-character table, injection, fuzz).
- `npm run test:docker` is green: the PDF tests prove payloads print as literal text.
- Coverage of `escape-latex.ts` ≥ 80% (it will be 100% with the tests given).
- You can explain each row of the table in an interview.
