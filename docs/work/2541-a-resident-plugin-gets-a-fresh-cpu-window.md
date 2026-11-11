---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# A resident plugin gets a fresh CPU window for every pump after its invocation ends

## What

After a plugin's invocation returns, guest code it left queued keeps running: each pump of the engine outside an invocation opens a full CPU window of its own (packages/server/src/infra/plugin-host, the sandbox and cpu-guard modules). Measured with a real guest on main and on the CPU-window branch: a command that returns after starting a chain of host calls with a busy loop between them holds a core continuously and slows every later command. In a variant that chains through a call the host refuses without I/O, the Worker never returns to its event loop, the next command goes unserved and a disable cannot be delivered. Source: finding N-1 in the leg-five security review of the security lane under reports/review, which holds the probes.

## Why

An installed plugin can pin a core, or wedge its own Worker past the reach of disable, with a few lines. The CPU window promises a bound per invocation and this work is charged to no invocation.

## Done when

Guest work that runs outside an invocation spends one account per plugin instance that refills only when an invocation opens; a spent account refuses the chain's next host call at entry. Real-guest tests show the host-call chain and the microtask chain stop within one budget, the next command is served, and disable is delivered and completes, each red without the account. The decision record for the CPU window states the rule.

## Evidence

Filled at landing: what ran and where its output is.
