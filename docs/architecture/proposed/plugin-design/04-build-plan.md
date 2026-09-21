---
kind: spec
status: active
updated: 2026-09-21
---

# 04 — Build Plan: Chunks, Dependencies, Checkpoints, Test Plans

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.**
> Phase-8, AFTER the Tier-1 set (automation-design/05) — the plugin host consumes Tier-1's fact
> resolver, budget stack, cascade guard, and transform seam rather than rebuilding them.

## Dependencies

| Dependency | Source | Consumed by |
| - | - | - |
| `can()` axes + `fetchOwned` | Phase 5 (live) | P3, P4 |
| TriggerFact resolver + cascade depth plumbing | automation-design A5/A6 | P4 |
| `automation_budgets` spend stack + D17 gates | automation-design A6 | P4 |
| `PromptTransform` seam | automation-design A7 (chat pipeline) | P4 |
| `domain/tool-use` registry (D48) | Phase 7 | P4 (tools dark until it lands) |
| assets CAS + `"plugin"` AssetKind | assets domain (additive tuple member) | P3 |
| `quickjs-emscripten` pin | new dependency — pin + rationale recorded in BUILD-PLAN §0 style at P1 | P1 |

## Chunks

| # | Chunk | Size | Contents | Checkpoint (must demo) |
| - | - | - | - | - |
| P1 | Runtime spike + realm | **M** | `infra/plugin-host` skeleton: module load, context-per-instance, realm setup (empty globals, throwing stubs, `orb.host(1)`), interrupt/memory budgets, handle-lifetime bridge | a hello-world guest runs; `Date.now()` throws in-guest; a `while(true)` guest dies at the deadline with the process healthy |
| P2 | The membrane contract | **M** | `@orb/contracts/plugin` in full (01 §2): `PluginHostV1`, handles, manifest schema + capability tuple (02 §1), errors | contract tests: every host-function capability annotation present (mapped-type Record over `PLUGIN_CAPABILITIES` — a capability with no function, or vice versa, fails `tsc`) |
| P3 | `domain/plugin` + lifecycle | **L** | DDL (02 §3), all verbs (02 §4), bundle unzip/validation, CAS storage, grants math, activation subsystem, crash policy (03 §4), the log ring | install→grant→enable→invoke→disable round-trip; upgrade-with-new-caps lands disabled; uninstall leaves zero rows/assets/registrations |
| P4 | Host-function wiring + seams | **L** | `PluginHostOps` composition, every 01 §2 namespace live against real domain ops, event delivery + depth gates (03 §2), D48 tool registration (03 §5), D50 transforms (03 §6), spend/budget/D17 integration | the 03 §7 fixture plugin works end-to-end in a real chat; a plugin tool round-trips the recurse loop with a namespaced `ToolCallRecord`; a plugin-triggered turn debits `automation_budgets` |
| P5 | Inline snippets | **S** | `runSnippet` (03 §1): fixed profile, 5 s wall, `SnippetResult`, transport verb + client echo | a member snippet reads vars; its `setvar` attempt fails cleanly (non-host); a host snippet writes; no registration namespace reachable |
| P6 | Hardening + escape suite soak | **M** | the hostile-guest corpus (below) as a permanent test suite; budget-number review against soak data; the `plugin-no-ambient` dep-cruiser rule | full escape suite green in CI; the 02 §4 install-widening criterion formally reviewable |

## Per-chunk test plans

- **P1 (determinism + containment):** injected-clock/PRNG determinism — two runs of a
  clock/random-using guest with the same seams are byte-identical (`test-determinism` gate);
  deadline kill (busy loop, deep recursion); memory kill (allocation bomb → instance dies, process
  RSS stable); handle-leak assertion after 10k invocations (the bridge's dispose-tracking).
- **P2:** manifest matrix — every refusal typed (bad slug, unserved hostVersion, netHosts without
  net.fetch, caps superset); capability↔function completeness pin.
- **P3:** grant-subset enforcement (ungranted namespace throws `PluginCapabilityError`);
  atomic-activation (a main.js that registers a tool then throws leaves NO registration); crash
  counter → auto-disable at 3 → notification; re-grant-on-upgrade.
- **P4 (membrane-escape suite — the load-bearing one, kept forever):**
  - **ambient escape:** guest probes for `Date`, `Math.random`, `setTimeout`, `fetch`,
    `eval`-reachable host objects, constructor-chain walks (`({}).constructor.constructor`),
    prototype pollution of marshalled objects → all inert (throwing stubs or plain data).
  - **handle forgery:** a fabricated `ChatHandle` string → typed resolution failure, no read.
  - **authority ceiling:** an installer who is NOT a participant of chat X gets zero deliveries
    for X and `chat.read` failures against it; a non-host installer's variable write refused.
  - **cross-plugin isolation:** two instances cannot observe each other's globals/KV; plugin A's
    `storage.kv` invisible to plugin B.
  - **reentrancy/self-bounding:** a host fn stubbed to hang → the 5 s host bound fires (proving
    the interrupt-doesn't-preempt-host-calls footgun is owned); 33rd concurrent host call rejected.
  - **cascade laundering:** rule → `trigger_turn` → plugin subscribed WITHOUT
    `matchAutomationEvents` receives nothing; with it, depth 3 hard-stops (one guard, two
    consumers — the automation-design A6 loop test re-run through the plugin path).
  - **spend ceiling:** plugin `requestTurn` past the daily cap → `budget_refused`-class error in
    the guest, no turn.
  - **net.fetch:** off-allowlist host, redirect-to-off-allowlist, 1 MiB+ body, private-range IP
    literal → all refused (the marinara `safeFetch` posture, tested not trusted).
- **P5:** profile fixation (snippet `tools.register` throws); transience (a snippet's quick-reply
  chips survive, its instance does not — no residency); caller-principal attribution on its
  variable writes.
- **P6:** the whole P4 suite promoted to CI-permanent + a fuzz pass (random JS corpus at the
  membrane) with a crash-free assertion.

## Review flags (Tier-2)

1. **The snippet capability profile** (03 §1) is a design call inside D46's "same membrane, caller
   principal, transient" clause — the fixed four-capability profile is the narrowest useful REPL;
   ratify or widen deliberately.
2. ~~**Install authority owner∪admin v1** (02 §4) with a recorded widening criterion — ratify.~~
   RESOLVED 2026-08-24: the criterion came due and the owner ruled. Install authority is SELF — any
   authenticated principal, for themselves — with the row's `ownerId` as the entire gate and no admin
   any-row branch (`Core-Path-Registry.md` D147; 02 §4 carries the resolution).
3. **`matchAutomationEvents` as a manifest boolean** mirrors the rule column so ONE cascade guard
   serves both (03 §2) — the automation builder should treat the depth plumbing as shared
   infrastructure, not rule-private.
4. **`"plugin"` AssetKind** — one additive tuple member in `@orb/contracts/assets`; assets owner
   should ratify (the imagery `"generated"` precedent).
