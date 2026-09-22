---
paths:
  - "packages/contracts/**"
  - "packages/kit/**"
---

# Contracts and kit

`kit` holds pure isomorphic primitives and engines: no `node:*`, no I/O, no domain code. `contracts`
holds cross-boundary wire shapes and depends only on `kit`. Both packages are isomorphic: no
`TextEncoder`, no `Buffer`. Compute a UTF-8 byte length by hand instead.

## contracts

- Before adding a cross-field zod `refine` that rejects a shape, check whether a `NOT NULL DEFAULT`
  column in `packages/db` can produce that shape. Derive or degrade the value instead of rejecting it.
- Derive a `.partial()` patch schema from an unrefined base schema, then re-check the refinement on the
  merged body at the verb. A refinement on the base schema blocks `.partial()`.
- Before dropping a key from a parsed config sub-blob, decide what its absence means. A field where
  absence means "inherit" can heal to absent; a mode or policy selector needs an explicit strip.
- Minting an `EVENT_TYPES` const in a `bus.ts` file is a live wire commitment: the bus coverage check and
  the client consumer map pick it up immediately.
- A chat-bus event field carrying free text is a closed string-literal union, never a raw `string`.
- A write-boundary check for a template token in `prose-slot` reuses the renderer's own matcher. Reset
  `lastIndex` on a cached global regex before a boolean test.
- In `versioned-config`, never `.catch()` a whole array to heal it. Heal element-wise and report the
  count; a whole-array catch hides one malformed row behind a false "intact".
- Before adding a view field to a wire type in `character/index.ts`, check it does not collide with an
  existing SillyTavern V2/V3 card field name.
- Widening a snake_case vocabulary used as Record or zod-schema keys touches every exhaustive consumer.
  Sweep consumers with `pnpm ast`, not grep alone.

## kit

- A sub-brand in `ids/index.ts` needs its own phantom symbol key. Intersecting two `Branded<>` aliases
  on the same key collapses to `never` and type-checks everywhere, wrongly.
- `cel/index.ts`: `parseCel` returns a value or an error and never throws; `evalCel` throws. The
  parse-time size cap is the whole runaway budget — do not add a runtime watchdog.
- `content/index.ts`: a scan or hold bound at a trust boundary must conceal or refuse on overflow, never
  release. Read both sides of a bound from one constant.
- `png-card-chunk/index.ts`: `DecompressionStream("deflate")` is zlib-wrapped (RFC 1950), not raw
  deflate. `kit` declares no DOM/node types, so declare minimal non-exported shapes locally. Never await
  the writer's `write`/`close` promise without a `.catch`.
- `tokens/**`: never delegate the context-window guard to the engine. `truncate_prompt_tokens:-1` on
  pooling models hangs unboundedly instead of failing fast; clamp client-side with the token estimator.
