# Unit: contracts

Band L. Path: `packages/contracts/` (221 tracked files, 26.8K TS lines; 48 exported subpaths).
Governing law read in full: `.claude/rules/contracts-and-kit.md` contracts section; ADR 0132
(the PROSE-1 registry ruling); AGENTS type-home rule (wire shapes live here).

## Sweeps

- Deps and isomorphism: package.json declares exactly `@orb/kit` + `zod` and the import graph
  matches (external deps are only zod + `@orb/kit/*` subpaths; 170 of them `@orb/kit/ids`). Zero
  `node:`, zero `TextEncoder`/`Buffer` use — only prose explaining their absence; `plugin/ui.ts:1152`
  hand-computes UTF-8 byte length per the isomorphic rule.
- Escape hatches: ZERO `any` types, zero lint suppressions, zero `@ts-` escapes, zero TODO/FIXME.
  (kit had 3 documented suppressions; contracts has none.)
- Exports parity: 48 subpath exports; three index-bearing dirs are deliberately internal
  (`card-face`, `prose-slot`, `inference/capability`) — reached only via the `#` import map, and a
  probe import of `@orb/contracts/prose-slot` from outside earns `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Internal import style: zero self-imports by package name; cross-module edges mix `#name` (183
  lines) and `../module/file.ts` (114 lines) — both are established idiom here (`#*` maps only to
  module roots; relative reaches sibling files). NOT drift, unlike kit's lone relative (its `#name`
  convention is dominant there).
- Chat-bus free-text law: TRUE — zero raw `z.string()` across all five bus files
  (`chat/bus.ts`, `rpg/bus.ts`, `user-bus`, `events`, `workloads/events`); events are closed unions
  of branded ids + enum literals, and `chat/bus.ts`'s header carries the payload-allowlist ruling.
- Bus coverage claim ("the bus coverage check and the client consumer map pick it up immediately")
  — TRUE with receipts: `tests/contracts/events/bus-registry.test-d.ts` (BeltMismatch totality
  machinery, both omission and invention named), `bus-payload-safety.test-d.ts` (credentials and
  economics fields proven TYPE-UNREPRESENTABLE across all ten bus roots), and the client seam
  `packages/client/src/data/bus/apply-chat-bus-event.ts:36,160` ends in `assertNever`.
- versioned-config whole-array-catch law: header documents the rule and its history
  (`versioned-config/index.ts:27-50`); the element-wise collection helper exists (`:214-236`); every
  `.catch()` in `settings/index.ts` is per-KEY (scalar/object → undefined, absence = documented
  inherit) — zero live whole-array catches in the package except finding 2.
- prose-slot lastIndex law: TRUE — `prose-slot/index.ts:409-411` resets `lastIndex` before the
  global-regex boolean test, with the alternating-call reasoning.
- refine-vs-DB law, representative spot-check: `regexScriptBehaviorSchema` superRefines and the
  `regex_scripts.behavior` column is NOT NULL with no default (`packages/db/src/schema/regex.ts:59`)
  — and the read seam degrades to a typed `INERT_BEHAVIOR` via `.catch`
  (`packages/server/src/domain/regex/persistence/queries.ts:26-29`), exactly the law's
  "derive or degrade, never reject". Full sweep of the 60 refine sites belongs to the server domain
  units (each refine's stored-column pairing is checked at its verb).
- Tests (59 mirrored files, `.contract.test.ts` + `.test-d.ts`): quality high — the belt-registry
  test proves totality (not membership) both directions; payload-safety is a type-level door, not a
  runtime grep; correlated-variants probes real correlated rejections (relay `off` + url fails).

## Findings

- \[P2] `packages/contracts/src/prose/prose-baseline.json` is a GATE WITH NO GATEKEEPER. Two comments
  present it as enforcement — `prose-slot/index.ts:25` "Bumped in the SAME commit as any `text`
  change — **enforced by** `prose-baseline.json` (PROSE-1 §4.4)" and `preset/index.ts:652` "gated by
  `prose-baseline.json`" — but nothing reads the file: tracked-tree grep (10,364 files scanned;
  second method: `git grep` at `821e8f8dff^` vs HEAD) finds only the two comment mentions. The
  reader was `tooling/src/verify/ops/gen/prose.ts` (the `baseline prose` verb: refuse when
  sha256(text) changed while `version` stayed) plus its contract test — both deleted with the verify
  CLI in 821e8f8dff (2026-10-21). That removal left the data file, renamed its consumer test into
  the reference-only legacy tree, and left the comments claiming the door still exists. The
  trust is load-bearing: a host's stored `baseVersion` staleness signal (D132 clause E's default
  identity) is only meaningful if the version↔text pairing cannot silently break. Since the death,
  four commits hand-updated the JSON (`0c5293e85e`, `f0e0c9c487`, `7398f89038`, `481d5b1cab`) and
  ALL FOUR paired their bumps correctly — a one-off recompute of all 156 slots is exact-match green
  (probe run, recipe recovered from the deleted generator: `sha256(slot.text)`, refuse condition
  `prior.sha256 ≠ hash ∧ prior.version ≥ slot.version`). So the rope holds on human honesty, not
  mechanism — which is precisely what the deleted header called out: the manifest is what makes the
  bump "a MECHANISM instead of a discipline". Direction: a ~20-line
  `tests/contracts/prose/prose-baseline.repo.int.test.ts` re-running the dead contract test's check
  against the committed manifest (the repo.int pattern already exists; no generator needed — the
  hand-update regime demonstrably works). Second verify-CLI casualty after kit's unicode generator
  (kit unit finding 1) — same removal program, same failure shape. Related lead for the same fix
  commit: the `PROSE-1 §4.x` cites (§4.1/4.2/4.4/4.6/6.3, across `prose-slot/index.ts`,
  `settings/index.ts`, `discovery/prose.ts`) name no in-tree document — `docs/adr/0132` (39 lines)
  has no §4.4 and `docs/` holds no PROSE-1 plan; if the spec lives on the work board, its
  enforcement claims need the same truthing.
- \[P3] `packages/contracts/src/character/index.ts:230` — `greetingsColumnSchema = z.array(greetingSchema).catch([])`:
  the exact shape the versioned-config law forbids ("a whole-COLLECTION `.catch([])` erases every
  good row with the one bad one, invisibly to `intact`" — `versioned-config/index.ts:30`), living
  outside that law's jurisdiction. At the read seam (`domain/character/persistence/queries.ts:846`)
  one malformed greeting silently loses ALL greetings; the refinery seam has already learned to
  work around it (`refinery/persistence/queries.ts:210` unwraps the catch and supplies its own
  handler). Direction: element-wise heal here too, or generalize the versioned-config rule to a
  shared collection-parse seam.
- \[P3] D141 archaeology cluster (cross-cutting, extends the kit unit's count): 57 files carry dates
  (`preset/index.ts:5` "a contracts-side copy lived here until 2026-08-02"), 75 files / 382 lines
  cite issue and board numbers. Same tree-wide sweep candidate as kit finding 2 — contracts is the
  cluster's densest package so far.

## Verdict

reviewed (3: one P2, two P3; one header FIXED in-unit — `preset/index.ts` claimed "Sibling module:"
and listed one of four). contracts is disciplined: zero escape hatches of any kind, the three
rules-checkable laws (bus closure, coverage doors, element-wise heal, lastIndex) all verify TRUE
with receipts, and the read-seam degrade pattern shows the refine law actually practiced, not just
written. Its P2 completes the sweep's emerging pair: the verify-CLI removal (821e8f8dff) left TWO
dead doors whose prose still claims they shut — kit's unicode generator and this sha-gate. The
discipline survived both by author honesty so far; the next context that edits prose text without
reading the comment won't be stopped.
