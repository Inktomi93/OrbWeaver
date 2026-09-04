---
kind: review
status: active
updated: 2026-09-03
---

# Unified Snap / browser-instrument program — stickler review

Scope: the current uncommitted implementation of `docs/design/1208-instrument-substrate.md`, including the unified browser/session substrate, request and HAR evidence, diagnostics, map and Activity visibility, motion/perf/CPU/boot/React arms, immutable run bundles, browser-free readers, composite findings, shared argv, and legacy retirement. Historical changes outside this program were not reviewed.

Verdict: **six confirmed findings (three P1, three P2).** The implementation has substantial real machinery and several planted controls, but its request lifetime, run-result truth, and immutable index still contradict the authoritative design.

## Confirmed findings

### P1 — `tooling/src/snap/ops/arms/requests.ts:68` — the request arm is a per-call, unbounded listener recorder, not the mandated daemon-lifetime bounded request ring

The design requires one 4,096-entry ring wired to every page of every context since session boot, checkpoint-window reads, `sizes()` evidence, and retained `application/json` bodies up to 256 KiB each within a 32 MiB budget (`docs/design/1208-instrument-substrate.md:330-335`). The current arm instead creates a fresh recorder when a call asks for `--requests`, wires four listeners only to pages that already exist (`tooling/src/snap/ops/arms/requests.ts:68-118,212-248`), and has no listener disposer. On a persistent session, boot and earlier-call requests are therefore unavailable; every later request call adds another permanent listener set whose closed-over recorder is never read again.

The daemon's lifetime `requestLog` is a separate legacy `CapturedRequest[]` (`tooling/src/snap/ops/session-daemon.ts:135-154`, `tooling/src/snap/ops/session-daemon-call.ts:38-55`), keyed/rolled from the latest-per-URL map and never consumed by the request arm. The body implementation accepts any matching content type, retains only the first match, and caps it at 16,384 bytes (`tooling/src/snap/ops/arms/requests.ts:83-93`, `tooling/src/snap/lib/request-log.ts:9-13`), contradicting the JSON-only 256 KiB / 32 MiB contract. Even the arm contract comment explicitly dismisses `requestRing` as the run lifecycle (`tooling/src/snap/contract/arms.ts:74-79`), which is not equivalent for a daemon session.

Concrete failure: boot a named session whose page fetches JSON, then issue a later live-page call with `--request-body`; the required since-checkpoint body was never retained, so the call returns `no-match`. Repeating `--requests` on that session also accumulates four more event listeners each time until the browser is closed.

Evidence produced:

- `ast-grep run -p 'recordRequestsOn($A, $B)' -l ts tooling/src --inspect summary` scanned 857 files and found exactly one live call, `requests.ts:115`, inside the per-call attachment loop.
- `rg -n 'requestRing|REQUEST_BODY_CAP_BYTES' tooling/src/snap tests/tooling/snap` found no ring implementation and found the 16 KiB constant plus tests that assert it.
- The browser test plants CSS bodies, not JSON, and asserts the current cap (`tests/tooling/snap/ops/arms/requests.int.test.ts:20-25,76-103`); the pure test likewise asserts the 16 KiB implementation (`tests/tooling/snap/lib/request-log.test.ts:35-42`). Those tests prove the one-shot fixture implementation, not the specified session-lifetime ring.

Required correction: mint one bounded session-owned ring before navigation, wire newly created contexts/pages, retain and budget eligible bodies, expose checkpoint-window reads to one-shot and named-session calls, and remove the per-call event-listener accumulation. Add a named-session boot-before-read proof plus cap/budget/eviction and JSON eligibility controls.

### P1 — `tooling/src/snap/ops/run.ts:258` — `run.json` does not store the exact normalized terminal RESULT and can label a refused request measurement as passed

`printVerdict` normalizes the terminal RESULT by adding `verdict=INSTRUMENT-ERROR` on a denominator refusal and appending every denominator (`tooling/src/_shared/evidence.ts:95-131`). `runOnSession` then discards that normalized sequence and registers the raw pre-normalized `resultPairs` (`tooling/src/snap/ops/run.ts:258-264`). The index consequently lacks the exact terminal `verdict`, `pages`, and arm denominators even though its contract says `resultPairs` are the exact terminal RESULT (`tooling/src/snap/contract/run-index.ts:127-133`) and the design requires every structured RESULT plus denominators (`docs/design/1208-instrument-substrate.md:962-965`).

The mismatch becomes an incorrect arm verdict for requests: its primary result pair is absent (`tooling/src/snap/ops/arms/requests.ts:236-245` only emits `requests-shown` and `request-body`), while `armState` special-cases any request arm without a primary pair as passed (`tooling/src/snap/lib/run-bundle-verdict.ts:71-88`).

Concrete failure: an enabled request arm records zero requests. The terminal correctly refuses the run, but the immutable index omits that request denominator and records the requests arm as passed, so the browser-free reader contradicts the command that produced it.

Evidence produced with a direct pure probe:

```text
INSTRUMENT ERROR  the verdict denominator is ABSENT — this run is not a verdict
                  requests is empty (0) — a clean result over that population is not a verdict

RESULT snap verdict=INSTRUMENT-ERROR requests-shown=0 request-body=off pages=1 requests=0
CODE 2
{"arm":"requests","source":"Playwright request/response events","lifetime":"pre-navigation through run finish","state":"passed","artifacts":[],"detail":null}
```

The probe called the real `printVerdict` and `snapArmVerdicts` functions with `pages=1`, `requests=0`, and the arm's actual raw pair shape. This is a deterministic contradiction, not a missing-test inference.

Required correction: have the verdict door return/register its normalized pairs (or centralize normalization once), persist denominators explicitly, and derive request state from its denominator/refusal receipt rather than a hard-coded passed fallback. Add a run-bundle test whose planted zero request population asserts terminal RESULT bytes, index pairs, index arm state, and browser-free report agree.

### P1 — `tooling/src/snap/contract/run-index.ts:6` — the immutable run index omits mandatory identity, provenance, diagnostics, and artifact fields

The authoritative schema requires absolute index and slot paths; primary/linked checkout names and paths; stage owner/band/ref/binding; diagnostic counts by page/context/window and raw references for console, page errors, CDP Log, InspectorIssue, requests, and HAR; and every artifact's published convenience path, media/schema kind, producer arm/channel, identity, and truncation/measured-limit markers (`docs/design/1208-instrument-substrate.md:953-973`). The current type cannot represent those facts:

- identity has only run id, one checkout name/root, SHA/ref, and dirty state (`tooling/src/snap/contract/run-index.ts:96-107`);
- provenance has only session/call/window/binding, a broad stage enum, and concurrency (`tooling/src/snap/contract/run-index.ts:117-126`);
- diagnostic aggregation stops at level/source/category, with no page/context/window counts or cross-channel raw references (`tooling/src/snap/contract/run-index.ts:50-71`);
- artifact rows have no published path, distinct media kind/channel, or structured limit/truncation receipt (`tooling/src/snap/contract/run-index.ts:6-21`).

The writer cannot fill absent fields (`tooling/src/snap/ops/run-bundle.ts:267-315`). Its inventory guesses producer from the first directory, infers page from a filename regex, and hard-codes every context/window to null (`tooling/src/snap/lib/run-bundle-files.ts:95-130`).

Concrete failure: the sampled real session-call index `reports/runs/snap/main-961385-2026-09-04T00-10-23-996Z/run.json` has all five artifacts at `page=null`, `context=null`, `window=null`, calls `evidence/core-capture.json` producer `evidence`, and contains none of the required stage/checkouts/published-path fields. An agent cannot attribute those immutable files to the exact session evidence window or stage owner/band/ref, and the browser-free `--page` / `--context` / `--window` selectors cannot select artifacts whose identity was erased during inventory.

Evidence produced:

- `jq '{identity,provenance,resultPairs,diagnostics,artifacts}' reports/runs/snap/main-961385-2026-09-04T00-10-23-996Z/run.json` reproduced the missing fields and null artifact identities above.
- The run-bundle integration test defines only the partial schema (`tests/tooling/snap/ops/run-bundle.suite.int.test.ts:33-77`) and its primary assertion checks path/SHA/digest/basic completeness (`tests/tooling/snap/ops/run-bundle.suite.int.test.ts:180-217`); it cannot fail when the mandatory fields are absent.

Required correction: complete the versioned contract and populate those fields from authoritative owners rather than filename heuristics; add a multi-context named-session + isolated-stage bundle proof that queries the written index by page/context/window and verifies raw request/HAR/diagnostic references and stage/checkout identity.

### P2 — `tooling/src/snap/ops/arms/perf.ts:76` — rate arms independently reread GPU and box-load state instead of sharing one run receipt

The design requires one browser-acceleration receipt and one box-load receipt shared by every rate arm (`docs/design/1208-instrument-substrate.md:869-884`). The always-enabled app-snapshot arm reads acceleration and load for itself (`tooling/src/snap/ops/arms/perf.ts:32-45,76-93,105-120`); motion rereads both (`tooling/src/snap/ops/arms/motion.ts:102-117`); and interaction perf rereads acceleration then delegates to another load read (`tooling/src/snap/ops/arms/interaction-perf.ts:138-148`, `tooling/src/cpu-profile/lib/rate.ts:10-23`). No shared receipt exists on `ProbeSession` or the arm run context.

Concrete failure: a normal `--motion` or `--perf` run also executes app-snapshot. If the host crosses the load threshold or the acceleration read transiently fails between those independent samples, the same immutable run can publish one rate arm as measured and another as withheld/refused even though the contract defines one shared measurement posture.

Evidence produced:

- `ast-grep run -p 'readBrowserAcceleration($A)' -l ts tooling/src --inspect summary` scanned 857 files and found the three independent Snap arm reads at `perf.ts:86`, `motion.ts:106`, and `interaction-perf.ts:142`.
- The one-argument and two-argument `withholdRate` sweeps scanned 160 files and found independent load reads at `motion.ts:113`, `perf.ts:45`, and `cpu-profile/lib/rate.ts:19`.
- `tests/tooling/snap/ops/arms/perf.test.ts:38-74` injects one arm's acceleration/load values in isolation; it has no same-run cross-arm consistency control.

Required correction: sample both receipts once at run start, attach them to the shared run context, and make every rate arm consume those immutable values. Add a planted reader whose second invocation disagrees and assert only one invocation occurs and all rate-arm dispositions match.

### P2 — `tooling/src/_shared/browser.ts:138` — recorded-context session attach leaks the browser connection/context when initialization fails

`attachProbeSession` connects over CDP and directly returns `attachRecordedContext` for video (`tooling/src/_shared/browser.ts:202-210`). That helper creates a context, creates a page, installs capture state, and awaits page wiring with no `try/finally` (`tooling/src/_shared/browser.ts:138-170`). A rejection from `newContext`, `newPage`, or `wirePage` therefore leaves the attached browser handle open; if the context was created first, it is also left live and can retain recording/video state. `attachResolvedSession` can only close the heartbeat lease on this rejection (`tooling/src/snap/ops/session-attach.ts:133-141`) because it never received a `ProbeSession` to clean.

Concrete failure: screen-record attaches to a named session and `context.newPage()` fails (browser target closes, quota/process error, or injected unhappy path) after `newContext({recordVideo})` succeeded. The caller receives the error and releases its lease, while the daemon browser keeps the newly owned recording context and connection until session teardown.

Evidence produced:

- Full control-flow read of the only attach door above shows cleanup only in the non-recorded missing-page branch (`tooling/src/_shared/browser.ts:211-216`), not around the recorded branch.
- `rg -n 'recordVideoDir' tests/tooling` found no recorded-attach initialization test; the browser-attach integration tests exercise successful owner/sibling attach and disconnect (`tests/tooling/_shared/browser-attach.suite.int.test.ts:350-413`), so their `finally closeProbeSession` is unreachable for this mid-initialization path.

Required correction: make `attachProbeSession` the total owner until a complete `ProbeSession` is returned, closing any created context and disconnecting/closing the attach handle on every construction failure. Add planted `newContext`, `newPage`, and wiring rejections that assert exact-once cleanup while the daemon-owned browser remains alive.

### P2 — `tooling/src/cpu-profile/ops/boot-trace.ts:45` — a rejected `Tracing.start` leaves its CDP session and listeners attached

`beginBootTrace` creates a CDP session and registers two trace listeners before awaiting `Tracing.start`; its detach owner is defined only after that await succeeds (`tooling/src/cpu-profile/ops/boot-trace.ts:45-60`). The Snap arm catches the thrown start error and records a refusal (`tooling/src/snap/ops/arms/boot-trace.ts:42-57`), but `active` remains null, so its later abort path cannot detach that session (`tooling/src/snap/ops/arms/boot-trace.ts:75-80`). This matters especially for named sessions, whose browser intentionally survives a failed call.

Concrete failure: Chromium accepts `newCDPSession` but rejects `Tracing.start`. The call exits 2 as intended, yet the CDP session/listeners remain attached; repeated failed calls accumulate them until the named browser closes.

Evidence produced with the real engine and a planted CDP object:

```text
Error: planted Tracing.start refusal
detachCalls=0
```

The probe made `newCDPSession` succeed, `send("Tracing.start")` reject, and counted `detach` calls. The existing browser test covers only the successful trace/analyzer path (`tests/tooling/cpu-profile/boot-trace.suite.int.test.ts:68-129`).

Required correction: install the detach owner immediately after `newCDPSession` and detach in a catch/finally when start fails. Add a planted `Tracing.start` rejection that asserts refusal plus exact-once detach.

## Verified clean in the reviewed scope

- **HAR truth and redaction:** the current CDP Network collector validates complete HAR apparatus, carries body-limit/redaction receipts, handles redirect/header/cookie/timing evidence, observes popup pages, and has a planted `Network.enable` failure. I found no confirmed HAR false-clean seam distinct from the request-ring defect above.
- **Composite non-causality:** `run-findings.ts` is display-only; verdict and arm state are computed before findings, and malformed/partial analyzer evidence remains explicit. I found no composite path that changes an analyzer's exit vote.
- **Analyzer voting:** interaction-perf threshold rows are informational while apparatus gaps/withholding refuse; motion budget failures vote 1 and evidence gaps vote 2. No confirmed exit-polarity defect remained after the stable-tree repairs.
- **Activity visibility and map locators:** map browser collection preserves visibility/actionability and generates uniqueness disambiguation; the executable Compose/hidden-Activity fixtures and UI-audit Activity retention controls cover the intended distinction. No confirmed locator or Activity-retention defect remained.
- **Session ownership and binding:** foreign-checkout refusal, heartbeat lease release, owner-page non-takeover, stage binding, and session-call evidence windows were inspected. Apart from recorded-attach failure cleanup, no confirmed ownership violation was found.
- **CLI vocabulary, legacy retirement, and browser-free readers:** the shared argv tables/refusals and retired command adapters are structurally centralized; raw report dispatch occurs before stage/browser setup. The focused parser/shared-argv tests passed. No confirmed legacy parser fork or reader browser dependency was found.
- **Run identity selection:** exact run-id resolution, local `latest`, cross-checkout ambiguity handling, and immutable-path reads were inspected. The defect is missing schema content, not mutable selection.
- **React/CPU/motion/boot evidence:** raw artifact preservation and denominator/refusal paths were reviewed. Apart from shared GPU/load posture and boot-start cleanup, no confirmed analyzer logic defect was found.

## Verification log

- Authority read in full: `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, `docs/architecture/core/Core-Laws-and-Precedents.md`, `docs/architecture/core/Core-Tooling-Law.md`, relevant Core-0/tooling/testing/gate/documentation spines, browser/instrument rules, and the complete `docs/design/1208-instrument-substrate.md`.
- Review method: full-file reads of the high-risk implementation/test domains above, complete diff inventory, and whole-graph `ast-grep` plus literal `rg` corroboration. The `code-recon` and `engineering:code-review` skills shaped the scan-count/second-method and test-reality discipline. Prior lesson `MEMORY.md` / `2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md` was used only for the rule that planted happy paths prove non-vacuity, not completeness; every current verdict was re-established from this checkout.
- Focused tests: `pnpm test:scoped tests/tooling/snap/lib/request-log.test.ts tests/tooling/snap/ops/arms/perf.test.ts tests/tooling/snap/ops/parse.test.ts tests/tooling/_shared/instrument-argv.test.ts --maxWorkers=4` — **4 files / 16 tests passed**, no type errors, 4.11 s.
- Direct probes: the denominator/result/index mismatch reproduced exactly; the boot-trace start rejection reproduced with `detachCalls=0`; a real session-call `run.json` was inspected with `jq`.
- Stable-tree hygiene: at `2026-09-03T18:44:42-06:00`, HEAD was `4883b6bf424813457b70d0af9882d180ce574068`; `git diff --check` produced no output. No source/test file was modified by this review.
- `pnpm check` was run and its complete output read during the earlier moving-tree interval. It exited 1 against a superseded state (Biome/ESLint/ledger/Knip/catalog failures), so per orchestrator direction it is diagnostic only, not a current acceptance receipt. The orchestrator later reported the repaired stable structure terminal green at `main-1095992...`; this review did not rerun the full gate to avoid delaying/competing with the final stable-tree battery.

## Verification limits and unreviewed regions

- Coverage was approximately 80% of program source/test files by file count and effectively all requested actionable domains. The vendored/generated DevTools frontend assets, generated catalog/ledger/population outputs, re-attested baselines, and low-risk fixture bulk were not read line-by-line; they were inventory-classified and excluded from logic findings.
- I did not run the long browser battery, CT suite, or rendered side-eye pass while the orchestrator's final battery was waiting. The focused browser-backed tests noted above and existing artifacts are not a substitute for that final stable-tree run.
- The first full gate ran while other agents were repairing the shared tree, so it cannot certify the final files. No failure from that moving-tree run is reported here as a current defect.
- No unconfirmed suspicion is promoted to a finding. A general run-arm abort/finalize hook may still be worthwhile, but current arms catch most expected failures; without a reproduced live leak beyond the two concrete initialization paths above, that broader concern remains below the no-dragons bar.

## Issue summary

Stickler review of the unified Snap/browser-instrument program found **6 confirmed defects, severity ceiling P1**: the request arm is not the required daemon-lifetime bounded ring; the run bundle drops normalized terminal RESULT/denominators and can call refused requests passed; the immutable run-index schema omits required provenance/diagnostic/artifact identity; rate arms reread GPU/load independently; recorded-context attach leaks on mid-initialization failure; and boot trace leaks its CDP session when `Tracing.start` rejects. Full evidence and verified-clean areas are in `docs/reviews/stickler/2026-09-03-unified-snap-instrument-program.md`.
