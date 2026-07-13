---
kind: law
status: active
updated: 2026-07-13
---

# Documentation & Comments Law

> The PRIMARY reader of this repo's docs and comments is an AI coding agent, not a human. This optimizes for machine consumption, token budget, and drift-resistance. Prescriptive; enforced by the gates in §Enforcement; grounded in the 2024–2026 literature and current tool support (§Evidence). Applies to code comments, prose docs, and agent-context files. Markdown *formatting* mechanics live in `Core-Docs-Formatting-Law.md`; this doc governs *content*.

## First principles (load-bearing)

1. **A wrong doc is worse than no doc.** Stale/misleading comments and prose actively degrade agent reasoning (measured: test success collapses to \~22% under wrong comments; \~23% output-prediction drop) and correlate with bugs (\~1.5× within 7 days). A *missing* doc is cheap. **Delete drift on sight; never leave a comment that lies about the code.**
2. **Code + types are the source of truth.** Prose that merely restates code gives \~zero measurable agent benefit and costs tokens. If the code or a type shows it, delete the prose.
3. **Keep the irreducible WHY in prose.** Cross-cutting decisions, boundaries, and rationale NOT visible in any single file (why a boundary exists, a ledger decision, a non-obvious invariant) DO belong in retrievable prose — a codebase-only agent fails on decisions never encoded in source. This is the only prose worth maintaining.
4. **Terse beats comprehensive.** Big generic overviews make agents over-explore (generated context files *lowered* task success and raised cost +20–23%). Write navigational and specific. No padded prose — docstrings compress 25–40% with no quality loss.
5. **One fact, one home.** Agents over-retrieve; duplication multiplies drift. A fact lives in exactly one place; everything else points to it.
6. **The reader sees raw bytes, not an editor.** No hover cards, no strikethrough, no squiggles — editor rendering is worth nothing here. A doc tag or markdown construct earns its place only by being (a) a deterministic, greppable anchor in the source text, (b) enforceable by a gate, or (c) a denser encoding of the same fact. Judge every convention below by those three, never by how VS Code paints it.

## Code comments

### The decision procedure (run before writing ANY comment)

An agent about to write, keep, or review a comment runs this ladder top-down; first hit wins.

1. **Refactor first.** Can a rename, a smaller function, or a stronger type make the comment unnecessary? → Do that. Write no comment. (See §Types before comments — most WHAT-comments are a missing type.)
2. **WHAT-narration?** Does it describe what the code plainly does at first glance? → Delete. The code speaks; the comment is token waste that will drift.
3. **Type-expressible?** Is the fact a shape, a legal-values set, an immutability, a unit, a case-exhaustiveness? → Encode it in the type system; delete the comment.
4. **Irreducible WHY?** Non-obvious invariant, gotcha, security belt, "looks wrong but is deliberate," cross-file coupling the import graph can't show, unit/constraint the type can't carry? → Keep. Terse. This is the only comment that earns its place.
5. **Stale or lying?** Contradicts the code, cites a resolved decision, describes removed behavior? → Delete on sight, in whatever change you're making. A wrong comment is a **defect**, gated like a bug — never "someone else's cleanup."

**Terseness never overrides a load-bearing warning.** A security belt, a deliberate-surprise marker, or a non-obvious constraint may be as long as it needs to be to stop the next agent from "fixing" it. Rung 4 comments are the one place verbosity is correct; everywhere else it's waste.

```ts
// BAD — WHAT-narration (rung 2): the code already says this
// loop over the members and add each id to the set
for (const m of members) ids.add(m.id);

// BAD — restates the type (rung 3 / @param rule): zero information beyond the signature
/** @param userId the id of the user @returns the user's settings */
function settingsFor(userId: UserId): Settings;

// GOOD — irreducible WHY (rung 4): invisible in code, stops a plausible "fix"
// Deliberately NOT batched: sqlite WAL readers see per-statement snapshots and the
// reconcile gate (D58) diffs row-by-row against live. Batch this and drift hides.
for (const row of rows) upsert(row);

// GOOD — security belt (rung 4, verbose is correct): load-bearing warning
// SECURITY: agent-principal ids must never reach notification recipients (D60).
// The type system can't enforce it here because recipients arrive as bare strings
// from the wire. Removing this check re-opens AP1. Test: agent-principal.suite.
if (isAgentPrincipal(recipient)) throw new RecipientForbiddenError(recipient);
```

### Types before comments (the substitution table)

Every entry kills a class of comment. Reach for the type first; a comment carrying a fact from the left column is a rung-3 delete.

| comment being replaced | type feature (TS version) |
| - | - |
| "must conform to shape X" on a literal | `satisfies` operator (4.9) — checks without widening |
| "pass this as const / keeps literal types" | `const` type parameters (5.0) |
| "remember to handle new variants here" | discriminated union + exhaustive `never` check — compiler errors on the missed case |
| "this is millimeters / this is a user id not an org id" | branded types; template-literal types for string formats |
| "do not mutate" | `readonly` fields, `Readonly<T>`, `readonly T[]`, `as const` |
| "legal values are a, b, c" | string-literal union (enum is banned repo-wide; unions ARE the enum) |
| "caller must close/release this" | `using` + `Symbol.dispose` (5.2) |
| "returns whether x is a T (narrows)" | type predicate — explicit `x is T`, or inferred (5.5) |
| "accepts either (a) or (a, b) shapes" | overload signatures |

JSDoc *type* tags (`@type`, `@param {T}`, `@returns {T}`, `@template`, `@typedef`, `@callback`, `@satisfies`, `@overload`, `@import`) are the JS-file dialect of the same features — TypeScript honors them **only in .js files**; in `.ts` they are FORBIDDEN (real syntax exists; the tag is a worse duplicate). This repo is TS-only, so they never appear.

### TSDoc law

Exported/public API uses TSDoc (`/** */`) — the one cross-tool doc-comment standard (block, modifier, and inline `{...}` tag kinds per the spec). Precision about what actually consumes a tag, because the tiers differ:

- **TSDoc spec** (tsdoc.org) defines syntax + the standard tag set. Syntax validity is machine-checkable (`eslint-plugin-tsdoc`, the official parser).
- **tsc / language service** understands only the *documentation* tags in .ts files (`@deprecated`, `@see`, `{@link}`); it type-checks none of the content. `@deprecated` is the one tag with teeth: `@typescript-eslint/no-deprecated` (type-aware) hard-fails usage of deprecated API — that's a gate, not a squiggle.
- **TypeDoc / API Extractor** consume the wider set (`{@inheritDoc}`, release tags, `@packageDocumentation`…). This repo runs neither, so tags meaningful *only* to them are inert bytes — that alone forbids most of the modifier zoo below.

Tag verdicts (exported/public API; enforce in review):

| tag | verdict | rule |
| - | - | - |
| `@deprecated` | REQUIRED on any deprecated export | MUST carry the migration path (`@deprecated Use {@link newThing}; old path removed after D-n.`). Bare `@deprecated` is a defect. Usage gated via `no-deprecated`. |
| `{@link Symbol}` | REQUIRED for symbol cross-refs | Never a bare prose name for a code symbol — `{@link}` is greppable, resolvable, and rename-detectable. Also legal for doc paths. |
| `@remarks` | ALLOWED | The home of the rung-4 WHY on an export. One block, terse. |
| `@param` / `@returns` | CONDITIONAL | FORBIDDEN when it restates what the type already says (pure restatement = token waste + drift surface). REQUIRED when it carries a constraint, unit, or invariant the type canNOT express (e.g. "epoch **seconds**, not ms", "must be already-normalized", "throws before any write"). No blanket "document every param." |
| `@typeParam` | CONDITIONAL | Same rule as `@param`. |
| `@throws` | ALLOWED | Only for throws a caller must actually handle — the one contract fact TS types can't express. |
| `@defaultValue` | ALLOWED | Only when the default is not visible in the signature (e.g. applied deep in the callee). |
| `@example` | ALLOWED sparingly | Only when usage is non-obvious from the signature. Must compile against the current API — a broken example is drift. |
| `@internal` | ALLOWED | Marks exported-only-for-wiring API as not-public. |
| `@see` | ALLOWED | Pointer to the one home of a fact (a `core/` doc, a ledger row). Prefer `{@link}` for code symbols. |
| `@packageDocumentation` | ALLOWED | At most one, on a package entry point, only if the package has cross-cutting WHY that doesn't fit `core/`. |
| `{@inheritDoc}` | FORBIDDEN | Copy-by-reference duplication; resolved only by TypeDoc/API Extractor, which we don't run — an agent reading raw source gets nothing. |
| `@public` `@private` `@protected` | FORBIDDEN | Visibility is TS keywords, not comments. |
| `@alpha` `@beta` `@experimental` | FORBIDDEN | Release-stage machinery for published-SDK pipelines (API Extractor trimming). This repo ships no public SDK; everything visible is supported. The only lifecycle tags here are `@deprecated` and `@internal`. |
| `@override` `@sealed` `@virtual` `@readonly` `@eventProperty` | FORBIDDEN | Class-hierarchy/emitter machinery; TS's `override` keyword and `readonly` modifier are the real, compiler-checked signal. |
| `@privateRemarks` | FORBIDDEN | Its semantics ("strip from public docs") require a doc emitter we don't run. Write a normal `//` WHY. |
| `{@label}` | FORBIDDEN | Only meaningful as an `{@inheritDoc}` selector target. |

**Prefer a standard tag over freeform prose.** If a fact fits a mandated/allowed tag, put it in the tag — a deterministic anchor an agent can grep (`ugrep '@throws'`) beats the same fact buried in a sentence. Freeform doc prose is for what no tag encodes.

**Non-exported code** gets no TSDoc ceremony: plain `//` comments, subject to the same decision procedure. A rung-4 WHY on a private helper is a `//` line, not a doc block.

### Comment budgets (D66 — the diet convention; hold the line)

The 2026-07-13 fleet diet cut the comment corpus ~60% (39%→~15% comment-to-code) under these budgets. They are now standing law — regrowing the old density is a review defect:

- **File header: ≤3 lines** — what the file is + its non-obvious invariant. A file whose purpose is obvious from its name and exports gets NONE. (Gate files in `scripts/check/gates/` get ≤5 — a gate's header IS its contract. Probe tools' usage-manual headers are the other sanctioned exception.)
- **A WHY is ONE line.** If it can't be said in one line it's narration — the ledger or nothing. The rung-4 verbosity license (security belts, deliberate-surprise markers) survives, but it is a license for load-bearing warnings, not essays.
- **No history in comments:** no dates, no "audited/verified," no "was a bug/the old code," no campaign or wave references, no attribution. Git history is the archaeology.
- **No doc citations in comments** — no D-numbers, no §-refs, no doc filenames. The ONE exception: `FLAG[PD-n]` (gate-reconciled). Cross-cutting WHY lives in `core/`; the comment states the constraint itself, not a pointer to where it was decided.
- **JSDoc on an exported symbol: one line**, only when the name alone is insufficient. No `@param`/`@returns` restatement (unchanged rule above).

### Drift is a defect

Change code → fix or delete its comment **in the same change**. A lying comment is a bug and is gated like one. This includes `@example` blocks that no longer compile and `@deprecated` pointers to removed replacements.

### FLAG convention

- `FLAG[PD-<n>]` — tracked debt/deferral; MUST have a row in the debt registry (`Core-Audits-and-Debt.md`), grep-reconciled by the `pd-citation-integrity` gate.
- `FLAG[<name>]` — permanent architectural marker (documents why a design is deliberate). DO NOT "resolve" or remove these.

## Prose / knowledge docs (`docs/`)

- **Taxonomy is physical (D66).** `core/` = current law · `history/` = resolved archeology (dated audits, cleared ledgers, landed program records) · `proposed/` = **exactly ONE active program doc at a time** (+ its README, which is the rule + the map). Unbuilt/future design sets live OUT of the repo in the owner's staging area (`../orbweaver-proposed-staging/`) until scheduled — an agent can only quote what's in the tree, and the tree carries one program. Nothing lives at repo root. A doc lives in exactly one tier.
- **Built code has no prose doc.** For a built module/domain, the code + its file-headers + tests ARE the doc. The cross-cutting law it carries promotes UP to `core/`; the per-module prose is deleted.
- **Ledger-entry style (D66).** A D-entry records the STANDING RULING only: the rule, the non-obvious constraint that protects it, and the homes. No provenance trails, no audit stamps, no attribution quotes, no alternatives-considered, no supersession archaeology — a superseded ruling's text is ABSORBED into its winner and the loser dies (git history keeps the journey). An enumeration that grows with code (a tuple's members) is cited as "currently X, Y — the tuple is the truth, not this list," never as a bare closed list that rots. Future-committed designs write "COMMITTED (not yet built): …", never present tense — a cold agent must be able to tell landed from planned.

### Relocation & retirement (run this BEFORE moving, renaming, or deleting any doc)

Since the 2026-07-13 comment diet, CODE does not cite docs (the one exception: `FLAG[PD-n]`, which cites the debt REGISTRY, not a path) — so doc moves are a docs-tree concern plus two hard anchors:

1. **The two hard anchors, checked first:** (a) the `pd-citation-integrity` gate reads `Core-Audits-and-Debt.md` + `history/Core-Debt-Cleared-Ledger.md` by PATH — those two files never move without updating the gate in the same commit; (b) sweep `scripts/` for any other tool that reads a doc path (`/usr/bin/grep -rn 'docs/architecture' scripts/`).
2. **Doc-side sweep:** repoint every citation in the docs tree + `AGENTS.md`/`CLAUDE.md`, re-fix the moved file's OWN relative links (depth changed), update `proposed/README.md` if tracked there, `pnpm check:docs`, then re-run the sweep and prove zero references to the old path. One commit.
3. **§-numbers of law docs stay stable** (`ui-package-design.md` is the canonical example) — other docs and future doc text cite them; renumbering is drift by another name.
4. **Retirement paths:** SUBSUMED → `git rm` + repoint to the subsuming doc (never a tombstone) · CLOSED record / landed program → `git mv` to `history/` · BUILT → delete per the built-code rule, promoting cross-cutting WHY to `core/` first · NOT-YET → move OUT of the repo to the staging area (the D66 eviction pattern), never parked in-tree.
5. **Never** invent a new directory tier, reintroduce doc citations into code comments, or move a file another live session has dirty.

- **Structure.** One topic per file, under \~40 KB. Compact tables only — alignment-padding is pure token waste (mechanics + measured damage in the formatter law). No prose reflow.
- **Frontmatter (required, deliberately minimal):**
  ```yaml
  ---
  kind: law | spec | reference | history
  status: active | draft | superseded
  supersedes: <path>   # optional
  updated: YYYY-MM-DD
  ---
  ```
  Do NOT grow this schema casually — every field is corpus-wide maintenance. `tags:`/`owner:`/`toc:` were considered and rejected (retrieval works off headings + grep; ownership is git blame). A new field enters only via the formatter-law zod schema, with a reason.

### Markdown construct verdicts (machine-parseability + token cost)

| construct | verdict | why |
| - | - | - |
| GFM pipe tables, compact | REQUIRED for tabular facts | Densest reliable shape for row/column facts; GFM-spec, parsed by remark-gfm. Compaction rules in the formatter law. |
| Fenced code blocks with language tag | REQUIRED | The language tag is free machine signal (` ```ts `, ` ```yaml `, ` ```sql `). Never an untagged fence. |
| ATX headings, literal titles | REQUIRED | Headings are the retrieval anchors — name the fact ("Reconcile drift gate"), never narrate ("Where it gets interesting"). One topic per heading. |
| YAML frontmatter | REQUIRED | Schema above; passes through the formatter verbatim. |
| GitHub alerts (`> [!WARNING]` …) | ALLOWED sparingly | GitHub extension, NOT GFM-spec — it degrades to a plain blockquote, but the `[!WARNING]` token survives as a cheap greppable severity marker. One line, no nesting, only for genuine belts (the five types: NOTE/TIP/IMPORTANT/WARNING/CAUTION). |
| Task lists (`- [ ]`) | ALLOWED only in `proposed/` | Build checklists for unbuilt specs. A checked-off list in `core/` is history masquerading as law — move or delete it. |
| Footnotes (`[^1]`) | FORBIDDEN | Splits a fact from its context; forces nonlocal resolution on a reader that excerpts by offset. Keep the fact inline. |
| Definition lists | FORBIDDEN | Not GFM; not parsed by the formatter. Use a compact table or bold-term bullets. |
| Inline HTML | FORBIDDEN | Defeats the formatter, greps badly, costs tokens. Markdown constructs only. |
| Decorative rules, emoji headers, badges, ASCII art | FORBIDDEN | Zero information per token. |

### Writing for the machine reader

- **Navigational, not narrative.** State the rule/fact, then point to its home. No scene-setting, no "in this document we will," no summaries that restate the sections they summarize.
- **Link to the one home; never restate.** Repeating a rule from another doc creates a second copy that WILL drift (principle 5). Write `see Core-Docs-Formatting-Law.md §rules` and stop.
- **Front-load the verdict.** REQUIRED/FORBIDDEN/the number/the path goes first in the sentence; justification after. Agents excerpt from the top.
- **No hedging filler.** "It's worth noting that," "generally speaking," "as mentioned above" — cut. If a claim is uncertain, say `unverified:` explicitly; don't soften it into mush.
- **Staleness.** A dated/resolved audit moves to `history/`. A "Status: planning" doc whose thing is built is deleted. A stale pointer ("latest decision D54" while the ledger is at D61) is drift — fix or delete.

## Agent-context files (`AGENTS.md`, `CLAUDE.md`, `AGENTS.md`, the constitution)

- Keep them **terse and navigational** — a map, not a textbook. Point to the specific home of each rule; do not restate it. The evidence is explicit that comprehensive architecture overviews *hurt* agent task success and inflate cost (generic overviews trigger unbounded exploration). Human-curated + minimal beats generated + exhaustive — the measured gap is direction-changing, not marginal.
- Never bulk-generate these files from the codebase; that's the configuration measured to lower success while raising cost 20–23%.

## Enforcement (what makes this law)

- `pnpm format:docs` / `check:docs` — compact tables + frontmatter (mechanics in `Core-Docs-Formatting-Law.md`).
- `pd-citation-integrity` — every in-code `FLAG[PD-n]` ↔ a registry row.
- Structural gates + a standing review rule: an inconsistent comment or doc is a **defect**, not a nit. The decision procedure in §Code comments is the review checklist.
- **Doc-comment gates (wired 2026-07-03 on `server`/`kit`/`db`/`contracts` — the typed exported-API surface, both hard `error` gates):** `@typescript-eslint/no-deprecated` (type-aware) rejects any use of a `@deprecated` symbol. `tsdoc/syntax` (`eslint-plugin-tsdoc`, the official parser) rejects malformed doc comments + non-standard tags — a `{…}` prose token wants backticks, a bare `@orb/…` name wants `{@link}`. ESLint also runs on `ui`/`client`/`tests/ui` (the react-surface gates).

## Evidence

Young field — mostly 2024–2026 primary papers; do not over-anchor on any single one. The direction is consistent across independent sources. Full adversarially-verified distill: the 2026-07 deep-research run (11 findings, 1 refuted claim).

- Wrong ≫ missing, asymmetric harm — Macke & Doyle (NAACL 2024 Findings); CodeCrash (NeurIPS 2025): misleading NL −23.2% avg, −13.8% even with CoT; models shortcut-reason over NL cues.
- Comment/code drift ↔ bugs (\~1.5× / 7 days, decaying to \~1.14× by 14) — arXiv 2409.10781 (Java; correlation, not causation).
- Correct docs ≈ no inference-time benefit (coverage improved; success didn't) — Macke & Doyle.
- Prose 25–40% compressible, no quality loss — ShortenDoc (ACM TOSEM, 10.1145/3735636).
- Agents over-retrieve (recall ≫ precision; explored ≫ utilized) — ContextBench (arXiv 2602.05892).
- Context files dominant but mixed/negative effect; generated files −0.5–3% success, +20–23% cost; human-written +4% (n.s.) — ETH (arXiv 2602.11988); adoption (arXiv 2602.14690); small-scope efficiency counterpoint (arXiv 2601.20404).
- Code-only fails on unencoded decisions — arXiv 2605.08112 (weakest source: vendor preprint, tiny N; its 46%→95% headline claim was refuted in verification).

Tooling claims (official docs; verified 2026-07):

- TSDoc standard: tag kinds (block/modifier/inline), tag set, standardization groups — [tsdoc.org](https://tsdoc.org/), [tag kinds](https://tsdoc.org/pages/spec/tag_kinds/).
- tsc supports only *documentation* tags (`@deprecated`, `@see`, `@link`) in .ts files; all type-carrying JSDoc tags are JS-only — [TS JSDoc reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html).
- `satisfies` operator — [TS 4.9 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html). `const` type params, JSDoc `@satisfies`/`@overload` (JS files) — [TS 5.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html). `using`/`Symbol.dispose` — [TS 5.2](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html). JSDoc `@import` (JS files), inferred type predicates — [TS 5.5](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html).
- `@typescript-eslint/no-deprecated` — type-aware rule flagging usage of `@deprecated` code — [typescript-eslint.io/rules/no-deprecated](https://typescript-eslint.io/rules/no-deprecated/).
- GFM spec (tables, task lists, strikethrough, autolinks) — [github.github.com/gfm](https://github.github.com/gfm/). Alerts + footnotes are GitHub *extensions*, not GFM-spec — [GitHub writing syntax docs](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax).
