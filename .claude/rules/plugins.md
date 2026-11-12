---
paths:
  - packages/server/src/domain/plugin/**
  - packages/server/src/infra/plugin-host/**
  - packages/contracts/src/plugin/**
  - packages/showcase-plugins/**
  - packages/plugin-sdk/**
  - packages/plugin-toolchain/**
---

# Plugins

## Sandbox boundary

- The plugin tool wire name has one mint: `pluginToolWireName` in
  `packages/contracts/src/plugin/registrations.ts`. Never re-derive it client-side. Test the
  hyphen-to-underscore transliteration.
- The client-guest proxy tuple in `packages/contracts/src/plugin/host-v1.ts` covers only
  server-owned data the guest lacks. Exclude host-mediated effects such as toast or openDialog.
- Type an id that crosses the sandbox boundary as `SandboxWireId<Brand>` from `@orb/kit/ids`.
  It stays a bare string, because a brand would claim a validation the boundary never performs.
  `orb/sandbox-wire-id` refuses a bare `string` at an id position in `packages/contracts/src/plugin/`.
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
  (`plugin-leaf-nodes.tsx`) and `PLUGIN_FOOTER_NODE_KIND_ALLOWED` (`packages/contracts/src/plugin/ui.ts`),
  including `packages/plugin-sdk/shared.d.ts`.
- A guest-facing subset of a shared union is a sibling subset tuple plus a derived type applied
  at every call site, never a runtime ternary. Resolve admission against the tuple.

## Host runtime (`infra/plugin-host`)

- Do not `eval` a JSON string across the marshalling boundary. Call the realm's own `JSON.parse`
  on a string value, with the function handle captured before guest code runs.
- Drain pending promises at dispose, before `ctx.dispose`, not only in settle handlers.
- Build a host error for the guest with the marshal's `newHostError`: an object on the realm's `Error.prototype` plus `defineProp`. Never `ctx.newError`, whose stack capture runs the guest's `Error.prepareStackTrace` and whose field form runs a guest setter. Assert `e.name`, never a message substring.
- Settle a guest value through the marshal's `settlementOf`, never `ctx.resolvePromise`, which reads the guest's global `Promise`.
- Build every host function with the marshal's `newHostFunction`, which ends a guest past its CPU window before any read (D346). Never coerce a guest value with `getString` or `getNumber`, which run its `toString` or `valueOf`; read it through the marshal, or refuse a non-primitive.
- Guest bytecode also runs in the two post-settle job pumps. Bound the interrupt handler for the
  context lifetime, not per invocation, and dispose every `executePendingJobs` handle.
- Call into the realm from host code only inside a span: `runToSettlement`, `pumpGuestJobs` or `withinCpuWindow`. A resolve reads a guest `then` getter, and between spans the window reads as passed (D346).
- Inside a host function, read a guest property with the marshal's `readGuestProp` and set one on a host-made object with `setHostProp`. Each checks the window first, because the binding drops a callback's interrupt.
- A guest harness evaluates the shipped bundle in `node:vm` using the realm's exported
  `AMBIENT_STUBS` in `realm.ts`, never a hand-rolled stub set.

## `packages/showcase-plugins`

- Check authored guest `.ts` against its runtime-specific `@orb/plugin-sdk` entry and keep emitted `.js`
  byte-current before packing, so installed behavior matches checked source.
