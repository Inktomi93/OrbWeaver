# tooling-ui-facts

- Path: `tooling/src/ui-facts/`
- Band: S (5,897 code lines, 37 files — tokei)
- Status: reviewed

## Sweeps

- Hatch sweep: zero suppressions/TODOs; the only `any` hits are a local predicate combinator
  (`structure.ts:45-47`). Zero archaeology (third consecutive unit with none), zero policy
  cites, zero issue cites, zero `tests/legacy` cites, zero sideways/upward relative imports.
- One `catch` (`recipe-check.ts:208`) converts an element-check rejection to a string that
  lands in `failures` and FAILS the apply — a fail-safe conversion, not a swallow.
- Exceptions door (`exceptions.ts`) probed at every level: the refuse-uncited check is live
  code (CITATION regex over `D\d+` or a law/ADR path); the one committed entry's cite
  (`client-architecture-lockdown.md §4.4`) resolves to a real, content-matching section
  (line 144, "Why `shell.css` is the exception"); the excepted site (app-shell scrim
  `<button>`, line 456) is still live in the tree and the fresh report surfaces it under
  `excepted` rather than dropping it silently — the honest shape.
- Closed vocabularies match their prose: `classify.ts` "five-way split" against
  `VERDICTS = [token, recipe, primitive, decide, keep]` (`hand-model.ts`, exactly five).
- Law cites all resolve: `UI-Primitives-and-Reuse.md §13.1` (line 21), the voice table
  (`UI-Architecture-and-Layout.md:316`), lockdown `4.4` from `KEEP_REASONS`, `moveRefusal`
  exists (`move-proof.ts:116`).
- Live door runs: `pnpm ui-facts --only=hand-rolling` scanned 2251 files (1236 ts + 995 tsx +
  20 css — the ts/tsx-merge law honored by the engine itself) and wrote
  `reports/ui-facts/ui-facts.{json,md}`; `--plan/--prove` flags proved live from the
  class-token-to-prop unit.
- Test suite: `pnpm vitest run --config=vitest.config.ts tests/tooling/ui-facts` — 138 tests,
  6 files, all green. The three `toBeGreaterThan(0)` asserts are census floors/positive
  controls (e.g. TV_CALL must see TV calls or the erasure test proves nothing), legitimate.
- `rules.ts` is advisory (RuleCandidate list of what COULD become a lint rule) — no gate-
  renewal promise, D333-clean. `index.ts` "A report: no gate, no baseline" holds: the
  migration TRANSACTION gates via the workflow's steps, the tool itself stays read-only.

## Findings

None.

## Verdict

reviewed (0 findings). The sweep's first clean unit, and the mechanism thesis predicts it: a
young, single-purpose engine with a daily consumer (migrate-owner, the UI program's rank-adjacent
work), whose every header claim I could resolve — and all resolved. Notably it also ships the
positive-control habit the triage item preaches (its own tests refuse to pass on a vacuous
census, its census refuses to hide an excepted site, its exceptions refuse uncited rulings).
If prose-as-such were the disease, a module this comment-dense would be a crime scene; it is
the cleanest file set in the sweep, which is the neglect-mechanism confirmed a third time.
