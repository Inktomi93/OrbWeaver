---
title: "1208 request-ring and RESULT-truth repair"
status: implementation-design
date: 2026-09-03
parent: docs/design/1208-instrument-substrate.md
---

# 1208 request-ring and RESULT-truth repair

## Decision

Snap owns one `RequestRing` for each `ProbeSession`. `launchSnapSession` installs it after the browser
session exists and before the caller can navigate; `openSnapMatrixContext` explicitly adopts every later
Snap-owned context. The ring attaches the four Playwright request lifecycle events once per page and a
single `page` listener once per context, guarded by weak sets. A run arm never installs listeners. It only
marks an explicit `--checkpoint`, drains the already-running ring, selects a checkpoint-bounded window,
redacts it, writes it, and reports it. This is the same mechanism for one-shot and daemon calls, while the
daemon's session object owns its lifetime.

The ring retains at most 4,096 ordered request rows. Sequence numbers are lifetime-monotonic, so eviction
does not renumber evidence and a checkpoint older than the retained head has an explicit lost-row count.
Playwright `response.sizes()` reads run independently and best-effort; a snapshot never waits on them, and
an unfinished value remains explicit `null` rather than delaying thousands of unrelated rows or becoming
a fake zero. Body work exists only while an explicit `--request-body <substring>` filter is active, only
for matching URLs, and only for an `application/json` MIME type. An eligible body is retained whole only
when it is at most 256 KiB and fits the 32 MiB retained-body budget. Oversize, over-budget, read-error, and
evicted-before-read outcomes are counted by reason. Ring eviction releases retained body bytes. Filtered
reads await only the matching body work required to answer that request.

The request arm's default window starts at the ring's current checkpoint, initially sequence zero. Its
end is fixed before the report reads it, so requests arriving later cannot move the answer. Plain
`--requests` does not drain response work. `--request-body` activates its substring filter before
navigation and releases it after measure/report; a named-session boot must request the body on the boot
call if boot traffic is the subject. `--checkpoint` moves the request checkpoint in `afterNavigation`,
beside the existing `__orb.resetEvidence()` boundary, so navigation/boot traffic is excluded only when the
caller explicitly asks for interaction-scoped evidence.

The fleet verdict door will expose one normalized receipt containing both the exit and the exact pairs it
prints. Existing `printVerdict` callers delegate to that door and keep their numeric API; Snap uses the
receipt and registers those exact pairs. Run-index arm projection reads the normalized `requests`
denominator and `verdict=INSTRUMENT-ERROR`; it has no requests-specific pass fallback.

## Rejected alternatives

- A fresh recorder per `--requests` call is rejected: it cannot observe named-session boot traffic, adds
  listeners forever, and gives one-shot and session different evidence lifetimes.
- Expanding `_shared/browser-capture.ts`'s latest-per-URL failed-request map is rejected: its deduplicated
  key is correct for the failure verdict and incapable of preserving repeated request order. The daemon's
  separate accumulated copy is removed; failure-window capture and ordered request evidence remain two
  different-purpose structures, not two request-log paths.
- CDP/`selectNetworkBodies` plus Playwright event capture is rejected: two body capture paths can disagree.
  Playwright response events and `response.body()` are the sole request-ring path.
- Truncating an arbitrary first matching body is rejected: it violates JSON eligibility and makes a cut
  payload look usable. Whole eligible JSON is retained or an exact non-retention reason is reported.
- Eagerly reading every JSON body is rejected: a cold dev page produces thousands of responses, and one
  pending `sizes()`/`body()` call previously pinned the serialized drain for more than four minutes. Body
  retention is operator-requested evidence, not the price of listing request identity.
- Making `printVerdict` return a new object directly is rejected because it changes the fleet-wide caller
  graph. A receipt sibling plus a delegating compatibility function centralizes normalization without a
  broad migration.
- Inferring request-arm success from `opts.requests` is rejected: configuration proves intent, not an
  evidence population. The normalized denominator/refusal is the only state source.

## Coupled sites and ownership

- Request shapes and pure rendering: `snap/contract/request-log.ts`, `snap/lib/request-log.ts`, and their
  public exports in `snap/index.ts`.
- Lifetime owner and attach points: new `snap/ops/request-ring.ts`, `snap/ops/session.ts`, and the explicit
  matrix-context creation path.
- Window/report consumer: `snap/ops/arms/requests.ts`; its `selectNetworkBodies` path is removed.
- Daemon lifetime/export: `snap/ops/session-daemon-call.ts`, `snap/ops/session-daemon.ts`,
  `snap/ops/session-daemon-request.ts`, and `snap/ops/session-evidence.ts`. The URL-keyed failure map stays
  call-scoped; the duplicate accumulated request array goes away.
- Exact terminal truth: `_shared/evidence.ts`, `snap/ops/run.ts`, and
  `snap/lib/run-bundle-verdict.ts`. `snap/ops/run-bundle.ts` remains the existing writer/index/reporter rail.
- B owns `contract/session.ts`, `lib/session-wire.ts`, `ops/session-client.ts`, run-index schema/provenance,
  and shared-rate work. This repair does not edit those files. C's cleanup files are out of scope.
- The parent 1208 design and the 2026-09-03 stickler report are authority/read-only inputs. This repair doc
  is the pre-build design artifact required by agent doctrine; catalog receipt integration belongs to the
  orchestrator because this lane is explicitly forbidden to commit or run the final battery.

## Red-first and planted controls

1. Pure request-log tests pin 4,096 rows, 256 KiB per JSON body, 32 MiB aggregate budget, MIME
   eligibility, stable sequence/window eviction accounting, and human-readable non-retention receipts.
   Each cap has an over-boundary plant that fails if the fence is removed.
2. Browser request-arm integration proves one-shot ordered best-effort `sizes()` evidence and filtered JSON
   body capture; CSS and unmatched JSON are no-read plants, and oversize JSON is not retained. Deferred
   `sizes()`/`body()` controls prove a plain read returns without settling them, while a matching filtered
   read awaits only its own work. A named-session boot captures a boot body only when that boot call
   activates the filter. Repeated calls compare listener counts from the live page so call count cannot
   grow listeners.
3. Evidence-door unit tests prove returned pairs byte-equal the printed RESULT payload for ordinary and
   refused zero-denominator runs.
4. A browser-free run-bundle integration writes a zero-request normalized RESULT through the real bundle
   writer, reads the immutable index, then renders the report and proves all three say refused with the
   same pairs. A nonzero sibling is the positive control.
5. Focused request/session/run-bundle/unified suites run cold after implementation, followed by the two
   TypeScript programs, Biome on touched files, structure gates, and literal sweeps across both TS and TSX
   tests. The orchestrator owns the final battery and commit.

## Prior lessons used

- Memory's Snap-lineage note treats source review as a lead rather than runtime certification; therefore
  the lifetime/listener claim is browser-driven and the writer/index/report agreement uses the real rail.
- The repository's zero-result lesson requires a planted non-vacuity control; every bounded or refused
  result above has an explicit control that must flip when the mechanism is disabled.

## Implementation receipt

Implemented on 2026-09-03 without a commit or final battery, as required by the repair lane. The request
substrate is one `ProbeSession`-owned `RequestRing`; run arms only read checkpoint windows. After the final
live battery found a 3,761-request dev run still in flight after four minutes, the ring was repaired so
plain reads never await metadata/body work and body capture is active-filter-only. The result door returns
the exact normalized pairs it prints, and `run.ts` persists that receipt unchanged.

Red-first: `pnpm exec vitest run tests/tooling/_shared/evidence.test.ts
tests/tooling/snap/ops/request-ring.test.ts --reporter=dot` failed on the missing `RequestRing` module and
missing `printVerdictReceipt` export before implementation. The focused ring/result set then passed 20/20,
and the real request-arm integration passed 7/7 with no type errors after shared rate-posture integration.
The request-session daemon suite passed 15/15. Tooling, root, and DOM-test TypeScript programs passed.

The complete 254-gate structure pass finished and attributed its remaining failures to concurrent B/C
work, except for one request-ring catch marker added immediately afterward. A direct run through the real
`caughtFailureReviewSites` plus `findGateIgnore` classifier proved both request-ring caught sites owned at
marker lines 238 and 251. Biome was clean on A-owned files. The orchestrator still owns the final cold
consolidation battery and documentation-catalog integration.
