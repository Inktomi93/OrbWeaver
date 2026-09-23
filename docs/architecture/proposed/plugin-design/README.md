---
kind: spec
status: active
updated: 2026-07-03
---

# Plugin Design — the prescriptive plan for `infra/plugin-host` + `domain/plugin` (D46 Tier 2, doc-set index)

> **Status: COMMITTED (D46, 2026-06-28) — a deliverable, not a maybe.** This doc set is the
> authoritative BUILD design for the Tier-2 code sandbox (D46 is the
> decision record and wins on any conflict; `../automation-design/automation.md` §3 remains the committed
> decision digest). Sequenced after the Phase-5 seams it depends on (the `can()` axis, the chat
> event bus, the turn pipeline) and after the Tier-1 set it composes with
> ([`../automation-design/`](../automation-design/README.md) — the trigger taxonomy, the
> PromptTransform seam, and the budget axes are DEFINED there and consumed here). Everything here

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD-LATER. The P1 runtime spike is dispatchable anytime; P4+ is blocked on automation A5–A7 + the D50 transform seam + the tool-use registry.
> is prescriptive and self-contained; every decision carries its WHY + the rejected alternative.

## The one-paragraph design

One runtime — **QuickJS-ng via `quickjs-emscripten` (WASM), in-process** — serves two authoring
modes: **installed plugins** (manifest-declared, capability-granted, persistent, event-subscribed)
and **inline snippets** (typed in the chat box, run once as the caller, transient). Guests see
exactly one thing: the **frozen, versioned, typed membrane** `PluginHostV1`
(`@orb/contracts/plugin`) — opaque handles, primitives across the boundary, capability-gated host
functions, injected clock/PRNG/ids — the antithesis of ST's `getContext()` god-object. Every
capability a manifest declares maps to a concrete enforcement (a `can()` call, `fetchOwned`
row-scoping, or a D17 consent/budget gate) and the plugin runs as its INSTALLING principal — it can
never exceed that principal's authority, and there is no ambient FS/network/DB. DoS is enforceable
by construction: per-invocation interrupt + memory caps on the guest, self-bounding on every host
function, bounded async bridging, and WASM OOM contained to the instance (the property that
disqualified `isolated-vm`). Plugin-sourced TOOLS register into the ONE `domain/tool-use` registry
(D48 — source (b), namespaced, `can()`-gated); plugin prompt transforms register into the ONE D50
`PromptTransform` seam (automation-design/04 §6, order 1000+). `domain/plugin` (8-slot leaf) owns
the registry rows, lifecycle verbs, and grants; `infra/plugin-host` owns the runtime and nothing
else.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-runtime-and-membrane.md`](01-runtime-and-membrane.md) | the committed runtime + the rejected list (carried from D46), the membrane principle, the FULL `PluginHostV1` surface inline, opaque handles, versioning/failure-on-V2 semantics |
| [`02-manifest-capabilities-lifecycle.md`](02-manifest-capabilities-lifecycle.md) | the manifest zod schema, the capability vocabulary + its enforcement map onto `can()`/fetchOwned/D17, the `plugins` DDL, install/enable/disable/uninstall verbs, the grant flow, the `domain/plugin` 8-slot layout |
| [`03-execution-model.md`](03-execution-model.md) | dual-mode mechanics (installed vs inline), instance lifecycle, determinism, the DoS budget numbers (LEANs + criteria), async/Promise bridging, OOM/crash posture, event delivery, the D48 tool seam + the D50 transform seam |
| [`04-build-plan.md`](04-build-plan.md) | P1–P6 shippable chunks with sizes, dependencies, checkpoints, per-chunk test plans (membrane-escape suite, determinism gates) |

## Standing decisions a cold agent must not re-litigate (D46 law)

**Runtime: QuickJS-ng via `quickjs-emscripten`.** The rejected list is PERMANENT — do not
re-research: `isolated-vm` (maintenance mode; V8 cannot unwind OOM — hostile code crashes the whole
process, disqualifying in-process on a self-hosted box) · SES/Compartments (`lockdown()` mutates
global intrinsics process-wide — too invasive) · WASM-component/Zed model (cleanest capability
story but forces plugin authors to compile Rust/Zig — wrong ergonomics; its MANIFEST/capability
SHAPE is copied, its runtime is not). ST's `getContext()` god-object and dynamic-`import()`
extension model are permanently OUT · **dual-mode is committed** — installed plugins AND inline
snippets, one runtime, one capability model, one determinism seam; NO third "lite scripting" tier ·
plugins never get a second tool registry (D48: ONE registry, two sources) or a second rule engine
(D46) · the membrane gate is `plugin-no-ambient` · clock/PRNG/ids reach the guest ONLY via injected
host functions (`test-determinism`).
