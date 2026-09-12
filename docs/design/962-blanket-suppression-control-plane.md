---
kind: design
status: active
updated: 2026-09-12
---

# #962 — file-wide lint suppression made structurally unavailable

> Design record for issue #962 (lane `p-biome-zero`, 2026-09-02). Written BEFORE the build; the build is
> exactly this. Receipts are from probes run in the lane's worktree on base `ec1f8fa18`; the probe
> transcripts are cited inline as `probe:<name>` and were reproduced by the orchestrator's verifier.
> Memory lessons consulted: `gate-blind-spots-are-spelling-shaped`, `a-gate-corpus-is-derived-not-hand-named`,
> `presence-ratchet-waiver-vs-real-ct`, `dangling-refs-catches-the-split-string-literal`,
> `terminal-refusal-exit-code-has-coupled-pins`, `fixture-tests-cannot-take-a-whole-ctx`,
> `gate-authoring-lessons-hub` (the `check-gates.int`/`check:structure` collision, "conformance cannot pin
> a refusal", "a real-tree anchor is how a fixture opts in", "config path rot belongs to the
> `*-grant-liveness` family"), `gate-ledger-counts-rot-cite-the-scan-line`,
> `comment-insertion-moves-caught-failure-markers`.

## 0. Premises re-derived (the \~50% stale-row rate applies to briefs too)

| Brief premise | Tree evidence | Verdict |
| - | - | - |
| 70 files / 74 `biome-ignore-all` (45 · 10 · 9 · 7 · 2 · 1) | `rg` over the worktree: 74 directive lines in 70 files; tests/server 52 files (58 directives), tests/contracts 1, tests/kit 1, packages/server/src 12, packages/kit 1, packages/client 1, tooling/src 2; the two other hits are prose in a stickler review | HOLDS |
| the `suppressions` gate exempts `tests/**` | `suppressions.ts:236` `isGovernedTypedSource` admits only `packages/*/src`, `tooling/src`, `scripts`; `mustPass` row "tests are outside the governed typed-source budget" | HOLDS |
| every directive suppresses a live result | `probe:diags` — strip + `biome lint` per file: the 10 `noBarrelFile` blankets under `packages/server/src/**/index.ts` produce ZERO diagnostics because `biome.json` already carries `packages/*/src/**/index.ts → noBarrelFile: off`; biome does not even warn on an unused `-all` (`probe:semantics` f2) | REFUTED for 10/74 — they are dead text |
| the migration target for naming fixtures is "exact line/range directives" | 23 of the 45 naming files carry 10–107 sites spread through the file (their SUBJECT is a foreign wire format); `biome.json` already has the narrower mechanism — a `useNamingConvention` `conventions` override that keeps the rule ON and widens only property-name formats, live on 18 source files incl. the src twins of three of these tests | AMENDED: file-subject files ride the config convention, bounded fixtures ride ranges/lines (§3) |
| pre-commit = "lefthook/pre-commit tooling" | `lefthook.yml` pre-commit runs exactly `pnpm check` (= `verify --static`, whose `structure:full` row is the gate harness) | HOLDS — so the index control is a GATE ARM, not a hook command (§2.3) |

## 1. The law this ships

**A whole-file suppression has exactly ONE home: a `biome.json` override row, which `biome-grant-liveness`
stale-arms. Inside a file, a suppression is bounded by a region the author names — one line
(`biome-ignore`, `eslint-disable-next-line`, `@ts-expect-error`) or a closed range (`biome-ignore-start` …
`-end`, `eslint-disable` … `eslint-enable`) that does not enclose the file's every statement. Every bounded
directive is counted by the `suppressions` ledger, in `tests/**` exactly as in source.**

Three enforcers, each named:

| Clause | Enforcer | Tier |
| - | - | - |
| no file-wide directive in any authored TS/TSX/JS/JSX/JSON/CSS file, tests included | gate `no-blanket-suppression` arms A+B | `structure:full` (static, so the commit hook) |
| the index cannot carry one either (the #954 shape) | gate `no-blanket-suppression` arm C | same |
| every bounded directive is budgeted, two-sided, in tests too | gate `suppressions` (governed set widened to `tests/**`) | same |
| every whole-file grant names a live subject | gate `biome-grant-liveness` (unchanged) | same |

## 2. The gate: `no-blanket-suppression`

`whole-project` · comments-INTENDED (the directive IS a comment) · `markerImmune: true` (§2.4) · no
allowlist, no baseline, no marker — the escapes ARE the narrower mechanisms the message names, and each of
those is already governed by another gate.

### 2.1 What counts as file-wide (the spelling census — `probe:semantics`, biome 2.5.1)

| Spelling | biome's behaviour | Verdict |
| - | - | - |
| `// biome-ignore-all <rule>: r` at the top | honoured | RED |
| `/* biome-ignore-all … */`, `/** … */` | honoured | RED |
| `// biome-ignore-all lint: r` (category, rule-less) · `format:` · `assist/…` | honoured | RED |
| `biome-ignore-all` mid-file, or `{/* biome-ignore-all */}` in JSX | rejected with a WARNING (hidden at `--diagnostic-level=error`) | RED — dead text that reads as protection |
| `/* biome-ignore-all … */` in CSS | honoured | RED |
| `// biome-ignore-all …` in JSON/JSONC (`json.parser.allowComments` is on) | parsed | RED |
| `biome-ignore-start <rule>` with no later `biome-ignore-end <rule>` (same rule key) | suppresses to EOF; warns `suppressions/incorrect` — hidden | RED "unclosed range" |
| a closed range whose start precedes the first statement AND whose end follows the last | honoured | RED "a blanket in disguise" |
| `/* eslint-disable */` or `/* eslint-disable rule */` with no later `eslint-enable` | eslint disables to EOF, silently | RED |
| `// @ts-nocheck` | tsc skips the file | RED |
| the same tokens inside a string literal or mid-sentence in prose | not a directive | silent (the mention fence: a directive is matched at the comment OPENER only, `suppressions.ts` `SUPPRESSION_RE`) |

Sanctioned and silent: line directives; a closed range around a subset of statements; `eslint-disable-next-line`/`-line`; `@ts-expect-error`/`@ts-ignore` (line-scoped by construction).

### 2.2 The three arms and the corpus derivation

- **Arm A — working tree, TS/TSX:** `ctx.files` (the harness walk: `packages/*/src`, `tests/`, `tooling/src`,
  `scripts` — `harnessGlobs`), read through the ONE directive reader `suppressionSites(sf)` exported by
  `suppressions.ts` (gate-to-gate import has precedent: `playwright-css-topology` → `sanctioned-css-homes`),
  which gains `@ts-nocheck` as a directive token. Range pairing is by rule key in source order; whole-file
  detection compares the range's comment positions against the first/last statement of the file.
- **Arm B — working tree, everything else biome lints:** the TRACKED corpus (`git ls-files`, never an FS
  walk — the #973 rule) filtered to biome's language extensions (`js mjs cjs jsx mts cts json jsonc css`),
  MINUS files arm A already visited, MINUS paths biome's own top-level `files.includes` negations exclude
  (read from `biome.json` — a file biome never lints cannot carry a live directive; the count is declared
  as `skipped.biome-ignored`). JS-family text is parsed by the scratch in-memory project
  (`comment-spans.ts`'s door) and read with the same `suppressionSites`; CSS/JSON text goes through a
  quote-aware comment lexer added to `comment-spans.ts` (`commentSpansInText`), which `blankCssComments`
  is refactored onto so there is ONE CSS comment lexer.
- **Arm C — the index:** `git grep --cached -l -I -E <fence>` over the governed extensions yields the
  candidate paths (0.43s over this repo's whole index, `probe:gitgrep`; a candidate fence is sound because
  a blob without any of the tokens cannot carry a blanket); each candidate's staged blob is read with
  `git show :<path>` through the status-returning `runNicedSync` door (no `try`/`catch` — a non-zero
  status or a killed child IS the refusal; the `cat-file --batch` + stdin shape was considered and
  rejected as a new plumbing option for the ten candidates this tree has) and judged by the SAME readers.
  A hit is reported at the path ONLY when the working tree does not also carry it (by token + kind) —
  arm A/B own the rest, so one blanket is one finding — with a message that says so: the #954 shape is
  exactly "index carries it, working tree does not". The whole index is
  judged, not `--diff-filter`: a blanket inherited from HEAD whose removal was never staged would otherwise
  ride into the next commit under a clean working tree.

Real-tree anchor (GATE-AUTHORING §4.5): arms B and C run only when `<root>/tooling/src/verify/gates/no-blanket-suppression.ts`
exists — conformance mini-projects skip them (a declared limit with its own `mustPass` row) and the pin
opts in by planting the anchor in a throwaway git repo (the `biome-grant-liveness.int` shape).

Blindness tripwires, every one a finding at line 0 (unsuppressible by construction): an empty `git ls-files`
corpus on an anchored root; `git grep --cached` exiting other than 0/1, `git show :<path>` exiting non-zero; a biome.json that
does not parse (STRICT JSON — the silent-default trap). Scan health: `ctx.scan({ unit: "file",
candidates, scanned, skipped: { "biome-ignored", "index-candidates", "index-clean" } })`. Arm A's
denominator is the harness's own `scanned N/M`.

### 2.3 Why an arm and not a new verify stage or a hook command

Rejected: **a second lefthook command** — "the tiers ARE the hook wiring" (`lefthook.yml` header); a hook
command outside the registry is folklore wiring. Rejected: **a new static stage** (`suppressions:staged`) —
correct but costs seven coupled sites (registry row, package.json script, cli verb + help, `VERIFY_VERBS`,
`run.int.test.ts`'s static-tier pin, UNIFIED-VERIFICATION-DESIGN §3.2's literal list, `cli.ts` at 188 of
its 200-line cap) to add a mechanism whose only job is to read a few blobs. Chosen: the gate already runs
inside `pnpm check` at pre-commit, gates already shell out to git for their corpus (`memberSources`), and
one home for "what is a blanket" means the index arm cannot drift from the working-tree arm.

### 2.4 `markerImmune` — the written argument §1 of GATE-AUTHORING demands

The gate's subject IS an exemption vocabulary (the linters' own suppression directives). Its findings have
two sanctioned resolutions, both governed elsewhere: narrow to a line/range (counted by `suppressions`) or
move the whole-file decision to `biome.json` (stale-armed by `biome-grant-liveness`). A `@orb-gate-ignore`
above a blanket would be a THIRD door — an ungoverned suppression of a suppression ban, written by the
same hand as the violation. That is class (a) of the cell verbatim ("a marker would absolve the very
finding two-sidedness exists to produce"); `gate-ignore-inventory` and `finding-overload-provenance` are
the precedents, and the cell + `contract/gate.ts`'s comment are updated to name the third occupant.

### 2.5 Proof plan

- Conformance rows (in-memory): one `mustFlag` per spelling in §2.1 that TS can carry (top / block / JSX
  / mid-file / category / `@ts-nocheck` / unclosed eslint block / unclosed start / mismatched start-end
  rule keys / a whole-file closed range), at `packages/`, `tests/`, `tooling/src`, `scripts` paths;
  `mustPass` per sanctioned shape and per declared limit.
- The permanent pin `tests/tooling/verify/gates/no-blanket-suppression.repo.int.test.ts`, red-first against a
  fixture tree: CSS/JS/JSON blankets RED with `file:line`; a biome-ignored path is a declared skip; the
  INDEX control — commit clean, stage a blob carrying a blanket, rewrite the working file clean, run →
  RED naming the staged path and "the working tree does not carry it"; its two twins (staged clean +
  working clean → silent; working carries it → arm A/B reports it as working-tree); an anchored root with
  no git → refuses loudly; and the REAL tree through `projectCtx` + `runPass` → zero findings with a
  non-zero denominator (the post-migration receipt in test form, so it keeps proving).
- `check-gates.int` fixture: a runtime-planted `__g_blanket` test file under the tests root (never on disk —
  the harness plants and removes it) carrying a top-of-file `-all`.

## 3. The migration (per rule class; live-diagnostic counts from `probe:diags`, line numbers in stripped-file coordinates)

Decision procedure, applied mechanically and recorded per file in the report:

1. A rule that cannot be line-suppressed (`useFilenamingConvention`) → exact-path `biome.json` grant.
2. A directive that suppresses nothing → delete (the 10 barrels).
3. The file's SUBJECT is the foreign format / the boundary (≥10 live sites, spread through the file) →
   the NARROWEST config shape that keeps the rule on: the `conventions` override for naming; an
   exact-path `off` only for a rule with no narrower option (`noProcessEnv` on the env reader's own test).
4. Otherwise cluster the sites: ≥3 contiguous → one closed range around the block; else line directives.
   Every directive carries a line-adjacent WHY.
5. A site the blanket hid that is an ORDINARY declaration (a describe-scoped CONSTANT\_CASE const) is
   FIXED (renamed to camelCase), never re-suppressed — `probe:naming` shows biome flags function-scoped
   CONSTANT\_CASE by default, and the tree has such consts only inside the blanketed files (13 in 5 files).

| Class | Files | Mechanism |
| - | - | - |
| `noBarrelFile` ×10 | `packages/server/src/{domain/tool-use,infra/providers,infra/providers/contract,infra/providers/vllm/engine,infra/providers/backends/{agent-sdk,agent-sdk/session,custom-byo,openrouter,kit,kit/openai-compat}}/index.ts` | DELETE — zero live diagnostics (rule 2). `RATIFIED_RULES` loses its `noBarrelFile` row (two-sided: zero live sites) |
| `useFilenamingConvention` ×1 | historical `tooling/src/verify/gates/bus-onData-no-store-write.ts` | exact-path grant (rule 1), retired and removed at #1584 when the gate became `bus-on-data-no-store-write.ts`; `RATIFIED_RULES` loses the row |
| `noBitwiseOperators` ×7 | `packages/kit/src/png-card-chunk/index.ts` (22 sites, the byte-helper tail), `packages/server/src/infra/network/ip-ranges.ts` (13, the parsers + CIDR matcher), `packages/client/src/features/chat/lib/speaker-color.ts` (2, `fnv1aHash`), `tests/kit/png-card-chunk/index.test.ts` (7, the reference CRC-32) → closed RANGES around the codec functions; `packages/server/src/infra/storage/zip.ts` (5 scattered lines), `tests/server/infra/storage/zip.int.test.ts` (2), `tests/server/entry/import/run-bundle-import.test.ts` (1) → LINE directives | rule 4 |
| `noProcessEnv` ×9 / `noProcessGlobal` ×2 | `tests/server/foundation/env/index.test.ts` (18 sites, 48–508: the env reader's own test) → exact-path `noProcessEnv: off` (rule 3); `wire-capture.suite` (8, 37–62), `errors-ring.suite` (4+2, 32–43), `engine-url` (9, 43–64), `egress.int` (9, 123–141), `turn-fault-outcome.suite` (4+2, 35–54) → closed RANGES around the env-crafting setup block (the `noProcessGlobal` twin rides the same range as a second rule on the directive — `probe:semantics` e proves multi-rule directives); `local-light/{embed,rerank,image-embed}.int` (1 each) → LINE directives | rules 3–4 |
| `useNamingConvention` ×45 | 23 file-subject files (env, auth-routes, run-profile-dir-import, st-chat-fidelity, agent-sdk runner/verify-auth/agent-runner/summarize/terminal-tools, custom-byo chat, openai-compat body, build-argv, import substrate persona/chat-input/card/theme/appearance, import verbs group-chats/chats/character, preset contract, serde card/chat) → added to the `conventions` override (exact paths); the override itself is CORRECTED to be a strict superset of biome's default (add `PascalCase`, add `match: "_*(.+)"` so `_`-prefixed names are trimmed as the default does — `probe:naming`: `Authorization`, `PreToolUse`, `__sentinel`, `_registeredTools` were false reds under the override as written); the remaining 22 files (≤9 sites) → ranges/lines (rule 4); 23 describe-scoped CONSTANT\_CASE consts → renamed by ts-morph `rename()` (rule 5; two of them renamed again to `storedTx`/`verifiedClaims` because the camelCase spelling shadowed an inner parameter); `hideChatAvatars_enabled` (mixed-case ST key, 2 sites) → line directives | rules 3–5 |

`tooling/src/codemod/lib/example.ts` (naming, 3 contiguous sites) → one range.

## 4. The ledger: `tests/**` joins `suppressions`

- `isGovernedTypedSource` admits `tests/**/*.ts(x)`; `governedScope(rel)` derives `source | tests` from the
  SAME predicate that admits the file (one derivation, never a second list).
- Ratification splits into TWO tables keyed by rule — `RATIFIED_RULES` (source, unchanged bar the two
  deletions) and `RATIFIED_TEST_RULES` (tests) — because the WHY differs by scope: `noExplicitAny` in
  source is "type-extraction-only instantiation of a vendor escape hatch", in tests it is "deliberately
  off-schema input pushed past the wire type to prove the boundary refuses it". A single table with a
  scope flag would auto-ratify test markers under a source why that is false for them. Each table is
  two-sided in its own scope: a row classifying zero live markers under its scope is RED.
- `RATIFIED_TEST_RULES` at mint: `useNamingConvention` (fixture mirrors a foreign wire), `noProcessEnv`
  (the test's subject is the env boundary), `noProcessGlobal` (a `vi.hoisted` body runs before the file's
  `node:process` import binds), `noBitwiseOperators` (an independent reference codec), `noExplicitAny`
  (hostile input past the wire type), `@ts-expect-error` (a type-level negative pin). Everything else in
  tests (`noNonNullAssertion`, `noPlaywrightWaitForTimeout`, `noMisplacedAssertion`, …) is DEBT — visible,
  burnable, listed by `pnpm debt`.
- Rejected: **a separate test ledger + gate** — two readers, two writers, two stale arms for one concept,
  and a partition that must never double-count only by discipline. One ledger partitions by construction.
- The baseline is regenerated ONCE in this worktree by the single writer (`verify baseline suppressions`)
  and ONCE MORE on the merged tree at the orchestrator's barrier (a sibling fold touching a test marker
  would otherwise red STALE/EXCEED). Reported as two numbers, never one delta: directives tree-wide
  (74 file-wide → 0; bounded replacements counted per class) and ledger rows (source rows shrink; test
  rows are born visible — that is item 3's point, per the orchestrator's pre-ruling 2026-09-02). Measured
  at the lane's regenerate (base `ec1f8fa18`): source 165 rows / 314 sites → 154 rows / 312 sites (all
  ratified); tests born at 112 rows / 255 sites (228 ratified · 27 debt).

## 5. Deferred with receipts

- **Dead bounded directives.** biome reports an unused `biome-ignore` only as a WARNING
  (`suppressions/unused`), which `pnpm lint`'s `--diagnostic-level=error` hides, and `--error-on-warnings`
  does not resurrect a filtered warning (`probe:naming`, exit 0 under the combination). Making dead
  bounded directives structurally impossible means `biome check . --diagnostic-level=warn --error-on-warnings`, which promotes EVERY warning class tree-wide — a lint-policy change measured at
  this lane's single full biome run and decided there: shipped only if the tree is warning-clean, else
  filed with the count. The gate above bans the file-wide class either way.
- `.claude/hooks/*.mjs` is biome-ignored (`!.claude`) and therefore outside arm B by derivation — a
  blanket there suppresses nothing; the count is visible on the gate's scan line.

## 6. Coupled sites (enumerated before building)

Gate: the module · `check-gates.int` `__g_` fixture · `Core-Enforcement-Active-Gates.md` row + the
registered-gate count · GATE-AUTHORING §1 `markerImmune` occupants + `contract/gate.ts` comment ·
`tests/tooling/verify/gates/<gate>.int.test.ts` (a new tracked spec → `docs/test-baseline/manifest.json`
regenerated in this worktree) · `comment-spans.ts` (the CSS/JSON lexer) · `_shared/proc.ts` (`input`).
Ledger (REPLACED 2026-09-12 — the ratchet retired at `a33b2e339`, which converted `suppressions` to
reviewed-grant authority and deleted its count ratchet; `ops/gen/suppressions.ts`,
`suppressions.residual.test.ts`, `suppressions.baseline.json` and `lib/debt.ts` are all gone, so the
four sites this line used to name no longer exist): `tooling/src/verify/gates/suppressions.ts` ·
the `policyId: "suppressions"` rows in `tooling/src/verify/lib/reviewed-grants.ts` · the shared file
door `tooling/src/verify/lib/reviewed-grant-findings.ts` · the doc row ·
`tests/tooling/verify/gates/suppressions-family.test.ts`. Config: `biome.json` (four overrides) · `biome-grant-liveness.int`'s
real-tree row count (grows, stays green). Migration: 70 files + 8 rename files + their suites.
