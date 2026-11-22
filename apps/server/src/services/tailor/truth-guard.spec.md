# Spec: `truthGuard` (owner-written)

File: `apps/server/src/services/tailor/truth-guard.ts` (today it is a stub that blocks everything)
Tests: `apps/server/test/truth-guard.test.ts` (they define "done")
Run: `npx vitest run apps/server/test/truth-guard.test.ts`

## What it is

The AI rewrites resume bullets to use a job description's wording. The truth guard is the **code**
that decides whether a rewrite is still _true_. A rewrite may only rephrase what the bullet already
says. It must not add a skill, a tool, an employer or other proper name, a number, a link or an email.
Prompts are not security (CLAUDE.md); this function is. A blocked rewrite is shown to the user with
the reason, never silently dropped.

## Signature (already in the stub)

```ts
interface TruthGuardInput {
  original: string; // the bullet as the user has it now
  suggested: string; // the AI's rewrite (the user's own emails/links/phones already put back)
  resumeText: string; // the whole resume's text: skills, bullets, summary...
  confirmedSkills: readonly string[]; // canonical names the user ticked ("Kubernetes", "Node.js")
}
type TruthGuardResult = { ok: true } | { ok: false; reason: string };
```

It must be a **pure function**: no I/O, no randomness, no `Date`, never throws (the route also
treats a throw as "blocked", but don't rely on it).

## The rules

Compare `suggested` with `original`. Everything below is compared after normalising: Unicode NFKC,
lowercase, curly quotes and dashes as plain ones, hyphens as spaces, repeated spaces as one. You can
reuse `normalizeText` and `scanSkills` from `services/keywords/` (they already do this and know every
alias, so "Postgres" = "PostgreSQL" and "RESTful" = "REST APIs").

| #   | Rule                      | Block when                                                                                                     | Reason (shown to the user)                                |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| R1  | **No new skill or tool**  | `scanSkills(suggested)` finds a skill that `scanSkills(original)` does not, and it is not in `confirmedSkills` | `Adds a skill that is not in this bullet: <Skill>.`       |
| R2  | **No new number**         | a number or percentage in `suggested` has no equal value in `original` (see "Numbers")                         | `Adds a number that is not in this bullet: <number>.`     |
| R3  | **No new name**           | a proper noun or acronym in `suggested` is not in `original` (see "Names")                                     | `Adds a name that is not in this bullet: <name>.`         |
| R4  | **No new contact detail** | a URL, email or phone number appears in `suggested` that is not in `original`                                  | `Adds a link, email or phone that is not in this bullet.` |
| R5  | **Not much longer**       | `suggested` is more than 1.5 times as long as `original` (plus 20 characters of slack for very short bullets)  | `Much longer than the original bullet.`                   |
| R6  | **Not empty**             | `suggested` is empty or only spaces                                                                            | `The rewrite is empty.`                                   |

If no rule blocks, return `{ ok: true }`. Rephrasing, reordering, new verbs, and removing words are all fine.
Check **all** the rules, but return the first reason in the table's order, so the message is predictable.
An identical `suggested` is `{ ok: true }`.

### Numbers

A number is digits **not glued to letters**: `40`, `40%`, `1,000`, `1.5k`, `$5M`, `2x`, `900 ms`, `2023`.
`S3`, `EC2`, `k8s`, `p95`, `HTML5`, `OAuth2` are names, not numbers (R1 handles the skills).

- Normalise before comparing: drop thousands commas (`1,000` = `1000`), expand `k`/`m`/`b` and
  `million`/`billion` (`1.5k` = `1500`, `$5M` = `5 million` = `5000000`), ignore a currency symbol.
- Compare **values**, and treat percent separately from plain: `40%` in the original allows `40%`
  and `40 percent`, not a bare `40`.
- Spelled-out numbers (`ten`, `twenty`, `hundred`, `dozen`...) count as numbers (decision D3).
- Every number in `suggested` needs an equal number in `original`. Fewer numbers in `suggested` is fine.

### Names

A **name** is a capitalised word that is not the first word of the bullet or of a sentence, or an
all-caps acronym of two or more letters (`KPI`, `SaaS` counts too: mixed case with a capital inside).
Skills are handled by R1, so skip any word `scanSkills` recognised. A name is allowed when it appears
in `original` (any case). Everything else, e.g. a company, a product, a client, a school, is blocked.

## Decisions that are yours (my recommendation first)

I wrote the tests for the **recommended** choice. If you choose differently, change the matching
test and say why in `docs/DECISIONS.md` (CLAUDE.md rule 4).

| #   | Decision                                        | Recommended                                                                                                                           | Alternative (SPEC §8 wording)                                                   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Where may a skill or number come from?          | **The same bullet** (or `confirmedSkills` for skills). A skill listed elsewhere on the resume does not make it true _of this bullet_. | The bullet **or anywhere on the resume** (`resumeText`).                        |
| D2  | Allow a confirmed skill inside a bullet?        | Yes, the guard accepts it (SPEC), though today the AI is never told the confirmed skills.                                             | Block it everywhere; confirmed skills only go to the Skills section.            |
| D3  | Are spelled-out numbers numbers?                | Yes (`ten` vs `10` are equal values).                                                                                                 | No, only digits.                                                                |
| D4  | Are new acronyms and capitalised words blocked? | Yes, conservative: a false block costs the user one click, a false pass puts a lie on their resume.                                   | Only block names that match a company/product list (needs data we do not have). |
| D5  | Length cap                                      | 1.5× plus 20 characters.                                                                                                              | The prompt asks for ±20 %; you could enforce 1.2×.                              |

`resumeText` is passed in for decision D1's alternative. With the recommended choice you may not need it.

## Suggested shape (about 80 lines)

Small pure helpers above `truthGuard`: `numbersIn(text)`, `namesIn(text)`, `skillsIn(text)` (a thin wrapper
over `scanSkills`), `urlsIn(text)`. Then `truthGuard` runs the rules in table order and returns the first
failure. Keep each rule a few lines so you can explain it in an interview.

## Done when

- All tests in `truth-guard.test.ts` pass (they all currently fail: the stub blocks everything).
- `npm run lint` and `npm run typecheck` are clean; the rest of the suite stays green.
- You can explain: why fail-closed, why the same bullet and not the whole resume (D1), why numbers are
  compared by value, why a false block is cheaper than a false pass, and why this lives in code and not in the prompt.
