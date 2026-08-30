---
kind: design
status: active
updated: 2026-08-30
---

# Plugin-host float visibility — #805's true mechanism, #806's ring fix, and the observability wiring

Designed by lane `forge-plugin-float` (forge, died at an API ceiling with zero commits); re-verified and
built by lane `cb-plugin-float` (forge) — §6 carries the build-time re-derivation. Three tied pieces in one
seam: the "large-body continuation parks forever" defect (#805), the log-ring destroy-on-reset defect that
masked it (#806), and the owner's ask to register plugin + automation logs into the centralized
observability surface. Base `3ff8bfe4b`.

## 1. #805 — the premise was wrong: there is NO host liveness bug. The park is `Date.parse` in the guest.

The brief (and `card-atlas-art-forward.md` §8f) framed #805 as a HOST liveness defect: a floated guest
continuation resuming from a LARGE (\~100KB+) host-fn result body "parks forever" while small bodies
complete, with suspects recorded against the shared-runtime interrupt handler and `executePendingJobs`
early-yield. **Every part of that framing was probed and killed:**

- **The host resume machinery is sound at 200KB.** A clean-room repro on the REAL
  `createPluginHost` stack (real QuickJS sandbox + membrane + pump) drove a floated continuation
  through a 195,601-byte host-fn result — marshal → `deferred.resolve` → post-settle pump → guest
  `JSON.parse` → two further host hops → publish — and it completed, both when the settle landed
  mid-invocation and when it landed 400ms post-invocation (scratch probe, two-arm small/large control;
  both green on unmodified source).
- **`executePendingJobs` has no early-yield** — the wrapper loops `QTS_ExecutePendingJob(rt, -1)` to
  queue-empty (quickjs-emscripten-core 0.32.0 dist, `executePendingJobs`), and the §8f receipts
  themselves say `failed=false, hasPendingJob()=false`.
- **The §8f receipt "pump ran 4 jobs" is the guest RESUMING, not parking.** Job 1: `getJson` resumes,
  `JSON.parse(body)` succeeds. Job 2: the hub's `search()` resumes into the row mappers — **and throws.**
  Jobs 3–4: the rejection propagates to `runSearch`'s `.catch` (main.js:2076), which logs
  `search failed: …` and settles. Queue empty, no pump failure, nothing published. Exactly the receipts.

**The throw:** `epochMs()` (card-atlas `main.js:275`) calls `Date.parse(v)` for any non-numeric date
string — and the sandbox realm REPLACES `Date`/`Date.parse` with throwing stubs (the D46 determinism
law, `infra/plugin-host/realm.ts` AMBIENT\_STUBS). The five "parked" hubs are EXACTLY the five whose row
builders feed `epochMs` an ISO string; the three working hubs never reach `Date.parse`:

| hub | date field on the wire (live receipts 2026-08-30) | path in `epochMs` | outcome |
| - | - | - | - |
| chub | `createdAt: "2023-12-08T03:23:45Z"` | `Date.parse` | THROWS |
| wyvern | `created_at: "2026-08-28T22:26:15.959Z"` | `Date.parse` | THROWS |
| aicc | `createdAt: "2026-08-29T21:30:51.789Z"` | `Date.parse` | THROWS |
| botbooru | `created_at: "2026-08-29T17:42:36.854153"` (no TZ, µs fraction) | `Date.parse` | THROWS |
| datacat | `firstPublishedAt: "2026-08-20T00:46:34.048Z"` | `Date.parse` | THROWS |
| pygmalion | epoch-second STRINGS (`/^\d+$/` matches) | numeric arm | works |
| tavern / realm | no `epochMs` call in the row builder at all | — | works |

"Large body" was a pure confound: chub's 63KB body (SMALLER than working realm's \~51KB drive body class)
parks identically. Proof harness: the REAL shipped `main.js` driven in node with realm-faithful ambient
stubs (Date/Date.parse/Date.UTC/Math.random/performance all throwing) against the LIVE hubs — all five
die with `search failed: Error: Date.parse is disabled in the plugin sandbox…`; pygmalion publishes 30
tiles under the same stubs. With a REAL `Date` the identical run publishes — which is why the offline
harness of §8f "proved the adapters correct": **its stub realm was not realm-faithful, and `Date` is
exactly the axis it diverged on.** (`fmtDate` at main.js:281 — `new Date(ms).toISOString()` — has the
same landmine on the DETAIL sheet for every date-carrying hub.)

**Why it read as "no throw, no strike, no log":** the throw IS caught — `void runSearch(...).catch(err => host.log.warn("search failed: " + err))` — so no crash strike (the scheduling invocation settled ok
long before) and no unhandled anything. The one piece of evidence — the `host.log.warn` line — is
written by a floated continuation AFTER the invocation's drain, and **#806 destroys exactly those lines**
(`runToSettlement`'s `this.log.reset()` clears the per-invocation ring at the next invocation before
anything retains them; `plugin.getLog` reads only the retained runtime ring). Two defects composed into
a perfect illusion of a host park.

### The fix (guest-side, determinism-law-honoring)

`Date` stays banned — the realm's ambient-denial is the owner's deliberate D46 determinism wall and is
NOT touched. `epochMs`/`fmtDate` become pure arithmetic (Howard Hinnant's days-from-civil /
civil-from-days over `Date.UTC`-free math), parsing exactly the wire shapes receipted above:
`YYYY-MM-DD[Tt ]HH:MM[:SS[.frac≤9]][Z|±HH[:]MM]` plus bare `YYYY-MM-DD`; fraction truncated to ms; a
missing timezone is read as UTC (botbooru's naive stamps; the value feeds a YYYY-MM-DD display and sort
ordering, where a fixed-offset error of hours is immaterial). Unparseable stays `undefined` (the
existing "absent datum" contract — a format drift degrades a sort datum, never a search). Manifest
version 1.3.1 → 1.3.2 so live stages upgrade cleanly.

### Rejected alternatives

- **Relax the realm's `Date` stubs (even read-only `Date.parse`)** — refused: the ambient-denial is
  owner law (D46; `realm.ts` header), and `Date.parse` of an attacker-shaped string is precisely the
  locale/implementation-divergence surface the determinism law exists to exclude.
- **A host-side "resume" fix** — nothing to fix; the continuation resumes today. The host's real gap is
  VISIBILITY, owned by #806 + §3 below.
- **A guest unhandled-rejection tracker** (for floats WITHOUT a `.catch`) — quickjs-emscripten-core
  0.32.0 does not expose `JS_SetHostPromiseRejectionTracker` (dist grep: zero hits for
  `PromiseRejection`); reaching it means patching the wrapper/C layer. DEFERRED with this receipt; the
  visibility class is meanwhile covered because a guest that catches-and-logs now has surviving logs
  (#806) that also land in the central ring (§3), and every atlas float carries a `.catch`.

## 2. #806 — a reset that destroys evidence becomes a drain that attributes it

Mechanism: `LogRing` (realm.ts) is the per-invocation ring; `port.ts`'s `retainLog` copies each
invocation's DRAINED lines into the per-resident runtime ring that `readLog`/`plugin.getLog` serve.
Lines a floated continuation pushes BETWEEN invocations sit in the LogRing until
`runToSettlement`'s opening `this.log.reset()` destroys them — nothing ever retained them.

Fix (three small moves, one semantic):

1. `LogRing.drain()` becomes DESTRUCTIVE (copy + clear + zero the byte budget); `reset()` is deleted
   (its only production caller was the destroyer; realm.test's direct use migrates). Every drain site
   now yields "lines since the last drain" — for the serialized invocation flow that is byte-identical
   to today's per-invocation logs.
2. `Sandbox` exposes `drainLog()` (the same destructive drain, for the port).
3. `port.invoke` picks up residue BEFORE running (`retainLog(resident, sandbox.drainLog(), now)`), and
   `port.readLog` does the same before copying — so `plugin.getLog` surfaces float lines LIVE, with no
   later invocation needed. Residue lines are stamped at pickup time (the ring's `at` was always the
   drain clock, not the push clock — unchanged posture, now stated).

Accepted seam: a `readLog` racing a mid-flight invocation may retain that invocation's so-far lines
itself, leaving the invocation's own `outcome.logs` without them — same resident ring either way, no
loss, no duplication (drains are synchronous and destructive). Comments in `budgets.ts` (the "resets
every run" claim) and the port header are truth-repaired in the same commit.

## 3. Observability — register both sources into the EXISTING centralized ring + file stream

Recon receipts: the centralized infra is `foundation/observability/logger.ts` — ONE pino logger
multistreamed to stdout (the stack's file log) and the in-process `logRing` (2000 lines) that
`/api/_debug/logs` + `/api/_debug/errors` serve; `recordMemoryLog` (memory-log.ts) is the house
precedent for a subsystem mirroring tagged lines into it. The debug read surface is
`registerDebugRoutes` (debug/routes.ts) with two house patterns: in-memory domain recorders inject as
structural read PORTS (`RpgTraceInspector`, `MemoryRecallInspector`); DB-backed data reads directly in
`debug/inspect/`. The client dev bridge is `globalThis.__orb` (agent-bridge.ts), and the standing owner
rule is that every debug surface registers an accessor there.

**Nothing new is built — both sources ride those rails:**

- **Plugin guest logs → the central stream.** `LogRing` gains an optional per-line mirror callback;
  the Sandbox threads it from `Sandbox.create`; the port supplies
  `getLog()[level]({ plugin: label }, message)` — so every accepted guest line lands, AT PUSH TIME
  (floats included), in the pino stream = the file log + the central ring, tagged and filterable
  (`/api/_debug/logs?q=`). `label` is the manifest slug, threaded as plain data
  (`CreateInstanceInputIn.label`, the `netHosts` posture) from `activation/activate.ts` (which already
  holds it). Volume is bounded by the LogRing's own caps (256 lines / 16KiB per drain interval).
  The structured per-plugin read already exists (`plugin.getLog`, owner-scoped) and — with #806 —
  now tells the truth; a SECOND `/api/_debug/plugins/log` route was REJECTED (the resident registry is
  deliberately service-internal; two read paths for one ring is a doubling with no new capability).
- **Automation fire/analysis log → `/api/_debug/automation/fires`.** The fire log is already a durable
  DB table (`automation_fires` — outcome + per-arm/analysis `detail` + trigger + depth + chat/rule),
  so it takes the `inspect/` DB-probe pattern: a principal-blind newest-first read (excluding the
  internal `reserved` reservations), `?chatId=`/`?ruleId=`/`?limit=` filters, registered under the
  existing `db !== undefined` arm behind the existing debug gate. The analysis arm's own diagnostic
  lines already flow through `getLog()` into the central ring (receipts: analysis-arm.ts:433,
  dispatch.ts:163/455/528) — reused, not duplicated.
- **`__orb` accessors** (the wire-everything standing rule): `__orb.pluginLog(pluginRef?)` — a new
  `agent-plugin/` handle riding the EXISTING owner-scoped trpc reads (list + getLog; ref matches slug
  or id; no ref lists the roster) — and `__orb.automationFires(filter?)` — a same-origin fetch of the
  new `_debug` route (the admin session passes the gate in dev), built inside agent-bridge like
  `snap()`. Both dev-only by construction (the `agent-handles` dynamic-import arm).

The guest realm gains NOTHING: every read above is HOST-side (debug gate or owner-scoped verb); no URL,
byte, or log line crosses into a guest. No containment belt (exfil wall, 32-call cap, CPU windows,
admission/consent) is touched.

## 4. Coupled-site inventory (swept before build; the BUILT set — §6 records what the sweep missed)

1. `seed-assets/plugins/card-atlas/main.js` (the date engine: `parseIsoStamp` + Hinnant civil arithmetic
   replacing `Date.parse` / `new Date`) + `manifest.json` (1.3.2 — the version bump IS the upgrade path for a
   latched install, #803).
2. `infra/plugin-host/realm.ts` — `LogRing` destructive `drain()`, `reset()` deleted, the `LogMirror` port
   (a one-member interface: an exported type ALIAS is `no-inline-types`-red outside a type home, and biome's
   `useShorthandFunctionType` autofix rewrites a callable interface back into one — the structural-injection
   port shape is what both tools accept); `AMBIENT_STUBS` exported for the realm-faithful harness.
3. `infra/plugin-host/sandbox.ts` — no reset at invocation start (the note beside `inFlight` now covers
   both); `logMirror` create-option; `drainLog()`.
4. `infra/plugin-host/port.ts` — `label`; `centralLogMirror`; residue pickup in `invoke` (inside the
   serialized slot, before the run) + `readLog` (before the copy); header.
5. `infra/plugin-host/budgets.ts` — the two ring comments ("resets every run" → per-drain interval).
6. `domain/plugin/contract/service.ts` (`CreateInstanceInput.label`; the `readLog` doc) +
   `activation/activate.ts` (threads the slug).
7. `foundation/observability/debug/inspect/automation-fires.ts` (new) + its `index.ts` barrel +
   `debug/index.ts` + `debug/routes.ts` (`/api/_debug/automation/fires`, under the `db` arm).
8. Client: `lib/agent-bridge.ts` (the handle + `pluginLog`/`automationFires` install + the console line),
   `lib/agent-plugin-bridge.ts` (new — the plugin/automation types + the fires read, split out at the
   450-line `component-size` cap), `agent-plugin/index.ts` (new), `agent-handles/index.ts`,
   `lib/agent-tools.README.md`, `.dependency-cruiser.cjs` (the composition-tier alternation),
   `client-architecture-lockdown.md` §3/§7.
9. Tests: `tests/server/entry/boot/seed-atlas-realm-dates.suite.test.ts` (new), `port.test.ts` (#806 ×2
   - mirror ×2), `realm.test.ts` (destructive-drain + mirror pins; the double-drain capture),
     `tests/server/foundation/observability/debug/inspect/automation-fires.int.test.ts` (new),
     `routes.int.test.ts` (the fires route ×4), `tests/client/agent-plugin/index.test.ts` (new),
     `tests/client/lib/agent-plugin-bridge.test.ts` (new); `docs/test-baseline/manifest.json` (four rows,
     hand-inserted — the regenerator sweeps sibling lanes' unlisted files).
10. `docs/catalog/receipts/design.json` — this doc's born-reviewed receipt + `card-atlas-art-forward.md`'s
    re-attest (its §8f truth repair changed its bytes), in the companion docs commit.

## 5. Test plan (red-first)

- **#805**: the realm-faithful suite drives the REAL `main.js` with a canned chub/wyvern-shaped ISO-date
  fixture body — RED on unmodified source (publish never lands; the float's catch logs the Date.parse
  refusal), GREEN after: tiles publish, `created`-sort orders by the parsed dates, `fmtDate` renders
  YYYY-MM-DD, and a planted CONTROL (a hub row with an unparseable date) still publishes with the datum
  absent. Date-engine unit rows pin each receipted wire shape (Z / ms-fraction / µs-fraction-no-TZ /
  epoch-second-string / bare date) against known epoch values.
- **#806**: two pins on the real port (gated float, bridge-visible marker): (a) a float's log line
  survives a LATER invocation to `readLog` — RED today (reset destroys it); (b) `readLog` alone surfaces
  it with NO later invocation — RED today (nothing drains residue).
- **Observability**: a guest line pushed under a `label` lands in the central `logRing` tagged
  `plugin: <label>` (planted-positive control: assert the exact line, not an empty-scan green); the
  fires route serves a seeded fire row and filters by chatId; both new routes stay behind the debug gate
  (the existing gate suite covers the middleware — the new route registers under it).

## 6. Build-time re-derivation (lane `cb-plugin-float`, 2026-08-30 — the premise re-verified before a byte moved)

The inherited design was treated as a hypothesis (the tree moves daily; the issue bodies still carry the
host-liveness framing). Both halves of §1 reproduced on the UNMODIFIED tree at `3ff8bfe4b`:

- **Host tier — sound.** The inherited two-arm probe (real `createPluginHost`, a float resuming from a
  400 ms-late `storage.get`) on the unmodified tree: `[probe:small] published=true hop=published
  bodyBytes=368` · `[probe:big] published=true hop=published bodyBytes=195601`. A 195 KB body resumes.
- **Guest tier — the throw.** The REAL shipped `main.js` driven in a `node:vm` context whose ambient
  denial is the realm's `AMBIENT_STUBS` text, with a canned chub-shaped search body: the page stays at
  `Browsing Chub…` with zero tiles and the float's catch logs exactly
  `[warn] search failed: Error: Date.parse is disabled in the plugin sandbox — use orb.host(1).clock /
  .random for deterministic time and entropy`. That line is the one #806 destroyed on the live stage.

### 6a The realm-faithful suite — mechanism and the arms rejected

`tests/server/entry/boot/seed-atlas-realm-dates.suite.test.ts` runs the real `main.js` source in
`vm.createContext({})` (bare ES intrinsics — no timers, no fetch, no process — structurally the same
floor a bare QuickJS context offers) after evaluating the realm's EXPORTED `AMBIENT_STUBS` in it, so the
harness's ambient denial is the realm's by construction (one home, never a copy that can drift — a
drifting copy with a live `Date` is exactly why §8f's offline harness "proved the adapters correct").
`orb.host(1)` is a fake surface over Maps and a canned `net.fetch` keyed by URL substring. The guest's
top-level function declarations (`epochMs`, `fmtDate`) are reachable as context globals (a sloppy-mode
script's top-level declarations land on the global object — the same shape `evalCode` gives QuickJS), so
the date-engine rows call them directly.

Rejected: (1) driving the search through the REAL QuickJS sandbox — `safeFetch` has no injection seam
(`seed-example-plugins.int.test.ts` header), so the wire halves would be live requests, and `vi.mock`-ing
`#infra/network` is the mock-doctrine violation the gates exist to refuse; (2) a stub-text copy in the
test — the §8f failure class; (3) exporting `epochMs`/`fmtDate` from `main.js` for a unit test — the
guest is a script, not a module, and a `module.exports` shim would be dead weight in the shipped bundle.

### 6b Facts that shaped the pins

- The test environment runs pino at `LOG_LEVEL=silent`, so the central `logRing` is NEVER fed under
  vitest (`logger.test.ts` header). The central-ring pin therefore spies the exact `logger.<level>`
  call the mirror makes (`{ plugin: label }`, the clamped line) — the house pattern
  (`memory-log.test.ts`) — with a planted line whose absence would fail the spy, never an empty-scan
  green. The route→ring path is pinned separately by the existing `/api/_debug/logs` reader.
- `LogRing.drain()` callers on the tree (ast-grep, 2562 ts files + 540 tsx): `sandbox.ts` ×4 and
  `realm.test.ts` ×6 — one realm.test pin drains the same ring twice and is migrated to capture once;
  `reset()` callers: `sandbox.ts:509` (the destroyer) + `realm.test.ts:327` (migrated). No sibling suite
  asserts `outcome.logs` (rg over sandbox/escape/membrane/cpu-guard/module/marshal).
- `runSnippet` is unlabelled (no manifest) and stays unmirrored: its lines are echoed to the caller's
  own REPL already, and inventing a label would tag the central log with a fiction.
- A NEW composition-tier directory (`client/src/agent-plugin/`) has coupled sites the inherited §4 did
  not list: the `client-composition-tier-door-only` dep-cruiser rule's directory alternation
  (`.dependency-cruiser.cjs`), `client-architecture-lockdown.md` §3/§7's member list,
  `lib/agent-tools.README.md`'s handle table, the `docs/test-baseline/manifest.json` row for its mirror
  test (single writer: `node tooling/src/verify/cli.ts baseline test-baseline-manifest`), and
  `agent-handles/index.ts`. `@orb/client/*` resolves to `src/*/index.ts`, so the new dir is importable
  by its bare name.
- `card-atlas-art-forward.md` §8f states the dead host-defect framing as fact; it is truth-repaired
  with a pointer here (its catalog receipt re-attests in the companion docs commit).
