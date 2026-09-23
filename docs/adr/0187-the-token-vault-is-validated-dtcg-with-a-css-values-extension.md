---
kind: adr
status: active
updated: 2026-09-23
---

# The token vault is validated DTCG with a CSS-values extension

## Context

Style Dictionary detects DTCG syntax and resolves references, but it does not validate the format. A DTCG color or shadow value is a structured object of concrete sub-values. A relative-color function over a generated custom property cannot take that shape. Examples are `oklch(from var(--color-sheen) l c h / 0.05)` and `color-mix()` over a runtime variable.

## Decision

`packages/ui/src/tokens/tokens.json` conforms to stable DTCG 2025.10. `packages/ui/token-contract.ts` validates it against the vendored official schemas plus Orb's semantic checks. The `tokens-contract` gate runs that validator. Style Dictionary only emits validated input through `packages/ui/tokens.build.ts`. A value that exists only in the CSS runtime lives in the `orb.cssValues` root extension as an owned, concrete CSS string. It never gets a custom `$type`. The placement rule is `docs/law/client-architecture-lockdown.md` §4.3.

## Consequences

A green token build means the vault meets the official format, not only that Style Dictionary could parse it. A new relative-color or runtime-variable value goes into `orb.cssValues`.

## Alternatives rejected

Use `@terrazzo/parser` as the conformance validator. It accepts a broader Terrazzo dialect: its own `string`, `boolean` and `link` types, non-DTCG dimension units and legacy color normalization. It adds a second parser without a stricter check. Replace Style Dictionary. Its type-directed transforms stay useful as an emitter once a validator guards the input. Add a custom `$type` for runtime CSS values. DTCG does not allow arbitrary types, so the vault would stop conforming.
