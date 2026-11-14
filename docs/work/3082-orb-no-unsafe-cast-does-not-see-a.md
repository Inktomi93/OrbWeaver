---
kind: tooling
status: open
updated: 2026-11-14
priority: P2
area: tooling
plan: typed-enforcers
---

# orb/no-unsafe-cast does not see a brand built by a predicate, an assertion function, an overload, z.custom or a generic cast

## What

Outside every mint home, each of these builds any brand (proved with `ConsentingHostId`) with zero lint and zero type errors: `(u: UserId): u is ConsentingHostId => true`; `function f(u: UserId): asserts u is ConsentingHostId {}`; an overload `function f(u: UserId): ConsentingHostId; function f(u: UserId): UserId { return u; }`; `z.custom<ConsentingHostId>().parse(raw)`; and `function launder<T>(x: unknown, fallback: T): T { return (x ?? fallback) as T; }`. `tooling/src/eslint/unsafe-cast.ts` visits only `TSAsExpression` and `castId` calls.

## Why

A brand that the compiler is meant to require can be produced by a construct no checker reads, and the law line in `docs/law/Spine-Identity-and-Auth.md` §2c names only the predicate.

## Done when

`orb/no-unsafe-cast` also refuses, outside a home: a type predicate or assertion predicate whose brand the parameter's non-null declared type does not already satisfy; a `z.custom<T>` call whose `T` is a brand; an overload whose brand return the implementation's declared return does not satisfy; and an `as T` from an untyped operand to a type parameter. The existing `z.custom` brand sites in `packages/contracts/src/chat/handoff-context.ts` and `packages/contracts/src/chat/messages.ts` move to `brandedId` or become homes with a reason. A rule test plants each form and sees it refused. The §2c sentence names what stays outside the checker, if anything.

## Evidence

Filled at landing: what ran and where its output is.
