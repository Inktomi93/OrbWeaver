---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: security
---

# The plugin membrane caps registrations, checks handler types and refuses ungranted calls before any work, and the app side rechecks size and spend caps

## What

In packages/server/src/infra/plugin-host/membrane.ts: tools.register, registerCommand and ui.register have no per-plugin count or description size cap; an ungranted async call pays the argument dump, the budget walk and an in-flight slot before its capability check; events.on, pubsub.on and the tools.register handler store a non-function; and the dump-depth pre-walk and ctx.dump can see different trees through a Proxy or stateful getter. App side, bridge-rpc.ts and verbs/quiet-llm.ts accept an llm.quiet prompt of any length and a search.documents limit of any finite number, though the plugin README says the app rechecks the original grant.

## Why

Each is a bound or refusal the host promises that only the Worker enforces, or enforces after it has already spent the work.

## Done when

Each named cap and type check holds at the membrane with a case, an ungranted async call rejects before any dump or slot, the dump-depth check cannot be raced by a getter (a case with a Proxy that deepens on the second walk), and the app-side re-authorization enforces the quiet prompt cap and the search limit with a case each.

## Evidence

Filled at landing: what ran and where its output is.
