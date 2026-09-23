---
kind: adr
status: active
updated: 2026-09-23
---

# a CONTRIBUTOR seam is closed-world in its VOCABULARY and open-world in its INSTANCES; the boundary between them is always a namespaced string carrying a per-contributor refusal

## Context

Not recorded in the ledger row.

## Decision

Orbweaver has two contribution regimes and they are not interchangeable. **FIRST-PARTY (closed world):** a domain raises a seam in a ratified root slot (`domain/<x>/workload-contributions.ts` D117, `domain/<x>/teaching-contribution.ts` D145), `entry/compose` assembles them, and the registry asserts EXHAUSTIVE + duplicate-free against a compile-time tuple — a missing member and a doubled member are both BOOT-FATAL (`keyByKind`, `entry/compose/workload-contributions.ts`). That is correct precisely because a first-party contributor is a build artifact: absent means the build is wrong. **CONTRIBUTOR (open world):** a plugin registers at ACTIVATION, after compile, from a bundle a person chose to install (`domain/plugin/activation/activate.ts` → `substrate/registrar.ts`). Every closed-world assumption inverts — the vocabulary is not knowable at compile time, absence is NORMAL (a plugin is optional by definition), two contributors may want one name, and a bad contributor must never take the process down. **Five clauses.** (a) **THE VOCABULARY STAYS CLOSED; the openness lives in a payload string.** A contributor extends what the system can DO without growing a closed union: the union member is first-party and `tsc`-forced, and the open-world name rides INSIDE it. Adding an open arm to a closed union is the banned move — it defeats every exhaustive dispatch downstream (§5.5). (b) **REFUSAL IS PER-CONTRIBUTOR, NEVER PER-PROCESS.** A collision or a bad registration is fatal to THAT contributor's activation only — the partial registrations unregister, the instance disposes, and the row lands `errored`; the app does not care. Never reach for the closed-world boot-fatal throw on a contributor seam. (c) **NAMES ARE NAMESPACED AT THE SEAM, by the host, from an identity the contributor cannot forge** (`plugin_<slug>_<name>`) — a contributor never supplies its own prefix, so collision is bounded to a single misbehaving contributor rather than reachable across them. (d) **CONSUMERS MUST HANDLE THE CONTRIBUTOR DISAPPEARING — this is the clause with no first-party analogue and it is why the regime needs its own entry.** A first-party contributor never goes away; a plugin is disabled, upgraded, or uninstalled by deliberate user action at any time. A consumer that treats a vanished contributor as an ERROR rots: an unknown tool name at fire time is an `arm_error`, `arm_error` increments `consecutive_errors`, and a rule auto-disables at 20 (`domain/automation/engine/dispatch.ts`) — so disabling one plugin would silently consume every rule naming its tools, and re-enabling would not bring them back. A consumer PAUSES on a missing contributor (a distinguishable, self-healing state) and never spends an error budget on it. (e) **A FIRST-PARTY REGISTRY MAY STAY FIRST-PARTY; its open-world arm is a GENERIC FALLBACK, not an extension point.** The client `ToolRenderer` registry is door-assembled and closed (`client/src/lib/contribution-contracts.ts`); an unknown tool renders the generic `ToolCallBlock`. That is the correct answer, not a gap — a contributor gets an honest render without a client-side membrane, and the render plane stays a place where untrusted code does not run. ENFORCEMENT, tiered honestly: clause (a) is `tsc` (the closed tuple + exhaustive `Record`/`assertNever`); (b) and (c) are the registrar's own code plus the plugin-host suites; (d) and (e) are REVIEW-tier — no gate distinguishes a paused consumer from a rotting one, and a lane adding a contributor-consuming seam must state which clause each arm satisfies. COMMITTED (not yet built): the `run_tool` arm and the per-turn plugin attach path are the two consumers this entry governs and neither exists — a registered plugin tool is today reachable by nothing.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
