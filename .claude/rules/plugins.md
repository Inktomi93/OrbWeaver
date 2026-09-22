---
paths:
  - packages/server/src/domain/plugin/**
  - packages/server/src/infra/plugin-host/**
  - packages/contracts/src/plugin/**
  - packages/showcase-plugins/**
---

# Plugins

## Sandbox boundary

- The plugin tool wire name has one mint: `pluginToolWireName` in
  `packages/contracts/src/plugin/registrations.ts`. Never re-derive it client-side. Test the
  hyphen-to-underscore transliteration.
- The client-guest proxy tuple in `packages/contracts/src/plugin/host-v1.ts` covers only
  server-owned data the guest lacks. Exclude host-mediated effects such as toast or openDialog.
- An id crossing the sandbox boundary stays a bare string under a line-adjacent foreign-id-ok
  marker. Branding it would claim a validation the boundary never performs.
- A verb that executes user-supplied code under the caller's principal takes no cross-owner admin
  branch. Judge a management verb by what it does, not what it reads.
- A capability whose reach is set by a manifest field can widen on upgrade with
  `granted_capabilities` unchanged. Enforce against what the owner consented to.
- A plugin tool handler has no stable room identity; it gets a fresh token per invocation. Key
  tool state per-install through `storage.kv`, never per-chat.
- A CAS write whose only consumer is a JSON blob gets garbage collected. Register it as a junction
  row the asset-refs enumeration sees, never a TTL.
- A byte counter built on `encodeURIComponent` throws on an unpaired UTF-16 surrogate. Count by
  code-point width, refuse `!isWellFormed()` input, and slice by code point.
- Adding a plugin UI node kind lands at every site named by `SurfaceLeaf`'s prop union
  (`plugin-leaf-nodes.tsx`) and `PLUGIN_FOOTER_NODE_KIND_ALLOWED` (`contracts/plugin/ui.ts`),
  including the SDK mirror `host-v1.d.ts`.
- A guest-facing subset of a shared union is a sibling subset tuple plus a derived type applied
  at every call site, never a runtime ternary. Resolve admission against the tuple.

## Host runtime (`infra/plugin-host`)

- Do not `eval` a JSON string across the marshalling boundary. Call the realm's own `JSON.parse`
  on a string value, with the function handle captured before guest code runs.
- Drain pending promises at dispose, before `ctx.dispose`, not only in settle handlers.
- Reconstruct a guest error's `name` and `message` via `ctx.newError`. Assert `e.name`, never a message substring.
- Guest bytecode also runs in the two post-settle job pumps. Bound the interrupt handler for the
  context lifetime, not per invocation, and dispose every `executePendingJobs` handle.
- A guest harness evaluates the shipped bundle in `node:vm` using the realm's exported
  `AMBIENT_STUBS` in `realm.ts`, never a hand-rolled stub set.

## `packages/showcase-plugins`

- A package holding authored guest `.js` needs its own `checkJs` tsconfig that includes the
  ambient host `.d.ts`, or the guest API can drift undetected.
