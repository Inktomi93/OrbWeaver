---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: security
plan: checked-law
---

# Lint rules keep raw engine string calls and argument coercion inside the plugin marshal

## What

The plugin boundary work established two rules by review alone. A string crosses the boundary only through the one marshal, never through the engine binding's own string read or write, which cut at a NUL. A host function never coerces a guest argument with String or a template; it takes it through the membrane's string intake. The plugin host already has one rule of this kind: orb/plugin-dump-guard (tooling/src/eslint/security-policy.ts) refuses a dump of a guest handle outside the membrane's guarded helper and before its guard. The marshal change moved every guest value's intake, and a promise handed to the host still made a dump dispose a live handle before that change, so the guard's selectors and helper name need re-reading against the membrane as it is now.

## Why

Each of these was the door a size or NUL check was bypassed through. The next host function added to the membrane is written by an author who has not read the security reviews.

## Done when

The dump guard's selectors are checked against the current membrane and marshal and corrected where the intake moved, with its planted cases still red. The same rule family gains two entries scoped to packages/server/src/infra/plugin-host: the binding's string calls are refused outside the marshal file, and a String call on an argument array element is refused outside the intake helper, each with a planted test. The remaining raw string reads the security review listed are routed through the marshal or removed first, so the entries land at zero.

## Evidence

Filled at landing: what ran and where its output is.
