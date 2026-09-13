---
kind: evidence
status: active
updated: 2026-09-13
---

# #2067 — source-side nested-template refusal and current-population census

## Repair

`formatMarkdown` now refuses the exact stable-misparse class the prospective-write guards cannot see: two
single-delimited inline-code nodes, contiguous through non-whitespace template content carrying `${…}`.
That is how CommonMark parses an intended outer code span such as
`` `startsWith(`${EXEMPT_DIR}/`)` ``: the template literal's inner backticks terminate and reopen the
Markdown span. The check reads parsed node positions back against source bytes, reports the source line,
and asks for a longer delimiter. It does not treat punctuation, ordinary separated inline-code spans, or
a deliberate source-escaped literal backtick as evidence.

The committed controls drive the write door in both directions. The malformed single-delimiter form is
refused and left byte-identical. Its canonical ` `startsWith(`${EXEMPT_DIR}/`)` ` twin and ordinary
`left` / `right` spans pass. The existing overflow, equal-width bare-pipe, escaped-pipe, and literal-backtick
controls remain intact.

## Current target census and dispositions

Re-resolved through `formatTargets([])` on `cc4f60581`: **360 tracked targets**. The union locator was:

1. any source line carrying a backslash-escaped backtick, which locates already-cemented bytes but also
   deliberately quoted literal backticks; and
2. the new source-side nested-template refusal over every target.

It produced **34 files before repair**: 30 escaped-backtick carriers, four nested-template-only carriers,
and two of the escaped-backtick carriers also carrying the nested-template class. Every candidate line was read. Dispositions:

| file | disposition |
| - | - |
| `.claude/agents/side-eye.md` | **repaired** — two glued/cemented instruction spans already identified by the prior refutation row |
| `docs/design/gate-config-system.md` | **repaired** — intended type expression contains a template-literal type; longer delimiter restores one span |
| `docs/design/mocks/config-collections/REVIEW-sideeye.md` | retained — the escaped span is a verbatim historical measurement cell containing pipe-separated output; changing its quote syntax is not needed to recover a current instruction |
| `docs/design/mocks/config-collections/REVIEW-stickler.md` | **repaired** — the new guard identified a JSX `backLabel` containing a template literal; longer delimiters preserve the expression |
| `docs/design/note-token-intent-history.md` | **repaired** — escaped opener swallowed the bold boundary around `requiredMacros` |
| `docs/design/parked-options-config-port.md` | **repaired** — new guard identified the href expression's nested template literal; longer delimiter is unambiguous |
| `docs/design/state-paint-census.md` | **repaired** — the code value is one literal backslash and therefore needs a longer delimiter |
| `docs/reviews/gate-runtime/checkpoint-2026-09-05.md` | **repaired** — cemented double opener around a plain commit range |
| `docs/reviews/gate-runtime/mixed-runtime-front-door.md` | **repaired** — five cemented loader-message / identifier spans; longer delimiters preserve inner identifier spans |
| `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` | retained by ownership: its escaped-backtick line deliberately quotes the old corrupted bytes; current line 995 is a separate live overflow refusal in the root-owned aggregate ledger and is reported to the coordinator, not edited here |
| `docs/reviews/gate-runtime/v-additions-wave-2026-09-12.md` | retained — historical verbatim failure output with escaped delimiters |
| `docs/reviews/gate-runtime/v-audit-wave3-2026-09-12.md` | retained — blockquoted historical proposed text, not current law |
| `docs/reviews/gate-runtime/v-audit-wave6-2026-09-12.md` | retained — historical literal source spelling |
| `docs/reviews/gate-runtime/v-exemplar-audit-2026-09-12.md` | retained — historical measured source spelling |
| `docs/reviews/gate-runtime/v-fix-wave-4-2026-09-12.md` | retained — the report deliberately preserves the malformed fixtures and formatter output that established #2235; the existing formatter still refuses it rather than rewriting evidence |
| `docs/reviews/gate-runtime/v-instruments-2026-09-12.md` | retained — historical command/output and literal-source evidence; reconstruction is outside this repair's current-contract scope |
| `docs/reviews/gate-runtime/v-migrations-wave-2026-09-12.md` | **repaired** — new guard identified the `startsWith` nested-template expression; longer delimiter plus missing prose spacing |
| `docs/reviews/gate-runtime/v-night-conversions-2026-09-12.md` | **repaired** — new guard identified both sides of the nested-template cut; longer delimiters restore the expressions |
| `docs/reviews/gate-runtime/v-wave-5-2026-09-12.md` | retained — historical rendered diagnostic spelling |
| `docs/reviews/gate-runtime/v-wave-7-2026-09-13.md` | retained — deliberately names an authored escaped pipe and escaped literal backtick as the negative control |
| `docs/reviews/gate-runtime/v-wave-8c-2026-09-13.md` | retained — deliberately describes and quotes the cemented bytes under adjudication |
| `docs/reviews/gate-runtime/x-vendor-hooks-pins-2026-09-13.md` | retained — verbatim runtime error text inside an evidence table |
| `docs/reviews/research/2026-08-30-brief-3-unpaired-value.md` | retained — historical source spelling in a research table |
| `docs/reviews/research/2026-08-30-vocab-roster-cast.md` | **repaired** — the new guard identified a JSX `aria-label` containing a template literal |
| `docs/reviews/side-eye/2026-08-29-saved-casts-rules.md` | **repaired** — the new guard identified four JSX/template-literal fix examples; longer delimiters preserve each expression |
| `docs/reviews/side-eye/2026-08-30-bracket-verify.md` | retained — dated visual-review receipt and proposed-fix prose; reconstruction would change historical evidence without a current normative consumer |
| `docs/reviews/side-eye/2026-08-30-context-bracket.md` | retained — dated visual-review command/receipt prose; same historical-evidence boundary |
| `docs/reviews/side-eye/2026-09-02-home-rail-drive.md` | retained — literal console/performance output |
| `docs/reviews/side-eye/2026-09-05-characters-hub-and-scale.md` | retained — historical source and ARIA receipt spelling |
| `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg1.md` | retained — historical source/search command evidence |
| `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg4a-chat.md` | retained — historical search command evidence |
| `docs/reviews/stickler/2026-09-04-snap-ui-audit-capability-census.md` | retained — historical contract spelling |
| `docs/reviews/stickler/2026-09-11-tool-guard-reenable.md` | retained — the report quotes malformed spellings as findings and proposed lessons; rewriting would alter the recorded evidence |
| `tooling/src/verify/gates/GATE-AUTHORING.md` | retained — deliberately escaped Markdown table syntax is the value being shown |

After the twelve unambiguous repairs, the nested-template locator reports **zero**. The escaped-backtick
locator reports 25 files, all classified above as deliberate historical/source literals or ownership-held
aggregate evidence. The formatter reports two existing refusals: the deliberately non-formattable
`v-fix-wave-4` evidence report and the separate aggregate-ledger overflow. Neither is silently rewritten.

## Evidence

- Red-first: the new malformed-template test failed because `outcome.refused` was empty; the other 15 tests
  passed.
- Fixed source: the focused formatter test passes 16/16; the complete `tests/tooling/doc-catalog` selection
  passes 69 runtime tests plus 3 `types-node` assertions.
- Scoped Biome and ESLint pass on the implementation and test; native `tooling/tsconfig.json` passes.
- The thirteen owned Markdown files format without refusal and pass a second `--check` unchanged.
- Because one repaired site is Claude role prose, `pnpm agents:sync` regenerated only
  `.codex/agents/side-eye.toml`; `pnpm check:agents` passes and the agent-sync selection passes 4 runtime
  tests plus 1 `types-node` assertion.

No catalog, aggregate ledger, or lifecycle state is changed by this lane.

## Corrective review leg

Independent review found that the first repair receipt overstated the detector's precision. The source shape
is ambiguous: intentional contiguous `` `left`${VALUE}`right` `` fragments parse exactly like a malformed
single-delimited outer span. The formatter cannot infer author intent from those bytes, so it conservatively
refuses both and directs both authors to one content-preserving longer-delimiter span. The added control pins
that refusal, the canonical remedy, and the existing acceptance of whitespace-separated inline-code spans.

The first census also misclassified `docs/design/state-paint-census.md`: its source locator saw a literal
backslash beside the span's legitimate closing delimiter. The original single-delimited code span already
rendered the intended lone backslash; the longer-delimited replacement rendered backtick + backslash +
backtick. This leg restores the original bytes and reclassifies that candidate as retained. The corrected
post-repair census is **eleven repaired documents**, zero nested-template candidates, and **26** retained
escaped-backtick carrier files. This correction supersedes the first leg's twelve-repair / 25-retained
counts without rewriting that historical receipt.

The same review found that the side-eye repair weakened exact operational spellings. The Claude source now
preserves `styleAndLayoutStart > 0`, `blockingDuration > 50ms`, `compositorClean:false`, `0s`, and
`transition-duration` as code values with valid delimiters and spacing; `agents:sync` regenerated the Codex
mirror from that corrected source.
