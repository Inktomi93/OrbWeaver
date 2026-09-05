---
kind: review
status: active
updated: 2026-09-05
---

# Snap CLI argv audit

## Outcome

The post-repair executable surface accepts **130 flag spellings**: 117 through the normal Snap parser (115 public plus the two internal child entries, `--session-daemon` and — since #1163 arm b, 2026-09-05 — `--stage-keeper`), plus 13 report-reader spellings handled by the raw-argv dispatcher. The only accepted spelling alias is `-h` for `--help`; the eight retired spellings below are explicit refusal redirects. The findings in this review were confirmed against the pre-repair tree and then repaired under #1298/#1299: scenario/session lifetime partitioning, export destination truth, strict modal dispatch, report missing-value parsing, ownerless modifiers, descriptor-derived help grammar, chooser/drop coverage, and the approved vocabulary cleanup are now represented in the authoritative ledger below.

This is an analysis-only review. No implementation or test files were changed. Ordinary dirty-tree state was treated as shared in-flight work, not as a finding.

## Confirmed findings

### P1 — scenario argv partitioning silently drops call work and permits browser-lifetime drift

`tooling/src/snap/ops/scenario-prepare.ts:51` and `tooling/src/snap/lib/session-plan.ts:181` — scenario preparation does not implement the declared boot/call partition: legal outer call flags disappear, most boot-only checkpoint flags are overwritten rather than refused, and load fields can vary between checkpoint plans although the browser is launched once from checkpoint zero.

Failure scenarios:

- `--scenario <file> --cpu-throttle 4 --network slow-4g --pages 2 --eval ... --watch --every 250` parses with no outer error, but the checkpoint gets default/preset call values rather than the operator's outer work. The command therefore succeeds while silently not doing requested work.
- A later raw checkpoint can carry a different `cpuThrottle`, `network`, or `scale`; the result plan records the later value, while `scenario.ts:262`/`scenario-host.ts:17` launch the browser only from the first checkpoint and `session.ts:252` applies browser setup once. Reported checkpoint intent can therefore disagree with the environment actually exercised.
- Boot-only checkpoint fields other than the small explicit appearance/theme refusal set are inherited/overwritten without an error, so malformed scenarios look valid.
- Matrix cells call the same scenario runner (`tooling/src/snap/ops/matrix.ts:124`), so matrix composition multiplies rather than repairs the ambiguity.

Evidence produced this session:

```text
$ pnpm tsx reports/stickler/scratch/snap-argv-audit.ts
scenario.outer.errors []
scenario.checkpoint0 {"cpuThrottle":1,"network":null,"pages":1,"aria":false,"shot":true,"eval":[{"expr":"window.__orb?.snap()","page":0}],"watchMs":0,"everyMs":1000}
scenario.errors []
scenario.perCheckpointLoad {"loaded":{"cpu":4,"network":"slow-4g"},"default":{"cpu":1,"network":null},"errors":[]}
```

The governing contract explicitly says scenario checkpoints are session calls and assigns boot-only versus call fields (`docs/design/1208-instrument-substrate.md:64`, `docs/design/1208-instrument-substrate.md:114`). Verdict: **KEEP** the affected flags, but repair one authoritative partition and refuse every field in the wrong lifecycle. Do not invent scenario-only aliases.

### P1 — a later stateful-session call silently ignores `--no-failure-evidence`

`tooling/src/snap/lib/session-plan.ts:106` — `--no-failure-evidence` is declared boot-only by the substrate design but is omitted from the session-only refusal set, then overwritten by the boot plan during inheritance.

Failure scenario: a session is booted with failure evidence enabled; a later `--session <name> --no-failure-evidence ...` parses cleanly, but failure evidence remains enabled. An operator can request reduced evidence retention and receive the opposite policy without an error.

Evidence produced this session:

```text
$ pnpm tsx reports/stickler/scratch/snap-argv-audit.ts
session.noFailureEvidence.refused []
session.noFailureEvidence.inherited true
```

The design lists `--no-failure-evidence` among boot-only settings (`docs/design/1208-instrument-substrate.md:120`); the inheritance path is `tooling/src/snap/lib/session-plan.ts:184`. Verdict: **KEEP**, but reject it on later session calls just like the other boot-only flags.

### P2 — `--session-export <name> --out <base>` is documented but `--out` never reaches the exporter

`tooling/src/snap/contract/help.ts:156` — help promises an export destination override that the session protocol and evidence exporter do not consume.

Failure scenario: `pnpm snap --session-export p-demo --out reports/custom` parses successfully, but the daemon exports to its fixed session-derived path. The user-visible destination contract is false.

Evidence: parser inspection showed both spellings are accepted; `tooling/src/snap/ops/session-client.ts:246` forwards the raw argv to the daemon request, but `tooling/src/snap/ops/session-daemon-request.ts:248` calls the export path without an `out` field, the export source type has no such field (`tooling/src/snap/ops/session-evidence.ts:102`), and the destination is constructed unconditionally from `${source.name}/${kind}` (`tooling/src/snap/ops/session-evidence.ts:202`). Verdict: **KEEP** `--session-export`; either implement the documented `--out` input end to end or delete/refuse that combination. Until then, the combination is **DELETE-REFUSE**.

### P2 — early-exit/admin modes accept unrelated drive flags and discard them

`tooling/src/snap/cli.ts:77` and `tooling/src/snap/cli.ts:129` — materialization, session-admin, and stage-admin dispatch branches preempt normal execution without proving that the rest of argv belongs to the selected mode.

Failure scenarios:

- `node tooling/src/snap/cli.ts --stage-status --click body` exited 0 after printing stage status and never performed the click. It also minted the transient run slot `reports/runs/snap/main-1251943-2026-09-04T01-11-42-024Z/` before returning. Shared run-slot pruning removed the directory later, so the artifact is no longer inspectable; the command/output observed during the run is the durable evidence.
- Pure parser probes accepted `--stage-sweep --eval 1`, `--stage-down --eval 1`, `--session-close p-x --eval 1`, `--session-sweep --eval 1`, `--session-export p-x --eval 1`, `--session-status --json`, and `--materialize-devtools-assets --json` with no errors.

Evidence produced this session:

```text
$ pnpm tsx reports/stickler/scratch/snap-argv-audit.ts
mixed ["--materialize-devtools-assets","--json"] []
mixed ["--stage-status","--click","body"] []
mixed ["--stage-sweep","--eval","1"] []
mixed ["--stage-down","--eval","1"] []
mixed ["--session-status","--json"] []
mixed ["--session-close","p-x","--eval","1"] []
mixed ["--session-sweep","--eval","1"] []
mixed ["--session-export","p-x","--eval","1"] []
```

The ambiguity exists because the shared registry accepts all spellings before `cli.ts` selects a return branch. `--session-daemon` is not included in this finding: it is an internal child-process entry point that intentionally carries the boot/call argv needed to reconstruct the daemon. Verdict: stage/session admin flags **KEEP** with strict modal exclusivity; `--materialize-devtools-assets` should **MOVE-SUBCOMMAND** to an explicit maintainer surface.

### P2 — report-reader string filters consume a following flag as their value

`tooling/src/snap/lib/run-report-query.ts:19` — string filters validate only that a next token exists, not that it is a value, so a missing value steals the following flag.

Failure scenarios:

- `--report latest --arm --all` becomes `arm="--all"` with no error instead of enabling the all-findings view.
- `--report latest --channel --problems` becomes `channel="--problems"` with no error.
- `--report latest --text --page 2` becomes `text="--page"` and reports only `unknown report flag 2`, obscuring the actual missing value.

Evidence produced this session:

```text
$ pnpm tsx reports/stickler/scratch/snap-argv-audit.ts
report ["--report","latest","--arm","--all"] {...arm:"--all",errors:[]}
report ["--report","latest","--channel","--problems"] {...channel:"--problems",errors:[]}
report ["--report","latest","--text","--page","2"] {...text:"--page",errors:["unknown report flag 2"]}
```

The consuming loop is `tooling/src/snap/lib/run-report-query.ts:53` and `:137`. Verdict: all reader filters **KEEP**, but flag-looking tokens must be refused as missing values.

### P2 — `--upload` cannot drive the real folder-picker trigger its implementation claims to cover

`tooling/src/_shared/upload.ts:42` — upload resolution recognizes only a selected file input or a descendant file input, yet the production folder-picker button and its hidden `webkitdirectory` input are siblings.

Failure scenario: selecting the visible `Import a folder…` button in `ImportLibrarySection` leaves the locator on the button; `drive.ts:150` calls Playwright `setInputFiles` on that button and fails instead of triggering the chooser and supplying the directory tree. This is the concrete Orb Backup/Restore target the flag is expected to operate.

Evidence: `packages/client/src/features/workloads/components/import-library-section.tsx:103` renders `FileDropzone` and a sibling `FolderPicker` at `:115`; `packages/ui/src/primitives/file-dropzone/folder-picker.tsx:20` renders the hidden directory input outside the button; the resolver searches only the selected node and its descendants (`tooling/src/_shared/upload.ts:42`–`:71`). The same source comment claims every `FolderPicker` is reachable, which this DOM shape directly refutes.

Verdict: **KEEP** and widen `--upload <trigger-or-input-selector>=<path[,path...]>` to support either a real input or a chooser-trigger element via Playwright's `filechooser` event. Do not add synonymous `--choose-files`, `--pick-files`, `--upload-directory`, or `--native-dialog` flags.

### P3 — ownerless modifiers are accepted as successful no-ops

`tooling/src/snap/ops/flags-handlers.ts:33` — several modifiers are accepted independently although their consumers exist only under a parent operation.

Failure scenarios: `--summary` outside a scenario, `--every 250` without `--watch`, `--motion-window 10` or `--motion-no-throttle` without `--motion`, `--force` without a destructive admin action, and `--fixture-server/--fixture-base` without `--contexts` or `--as` all parse successfully and do nothing.

Evidence produced this session:

```text
$ pnpm tsx reports/stickler/scratch/snap-argv-audit.ts
orphan ["--summary"] {"errors":[],"warnings":[]}
orphan ["--every","250"] {"errors":[],"warnings":[]}
orphan ["--motion-window","10"] {"errors":[],"warnings":[]}
orphan ["--motion-no-throttle"] {"errors":[],"warnings":[]}
orphan ["--force"] {"errors":[],"warnings":[]}
orphan ["--fixture-server","http://127.0.0.1:9999"] {"errors":[],"warnings":[]}
orphan ["--fixture-base","http://127.0.0.1:9998"] {"errors":[],"warnings":[]}
```

Consumer sweeps covered all 153 Snap/tooling TypeScript files with zero skipped files: `summary` is consumed only by the scenario runner, `watchEveryMs` only by watch/reporting, `motionWindowMs` by motion/matrix-motion, `force` by admin handlers, and fixture URLs by contexts targeting. Verdict: **DELETE-REFUSE** each unsupported combination; keep the flags in their owning modes. Rename `--summary` to `--scenario-summary` if the surface accepts a breaking cleanup.

### P3 — the help completeness test accepts incidental mentions as documentation

`tests/tooling/snap/ops/parse.test.ts:26` — help coverage is asserted with token-regex presence, so a flag can pass merely because another flag's prose mentions it.

Failure scenario: an operator asks for `--wide`, `--desktop`, `--dark`, `--light`, or `--reduced-motion` grammar and finds only compatibility/comparison prose; `--base`, `--viewport`, and `--mobile` are only incidentally mentioned in session prose; the only `--out` text is the currently broken session-export promise; `--file` appears in Usage/session prose. The test is green despite missing authoritative flag rows.

Evidence: `pnpm snap --help` exited 0 and emitted 266 lines. A per-token search of the output found no owned definition rows for those flags; inspection of `tooling/src/snap/contract/help.ts:18`–`:192` matched the rendered output. The registry/help test at `tests/tooling/snap/ops/parse.test.ts:66`–`:80` checks lexical presence rather than descriptor ownership or grammar. Verdict: **KEEP** the flags, but give each accepted public flag an owned help descriptor and test the descriptor registry rather than prose substrings.

## Complete post-repair accepted-flag inventory

### Reading key

- Grammar: `B` boolean; `V` required value; `O` optional value; `@N` accepts a zero-based page suffix such as `--click@1`; `R` can repeat as an ordered action/list; `L` is last-value-wins.
- Lifecycle: `admin`, `boot`, `call`, `action`, `capture`, `analyzer`, or `reader`. “Boot/call” means the value participates in both on a one-shot invocation but is boot-owned in a persistent session.
- Scenario/matrix: `outer` means boot environment outside checkpoint JSON; `checkpoint` means call/action/capture belongs inside checkpoint argv; `arm` is selected within a checkpoint; `reader` is outside execution. Where current behavior violates that classification, the finding number is named.
- Help: `owned` means a direct description/grammar; `incidental` means only prose or another option mentions the spelling; `internal` is intentionally hidden; `broken` means documented behavior diverges.
- Verdicts use the requested vocabulary. “DELETE-REFUSE combination” does not mean delete the useful flag; it means reject it outside its owner.

The normal roster was derived from `tooling/src/snap/ops/parse.ts`, `flags-classes.ts`, `flags-handlers.ts`, `flags-stage.ts`, `flags-session.ts`, and all executable arm declarations registered by `tooling/src/snap/ops/arms/registry.ts`, not from help prose. Parsing grammar is centralized in `tooling/src/_shared/argv.ts:147`. Behavior owners were cross-checked against the consumers listed below.

| Flag | Grammar / repetition | Lifecycle and actual owner/behavior | Scenario / matrix | Overlap | Help | Verdict |
| - | - | - | - | - | - | - |
| `--appearance` | `V,L` preset name | boot; appearance resolver | outer; inherited per matrix cell | composable with preset/theme, not alias | owned | KEEP |
| `--appearance-preset` | `V,L` path | boot; loads appearance file | outer | input source, not `--appearance` alias | owned | KEEP |
| `--aria` | `O,L,@N` selector | analyzer; ARIA tree arm | checkpoint/arm | `--text` is different projection | owned | KEEP |
| `--aria-boxes` | `B` | analyzer modifier; bounds | checkpoint/arm | child of `--aria` | owned | KEEP; refused without `--aria`/`--text` |
| `--aria-depth` | `V,L` integer | analyzer modifier; depth | checkpoint/arm | child of `--aria` | owned | KEEP; refused without `--aria`/`--text` |
| `--as` | `V,L` fixture name | boot; fixture/context target | outer | pairs with fixture URLs | owned | KEEP |
| `--atlas` | `B` | look; with `--map`, print the whole SPA destination atlas | checkpoint/arm | child of `--map`; the default is the one-line summary (#1372) | owned | KEEP |
| `--base` | `V,L` URL | boot; app base URL | outer | mutually exclusive environment slot with isolated target selection | owned | KEEP |
| `--baseline` | `B` | capture modifier; save shot as baseline | checkpoint | different operation from `--diff` | owned | KEEP |
| `--boot-trace` | `B` | capture; browser boot trace arm | checkpoint/arm | not CPU/perf profile | owned | KEEP |
| `--cascade` | `V,R,@N` selector/property query | analyzer; CSS cascade arm | outer/session boot | debugging-SDK launch property | owned | KEEP |
| `--checkpoint` | `B` | call/action; reset evidence at the checkpoint boundary | checkpoint primitive, not scenario file | no synonym | owned | KEEP |
| `--click` | `V,R,@N` selector | action; real pointer click | checkpoint | `--dom-click` and `--force-click` are distinct mechanisms | owned | KEEP |
| `--context-tab` | `V,R,@N` fixture context | action; switches tab/context | checkpoint | context selector, not `--contexts` | owned | KEEP |
| `--contexts` | `V,L` context spec | boot; multi-context fixture mode | outer | `--as` is named fixture convenience, not alias | owned | KEEP |
| `--contrast` | `V,R,@N` selector | analyzer; computed contrast | checkpoint/arm | pixel sampling is modifier | owned | KEEP |
| `--contrast-edge` | `V,R,@N` selector | analyzer; WCAG 1.4.11 border contrast per side | checkpoint/arm | sibling of contrast, same arm | owned | KEEP; added #1346 |
| `--contrast-pixel` | `B` | analyzer modifier; force framebuffer sampling | checkpoint/arm | child of contrast | owned | KEEP; refused without `--contrast` |
| `--cpu-profile` | `B` | capture; DevTools CPU profile | checkpoint/arm | not `--react-profile`/`--perf` | owned | KEEP |
| `--cpu-throttle` | `V,L` numeric multiplier | boot environment; DevTools throttle | outer; one shared scenario/session browser lifetime; raw checkpoint drift refused | not perf cycle count | owned | KEEP |
| `--crop` | `V,L` geometry | capture modifier; screenshot crop | checkpoint | shot modifier | owned | KEEP; refused when no screenshot is produced |
| `--design-audit` | `B` | analyzer; the deterministic UI defect scan over the settled surface | checkpoint/arm | the folded design-audit engine, not a second parser | owned | KEEP; added #1315 |
| `--fail-on` | `V,L` severity | analyzer modifier; the severity `--design-audit` exits 1 at | checkpoint/arm | child of design-audit, not a run-wide threshold | owned | KEEP; added #1315 |
| `--perf-cycles` | `V,L` integer | analyzer modifier; repeat perf tape | checkpoint/arm | perf-specific, not scenario repetitions | owned | KEEP; old `--cycles` refuses by name |
| `--dark` | `B` | boot environment; OS color scheme dark | outer | same slot as `--light`, different values | owned | KEEP |
| `--debug-token` | `V,L` token | boot/admin; debug authorization | outer | no alias | owned | KEEP |
| `--desktop` | `B` | boot environment; desktop device preset | outer | same slot as viewport/wide/mobile, different values | owned | KEEP |
| `--diagnostics` | `V,L` query | analyzer; filter structured browser diagnostics | checkpoint/arm | no alias | owned | KEEP |
| `--diff` | `B` | capture modifier; compare shot against stored baseline | checkpoint | distinct operation from baseline | owned | KEEP |
| `--dirty` | `B` | boot WHERE; isolated stage from dirty tree | outer | implies isolated; not alias for fresh/ref | owned | KEEP |
| `--dom-click` | `V,R,@N` selector | action; DOM `click()` | checkpoint | intentionally differs from pointer and force-click | owned | KEEP; old `--jsclick` refuses by name |
| `--drop-files` | `V,R,@N` selector=path list | action; genuine DataTransfer drop | checkpoint | distinct from chooser-backed upload | owned | KEEP |
| `--eval` | `V,R,@N` expression | action/analyzer; browser evaluation | checkpoint | no alias | owned | KEEP |
| `--every` | `V,L` milliseconds | call modifier; watch cadence | checkpoint | child of watch | owned | KEEP; refused without `--watch` |
| `--expect-count` | `V,R,@N` selector=count | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--expect-focus` | `V,R,@N` selector | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--expect-no-overflow` | `O,R,@N` selector | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--expect-text` | `V,R,@N` selector=text | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--expect-url` | `V,R,@N` URL/pattern | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--expect-visible` | `V,R,@N` selector | action assertion | checkpoint | distinct assertion | owned | KEEP |
| `--file` | `V,L` local HTML path | call target; render a committed/static mock over file:// | checkpoint/call | positional route is the served-app target | owned | KEEP |
| `--fill` | `V,R,@N` selector=value | action; form fill | checkpoint | no alias | owned | KEEP |
| `--filmstrip` | `B` | capture; bounded exact-page transition contact sheet | checkpoint/arm | replaces retired Record video/GIF path | owned | KEEP; refuses contaminating profiler/trace arms |
| `--fixture-base` | `V,L` URL | boot modifier; fixture app base | outer | child of contexts/as | owned | KEEP; refused without `--contexts`/`--as` |
| `--fixture-server` | `V,L` URL | boot modifier; fixture controller | outer | child of contexts/as | owned | KEEP; refused without `--contexts`/`--as` |
| `--focus` | `V,R,@N` selector | action; DOM focus | checkpoint | not panel focus | owned | KEEP |
| `--force` | `B` | admin modifier; force close/down | admin only | shared by destructive admin verbs | owned | KEEP; refused without `--stage-down`/`--session-close` |
| `--fresh` | `B` | boot WHERE; fresh isolated stage | outer | implies isolated; not dirty/ref alias | owned | KEEP |
| `--full` | `B` | capture modifier; full-page shot | checkpoint | canonical; legacy `--full-page` refused | owned | KEEP |
| `--full-motion` | `B` | boot appearance; disable motion suppression | outer | same policy slot as reduced motion but different layer | owned | KEEP |
| `--goto` | `V,R,@N` route/URL | action; navigation | checkpoint | positional route is initial route, not alias | owned | KEEP |
| `--heap` | `V,R,@N` capture label/path | analyzer; heap snapshot | checkpoint/arm | capture, not comparison | owned | KEEP |
| `--heap-compare` | `V,R,@N` left=right | analyzer; heap growth comparison | checkpoint/arm | analysis over captures | owned | KEEP |
| `--heap-retainers` | `V,R,@N` snapshot=selector | analyzer; retaining-path query | checkpoint/arm | query over one capture | owned | KEEP |
| `--help` | `B` | admin/read; renders help | exclusive | real alias `-h` | owned | KEEP |
| `--hover` | `V,R,@N` selector | action; pointer hover | checkpoint | no alias | owned | KEEP |
| `--idle` | `B` | call settle policy; bounded network-idle settle | checkpoint | differs from explicit wait | owned | KEEP |
| `--include-hidden` | `B` | analyzer modifier | checkpoint/arm | modifies the default dead-CSS population even without another selected arm | owned | KEEP |
| `--isolated` | `B` | boot WHERE; isolated stage | outer | implied by dirty/ref/fresh | owned | KEEP |
| `--json` | `B` | capture/output; JSON rendering | call where supported | output form, not `--out`; strict modal modes reject it | owned | KEEP |
| `--key` | `V,R,@N` key | action; keyboard key | checkpoint | differs from `--force-click` click semantics | owned | KEEP |
| `--light` | `B` | boot environment; OS color scheme light | outer | same slot as dark, different value | owned | KEEP |
| `--lighthouse` | `V,L` desktop/mobile | analyzer; Lighthouse arm | checkpoint/arm | not perf snapshot | owned | KEEP |
| `--lighthouse-mode` | `V,L` navigation/snapshot | analyzer modifier | checkpoint/arm | child of Lighthouse | owned | KEEP; refused without `--lighthouse` |
| `--local-storage` | `V,R` key=value | boot environment; seed localStorage before navigation | outer/session boot | launch-time state, not an analyzer | owned | KEEP; old `--ls` refuses by name |
| `--map` | `O,L,@N` selector | analyzer; DOM/reading map | checkpoint/arm | not ARIA/text alias | owned | KEEP |
| `--mask` | `V,R` selector | capture modifier; screenshot masks | checkpoint | shot modifier | owned | KEEP; refused when no screenshot is produced |
| `--materialize-devtools-assets` | `B` | maintainer/admin; materializes DevTools frontend assets | exclusive pre-dispatch | no overlap | owned | KEEP in current owner-ruled location |
| `--matrix` | `B` | call orchestration; run the derived rated matrix | matrix owner; composes scenario | no synonym | owned | KEEP |
| `--mobile` | `B` | boot environment; mobile device preset | outer | same slot as viewport/wide/desktop, different value | owned | KEEP |
| `--motion` | `O,L` selector | analyzer; motion audit | checkpoint/arm | not OS reduced-motion setting | owned | KEEP |
| `--motion-no-throttle` | `B` | analyzer modifier | checkpoint/arm | child of motion | owned | KEEP; refused without `--motion` |
| `--motion-window` | `V,L` milliseconds | analyzer modifier | checkpoint/arm | child of motion | owned | KEEP; refused without `--motion` |
| `--network` | `V,L` profile | boot environment; network emulation | outer | `fast-3g` is an intentional value alias for DevTools' retired name, not flag alias | owned | KEEP |
| `--no-deadcss` | `B` | analyzer modifier; disable the default dead-CSS scan | checkpoint/arm | directly owns the always-on scan; not orphaned | owned | KEEP |
| `--no-failure-evidence` | `B` | boot evidence policy | outer; later session calls refuse it by name | no alias | owned | KEEP |
| `--no-shot` | `B` | capture policy; suppress default shot | checkpoint | inverse policy, not alias | owned | KEEP |
| `--open-character` | `V,R,@N` character id | action; app-specific character navigation | checkpoint | SPA bridge ergonomic distinct from raw goto/click | owned | KEEP (owner ruling) |
| `--open-chat` | `V,R,@N` chat id | action; app-specific chat navigation | checkpoint | SPA bridge ergonomic distinct from raw goto/click | owned | KEEP (owner ruling) |
| `--out` | `V,L` artifact base/name | capture/output and session-export destination | checkpoint/admin export | typed through the session request; custom JSON/HAR/trace artifacts enter the immutable index | owned | KEEP |
| `--stage-owner` | `V,L` owner id | stage admin targeting | admin | child of stage-down | owned | KEEP; old `--owner` refuses by name |
| `--pages` | `V,L` integer | boot/call; page count | outer/session boot | page suffix targets created pages | owned | KEEP |
| `--panel` | `V,R,@N` panel name | action; open/select panel | checkpoint | `--panels` lists/sets collection; `--focus` DOM action | owned | KEEP |
| `--panels` | `V,L` panel-set spec | boot/action appearance | outer/checkpoint contract-dependent | not singular alias | owned | KEEP |
| `--pause` | `V,R,@N` milliseconds | action; explicit sleep | checkpoint | unlike readiness `--wait` | owned | KEEP |
| `--perf` | `B` | analyzer; app performance snapshot | checkpoint/arm | not CPU/React/Lighthouse profiles | owned | KEEP |
| `--force-click` | `V,R,@N` selector | action; hover then forced click | checkpoint | not keyboard `--key`; differs from pointer `--click` | owned | KEEP; old `--press` refuses by name |
| `--probe` | `B` | boot instrumentation; enable probe | outer | no alias | owned | KEEP |
| `--react-profile` | `B` | capture/analyzer; React development-renderer hook | outer/session boot | renderer hook installs before first mount | owned | KEEP |
| `--reduced-motion` | `B` | boot environment; OS preference | outer | differs from app-level full-motion | owned | KEEP |
| `--ref` | `V,L` git ref | boot WHERE; isolated ref stage | outer | implies isolated; not fresh/dirty alias | owned | KEEP |
| `--request-body` | `V,L` URL filter | analyzer modifier; print newest retained JSON body | checkpoint/arm | implies requests capture | owned | KEEP |
| `--requests` | `O,L` URL filter | analyzer; network request log | checkpoint/arm | request-body is modifier | owned | KEEP |
| `--scale` | `V,L` screenshot/device scale | boot environment | outer; one shared scenario/session browser lifetime; raw checkpoint drift refused | not crop | owned | KEEP |
| `--scenario` | `V,L` preset/name | call orchestration | scenario owner | `--file` is source form, not alias | owned | KEEP |
| `--session` | `V,L` session name | session call/boot selector | outer | no alias | owned | KEEP |
| `--session-close` | `V,L` name | admin; close session | exclusive | force modifier | owned | KEEP |
| `--session-daemon` | `V,L` name/internal payload | internal session boot process | internal only; carries reconstructed argv | no public synonym | internal | KEEP internal |
| `--session-export` | `V,L` name | admin; export rings plus retained HAR/trace | exclusive strict modal; typed `exportOut` reaches the daemon | `--out` selects the custom base and every exported artifact enters the immutable index | owned | KEEP |
| `--session-status` | `O,L` optional name | admin; session status | exclusive | no alias | owned | KEEP |
| `--session-sweep` | `B` | admin; prune expired sessions | exclusive | no alias | owned | KEEP |
| `--session-ttl` | `V,L` duration | boot/session admin policy | outer | no alias | owned | KEEP |
| `--shot-of` | `V,L` selector | capture; element screenshot | checkpoint | canonical; legacy screenshot refused | owned | KEEP |
| `--stream-settle` | `V,L` seconds | call settle policy; fixed streaming-surface settle | checkpoint | not requests capture | owned | KEEP; old `--sse` refuses by name |
| `--stage-down` | `B` | admin; stop stage | exclusive | `--force` and `--stage-owner` modifiers | owned | KEEP |
| `--stage-keeper` | `V,L` band index | internal band idle-timer process (#1163 arm b); polls one row and tears its stage down through the `--stage-down` path | internal only; spawned by `ensureStage`, refused beside any other mode | no public synonym | internal | KEEP internal |
| `--stage-status` | `B` | admin; stage status | exclusive | no alias | owned | KEEP |
| `--stage-sweep` | `B` | admin; prune stages | exclusive | no selector; `--stage-owner` belongs only to stage-down | owned | KEEP |
| `--strict-console` | `B` | boot/call evidence policy; console failures fatal | outer/session boot | no alias | owned | KEEP |
| `--scenario-summary` | `B` | scenario output modifier | scenario only | parent-owned and refused without scenario | owned | KEEP; old `--summary` refuses by name |
| `--text` | `O,L,@N` selector | analyzer; text projection | checkpoint/arm | differs from ARIA/map | owned | KEEP |
| `--theme` | `V,L` theme | boot appearance | outer | composes with appearance; not dark/light alias | owned | KEEP |
| `--upload` | `V,R,@N` selector=path list | action; direct/descendant input or Playwright filechooser trigger | checkpoint | chooser semantics; real DataTransfer drop is distinct | owned | KEEP |
| `--viewport` | `V,L` `WIDTHxHEIGHT` | boot environment | outer | same slot as wide/mobile/desktop, different explicit value | owned | KEEP |
| `--vnc` | `B` | boot/session visibility | outer | no alias | owned | KEEP |
| `--wait` | `V,L` readiness mode | call settle/readiness | checkpoint | `--wait-for` targets selector; not alias | owned | KEEP |
| `--wait-for` | `V,R,@N` selector | action/readiness | checkpoint | distinct from global wait policy | owned | KEEP |
| `--watch` | `V,L` duration | call loop | checkpoint | every is cadence modifier | owned | KEEP |
| `--wheel` | `V,R,@N` delta/spec | action; one wheel event | checkpoint | `--wheel-burst` is the repeated/timed form | owned | KEEP |
| `--wheel-burst` | `V,R,@N` burst spec | action; wheel burst | checkpoint | same primitive family, distinct value grammar | owned | KEEP; old `--wheelburst` refuses by name |
| `--wide` | `B` | boot environment; wide viewport preset | outer | same slot as viewport/mobile/desktop, different value | owned | KEEP |
| `-h` | `B` | admin/read; help | exclusive | only true spelling alias, of `--help` | owned | KEEP |

### Report-reader flags handled before normal parsing

The dispatcher recognizes these only when `--report` or `--reports` occupies argv position zero (`tooling/src/snap/cli.ts:77`; `tooling/src/snap/ops/run-report.ts`; `tooling/src/snap/lib/run-report-query.ts:100`). They are not part of the normal 116-flag registry.

| Flag | Grammar / repetition | Lifecycle and behavior | Scenario / matrix | Overlap | Help | Verdict |
| - | - | - | - | - | - | - |
| `--report` | first token + required absolute index, exact run id, or `latest` | reader; render one run | outside execution | selector, not report-list alias | owned | KEEP; candidate MOVE-SUBCOMMAND only in a future global CLI reshape |
| `--reports` | first token, no extras | reader; list reports | outside execution | not `--report` alias | owned | KEEP |
| `--problems` | `B` | reader; problem-only preset | reader | different view from all | owned | KEEP |
| `--all` | `B` | reader; all findings | reader | different view from problems | owned | KEEP |
| `--level` | `V,L`, one of error/warning/info/verbose | reader filter | reader | no alias | owned | KEEP |
| `--arm` | `V,L` string | reader filter | reader | missing value refuses without consuming the next flag | owned | KEEP |
| `--channel` | `V,L` string | reader filter | reader | missing value refuses without consuming the next flag | owned | KEEP |
| `--source` | `V,L` string | reader filter | reader | missing value refuses without consuming the next flag | owned | KEEP |
| `--category` | `V,L` string | reader filter | reader | missing value refuses without consuming the next flag | owned | KEEP |
| `--text` | `V,L` string | reader substring filter | reader | same spelling as normal text arm; missing value refuses without consuming the next flag | owned | KEEP; acceptable scoped reuse, not alias |
| `--page` | `V,L` nonnegative integer | reader filter | reader | reader analogue of `@N`, not alias | owned | KEEP |
| `--context` | `V,L` nonnegative integer | reader filter | reader | no alias | owned | KEEP |
| `--window` | `V,L` string | reader filter | reader | reader-only; missing value refuses without consuming the next flag | owned | KEEP |

### Rejected legacy spellings (not counted as accepted)

These are refusal affordances, not aliases, and should remain refusals:

| Rejected spelling | Directed replacement / rule |
| - | - |
| `--full-page` | use `--full` |
| `--watch-every` | use `--every` |
| `--name` | use `--out` |
| `--screenshot` | use `--shot-of` |
| `--os-reduced-motion` | use `--reduced-motion` |
| `--os-full-motion` | omit it; full motion is the default unless another policy changes it |
| `--profile` | use `--react-profile` |
| `--cpuprofile` | use `--cpu-profile` |
| `--selector` | retired; pass the arm/action selector in its owning value |
| normal-mode `--window` | reader-only; rejected outside `--report` |
| `--motion-matrix` | not accepted; use matrix/scenario composition |

`--network fast-3g` is different: it is an accepted **value alias** normalized to the DevTools `slow-4g` profile for compatibility. It is not a redundant flag spelling.

## Naming and overlap judgment

The surface is less alias-ridden than it looks. `--click`/`--jsclick`/`--press`, `--wait`/`--wait-for`, `--aria`/`--text`/`--map`, `--cpu-profile`/`--react-profile`/`--perf`, and `--wide`/`--mobile`/`--desktop`/`--viewport` occupy related slots but request materially different values or mechanisms. They should not be collapsed as aliases. The bad names are the cute or misleading ones: `--jsclick`, `--wheelburst`, `--ls`, `--sse`, `--press`, bare `--summary`, and bare `--owner`.

App-specific `--open-character` and `--open-chat` are the only current action flags that clearly violate the general instrument vocabulary. They should **FOLD-INTO-PRESET-SCENARIO-MATRIX** as named scenario/app recipes rather than continue expanding the generic driver with domain nouns.

### Implemented capability vocabulary

These rows now describe the shipped executable grammar.

#### Heap capture, comparison, and retainers

Use one analyzer family rooted at `--heap`, not a pile of peer synonyms:

- `--heap <label-or-path>` — capture a heap snapshot as a checkpoint arm. Repeatable only when multiple captures are intentionally requested in one checkpoint.
- `--heap-compare <left=right>` — parse two captured snapshots and emit structured growth/delta findings. It is analysis, not a matrix axis.
- `--heap-retainers <snapshot=selector>` — query retaining paths from a parsed snapshot. If the implementation can naturally use the active capture, allow that through explicit grammar, not another alias.

Do not add `--heap-snapshot`, `--memory-snapshot`, `--heap-diff`, `--memory-diff`, `--retainer-tree`, or `--leaks` as synonyms. Heap work belongs to the analyzer/capture layer inside scenario checkpoints; repeated route/device/environment comparisons belong to scenario/matrix composition. A heap artifact's parser and comparison result should be report-readable rather than hidden in action output.

#### Drag, file drop, and chooser operation

- Widen existing `--upload <trigger-or-input-selector>=<path[,path...]>` to handle either an actual/descendant file input or a visible button that emits Playwright's `filechooser`; set files or a directory tree through that chooser. This is the only chooser flag.
- Add `--drop-files <dropzone-selector>=<path[,path...]>` for a real file `DataTransfer` drop on a dropzone. The production `FileDropzone` consumes `dataTransfer.files`, so this exercises a different UI contract from chooser upload.
- Do not add generic `--drag`: no approved concrete Orbweaver target requires it, and chooser/drop already cover the exercised file workflows.
- Keep JS `alert`/`confirm`/`prompt` handling separate if approved later, under an explicit browser-dialog action. An OS/file chooser is Playwright's `filechooser`, not a JS dialog; naming it `--native-dialog` would conflate two protocols.

None of `--choose-files`, `--pick-files`, `--upload-directory`, `--file-dialog`, `--native-dialog`, `--drag`, or `--drag-and-drop` is accepted. Chooser coverage belongs under `--upload`; genuine DataTransfer delivery belongs under `--drop-files`.

## Verified clean

- Read the authority chain in full: root `AGENTS.md`, `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, `Core-Laws-and-Precedents.md`, relevant core architecture/tooling/documentation law, imported browser/tooling/lane/orchestration rules, and `docs/design/1208-instrument-substrate.md`.
- Read the normal parser, all flag registries/classes/handlers, stage/session flag modules, every registered arm module, arm/help/type contracts, session-plan partition, scenario preparation/catalog/runtime, matrix contract/runtime, shared instrument argv/browser environment/appearance/panel/theme owners, report query/rendering, session admin/daemon/evidence, contexts and materialization paths, plus relevant parser/session/matrix/CLI tests.
- Re-derived 116 normal flags from executable registries (115 public descriptors plus internal `--session-daemon`) and 13 reader spellings from raw-argv dispatch. `pnpm snap --help` now prints the generated complete grammar block, so a new public handler receives one authoritative row without relying on incidental prose.
- Ran the minted post-repair acceptance and focused behavioral suites:

```text
$ pnpm test:scoped tests/tooling/snap/ops/cli-truth.suite.int.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       6 passed (6)

$ pnpm test:scoped tests/tooling/snap/ops/session-daemon.int.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       15 passed (15)

$ pnpm test:scoped tests/tooling/snap/ops/arms/profile.suite.int.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       4 passed (4)

$ pnpm test:scoped tests/tooling/snap/ops/cli-truth.suite.int.test.ts tests/tooling/snap/lib/session-plan.test.ts tests/tooling/snap/lib/session-wire.test.ts tests/tooling/snap/ops/parse.test.ts tests/tooling/screen-record/index.test.ts --maxWorkers=1
Test Files  5 passed (5)
Tests       39 passed (39)
```

- Ran structural consumer sweeps for scenario summaries, failure evidence, watch cadence, motion modifiers, force, and fixture URLs with `ast-grep --inspect summary`; each sweep scanned 153 TypeScript files with zero skipped files, then was cross-checked with scoped literal search.
- Confirmed the only real accepted spelling alias is `-h`/`--help`; related same-slot alternatives express intentionally different values or mechanisms.

`pnpm check` was not run. This review was performed on a shared dirty main tree with active repair lanes; repo lane law forbids a lane from taking the global gate while sibling work is in flight. The focused tests above are the test boundary of this report.

## Scope not fully reviewed

- I did not read unrelated application/runtime domains beyond the concrete Backup/Restore file chooser/drop targets.
- I did not exercise every accepted flag against a live browser or stage. The strict modal, scenario/session, export, React-profile, chooser/drop, heap, and selective analyzer suites cover the repaired classes; the full roster's routine successful browser behavior remains inventory rather than universal runtime certification.
- Generic drag remains deliberately absent; chooser/drop and heap vocabulary are implemented and tested by their owning lanes.
- The transient stage-status run slot was pruned by concurrent shared-tree activity before it could be reopened; its exact observed path and command are recorded above.

## Unconfirmed, low priority

- `--requests` has optional-value grammar that deliberately declines a `/...` token as its value, which can reinterpret a common path-looking request filter as the positional route. Tests pin the generic optional-value behavior, but this review did not live-probe the requests arm deeply enough to call that a defect.
- Some modifiers beyond the confirmed orphan set may merit the same modal refusal. They are marked in the inventory, but were not individually runtime-probed and are not promoted to findings.

## Issue summary

Snap argv audit and post-repair ledger complete: 129 accepted spellings inventoried (116 normal plus 13 report-reader), with 8 pre-repair findings at severity ceiling P1. #1298/#1299 repair the confirmed classes and the ledger now reflects the actual executable grammar, including chooser/drop and heap capture/comparison/retainers. The only accepted alias is `-h`/`--help`; retired names refuse with exact replacements. Durable report: `docs/reviews/stickler/2026-09-03-snap-cli-argv-audit.md`.
