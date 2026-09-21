---
kind: spec
status: active
updated: 2026-09-21
---

# 03 — Execution: Dual-Mode, Determinism, DoS Budgets, Bridging, and the Registry Seams

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.**

---

## 1. Dual-mode (committed) — one runtime, two entries

| | Installed plugin | Inline snippet |
|---|---|---|
| Entry path | `setPluginEnabled` → activation subsystem runs `main.js`; instance stays RESIDENT | chat transport → `plugin.runSnippet(chatId, code)` → fresh instance, run once, dispose |
| Principal | the INSTALLING owner (02 §2) | the CALLER — "same membrane, as the author's own principal" (D46) |
| Capabilities | the granted subset | a FIXED PROFILE ∩ what the caller's authority yields per call: `chat.read` + `chat.variables.write` + `chat.quick_reply` + `global_vars`. Variable writes therefore succeed only for a HOST caller (the §2 map's per-call gates do the work — no snippet-special code paths) |
| Manifest | required | none — "no manifest beyond the caller's own authority" (D46) |
| Event subscriptions / tools / transforms | yes (registrations collected at activation) | **NO** — `events`/`tools`/`transforms` namespaces throw `PluginCapabilityError`. WHY: a resident registration from a transient anonymous snippet is unauditable and undisableable (there is no row to disable); persistence of behavior REQUIRES the manifest + grant ceremony. *(Rejected: TTL-scoped snippet subscriptions — a ghost with a timer is still a ghost.)* |
| Lifetime / budget | resident; per-INVOCATION budgets (§3) | one run, 5 s wall-clock total, then disposed |
| Result | none (side effects + log) | `SnippetResult { logLines, error? }` echoed into the caller's chat client (their view only — a snippet is a personal REPL, not a room broadcast) |

This dual-mode IS the STscript medium band: a loop/closure/pipe too rich for a Tier-1 rule but not
worth packaging — typed in the box, run now, isolated, capability-gated, deterministic. No third
"lite scripting" tier exists (D46 law).

## 2. Instance lifecycle + event delivery (installed mode)

- Activation (02 §5): create context → realm setup (01 §1: empty globals, throwing `Date`/`Math.random`
  stubs, `orb` installed) → run `main.js` under the invocation budget → collect registrations.
  Activation failure (throw, `HostVersionError`, budget blow) → row `errored` + `last_error`, never
  a partial activation (registrations from a failed run are discarded atomically).
- **Event delivery:** the plugin host subscribes ONCE per process to the same injected
  `onChatEvent`/`onDomainEvent` seams the automation watcher uses, resolves the SAME `TriggerFact`
  (shared resolver — one implementation, injected into both consumers at compose), then fans out to
  subscribed instances **sequentially per instance, fire-and-forget relative to the bus** (the
  watcher posture: a plugin can never block a turn or another plugin). Delivery is filtered by the
  installer's chat participation (02 §2). **Cascade discipline: plugin-initiated turns carry
  `initiator:"plugin"` + `automationDepth`, and plugin event delivery obeys the SAME depth gates as
  rules** (automation-design/03 §4) — a plugin does not receive automation/plugin-caused events
  unless its manifest sets `matchAutomationEvents` (a manifest boolean mirroring the rule column;
  hard cap 3 regardless). One guard, two consumers — a loop cannot be laundered through a plugin.
- Handler invocation = `invoke(instance, handlerRef, fact)` under the per-invocation budget (§3).
  A handler that throws logs + increments the crash counter (§4). Ordering across events per
  instance is FIFO (a queue per instance, depth ≤ 16; overflow drops-oldest + warns — backpressure
  must not buffer unboundedly).

## 3. Determinism + DoS budgets (the concrete numbers — LEANs with criteria)

Clock/PRNG/ids reach the guest ONLY via `host.clock/random/ids`, bound at compose to the SAME
injected seams production uses (`test-determinism`); the realm-setup test pins the ambient stubs
(01 §4). The budget numbers (all LEAN — the resolution criterion for each is measured abuse or
measured legitimate need, whichever arrives first; each is a named constant in
`infra/plugin-host/budgets.ts`, not scattered literals):

| Budget | Default | Enforced by |
|---|---|---|
| per-invocation CPU | 1 s guest execution (snippet: 5 s total run) | the QuickJS interrupt handler (fires every ~1 M cycles; compares the injected clock against the invocation deadline) |
| memory per instance | 32 MiB | `setMemoryLimit` on the context (WASM-contained — §4) |
| guest stack | runtime default | QuickJS `maxStackSize` |
| host-function self-bound | 5 s deadline + 1 MiB serialized result, per call | EVERY live host function is built by `attachAsync`, which owns the deadline, result cap, pending-deferred teardown registry, and guest-job pump; the interrupt does not preempt blocking host work |
| pending host calls in flight | 32 per instance | the bridge (§ below); call 33 rejects, and a timed-out implementation retains its slot until the work actually settles |
| `host.log` volume | 256 lines / 16 KiB per invocation, ring-buffered per plugin | the log host fn |
| event queue depth | 16 per instance (drop-oldest + warn) | the delivery queue (§2) |

**Async/Promise bridging (explicit + bounded, per D46):** host functions returning promises use
quickjs-emscripten's promise bridge; after each guest job the host pumps `executePendingJobs()`
under the SAME invocation deadline — an await chain cannot outlive its invocation. `setTimeout`
does not exist in the guest (no timers — resident scheduling belongs to events; a sleeping guest
is a held instance). An invocation ENDS when its job queue drains or the deadline kills it;
dangling unresolved guest promises at end-of-invocation are rejected with `PluginInvocationEnded`
(leak-proof: the bridge tracks every outstanding handle and disposes them — handle-lifetime
discipline is what quickjs-emscripten demands, and `attachAsync` plus `Sandbox` own it in ONE place).

## 4. OOM + crash posture

WASM OOM is contained to the instance (the property the runtime was chosen for) — and HANDLED,
never ignored: the host catches the QuickJS OOM/interrupt abort, disposes the context, logs
`{plugin, reason:"oom"|"deadline"|"throw"}`, increments `consecutive_crashes`, and RE-ACTIVATES
lazily on next delivery. At **3 consecutive crashes** (LEAN) the plugin auto-disables (`status:
'errored'`) + the owner is notified — the automation auto-disable posture applied to code. A clean
invocation resets the counter. The host PROCESS is never fatal on any guest behavior; the escape
suite (04) pins this with a hostile-guest corpus. Snippet crashes just return `error` in
`SnippetResult` (no counter — nothing resident to protect).

## 5. Plugin-sourced TOOLS — the D48 reconciliation (registry consumed, not re-designed)

`domain/tool-use` is the ONE registry with two projections (agent-sdk MCP + OpenAI-wire tools[]);
its D46 reconciliation clause already names plugins as **source (b)** gated by `can()`
(tool-use.md §4). The plugin side, concretely:

- At activation, `host.tools.register(def)` hands the def to the injected tool-use registrar op.
  The registered name is **namespaced `plugin_<slug'>_<name>`**, where `slug'` = the manifest slug
  with `-` → `_` (injective — slugs contain no underscores by their own regex, 02 §1) and the
  guest-supplied `name` must match `/^[a-z][a-z0-9_]{0,40}$/` (host-validated at registration);
  the combined name must satisfy tool-use's registry contract `/^[a-z][a-z0-9_]{0,63}$/` (OpenAI
  function-name ∩ MCP charset — tool-use-design/01 §1; an over-length combination is an
  activation-fatal refusal). **Corrected per design-review PLG-1** — the earlier
  `plugin:<slug>:<name>` colon form could never register (colons are outside the wire charset).
  Collisions with builtin/host tools (and rpg's 26) stay structurally impossible via the prefix,
  and provenance stays legible in every `ToolCallRecord`. *(Rejected: flat names — first collision
  breaks a shipped campaign; rejected: a separate plugin-tool registry — the exact "parallel
  universe" D48 forbids; rejected: widening the registry charset to admit `:` — it would break the
  OpenAI-wire projection for every tool.)*
- The registry entry's capability check runs `can()` **as the installing principal** at INVOCATION
  time (not just registration) — a plugin tool invoked in a chat its installer can't read fails
  the tool call with errors-as-data (the model corrects; never a crash).
- The handler executes IN the guest under the §3 invocation budget; its string result flows back
  as the tool result. Schema validation of args happens HOST-side against the registered JSON
  schema BEFORE the guest sees them (a malformed-args tool call never spends guest budget).
- Deactivation/uninstall deregisters atomically with the instance disposal (02 §4) — no ghost
  tools.

## 6. Plugin transforms — the D50 seam, consumed

`host.transforms.register` → the injected transform registrar (automation-design/04 §6). Plugins
occupy the 1000+ order band (after automation's 0–999 — policy wraps guest); per-registration
order is activation order (stable across restarts: plugins activate in `installed_at` order). Each
`apply` call is a guest invocation under §3 budgets AND the pipeline's own 250 ms transform
deadline — the tighter bound wins; timeout = skip + warn, the turn proceeds (D53). Transforms
attach only to chats where the installer is host (02 §2).

## 7. What the guest author experience is (so the membrane is testable against reality)

```js
// main.js — a complete installed plugin
const host = orb.host(1);
host.events.on("messageCommitted", async (fact) => {
  if (fact.message?.role !== "user") return;
  const vars = await host.chat.getVariables(host.chat.current());
  if (Number(vars.tension ?? "0") > 3) {
    await host.chat.surfaceQuickReply(host.chat.current(), [
      { label: "Take a breath", sendText: "((slow the scene down))" },
    ]);
  }
});
host.tools.register({
  name: "mood_report",
  description: "Summarize the room's tracked mood variables",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  handler: async () => JSON.stringify(await host.chat.getVariables(host.chat.current())),
});
```

This file is the fixture spine of the 04 test plan — every membrane behavior above is observable
from a guest this small plus the hostile corpus.
