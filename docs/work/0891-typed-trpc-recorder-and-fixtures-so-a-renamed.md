---
kind: bug
status: doing
updated: 2026-10-11
priority: P1
area: tests
lane: wt/agent-a4921ce2765012dfa
plan: test-mirror
---

# Typed tRPC recorder and fixtures so a renamed field turns tests red

## What

tests/support/node/route-trpc.ts lastInput and inputs return unknown for a string proc, so 184 client sites cast to hand-written shapes and none uses TrpcInput; a lastPatch helper is copied across many files; TrpcFixture accepts any non-empty subset of a wire object so a new required field never reds; twelve auth/me stubs and the upload caps stub are untyped JSON. Type lastInput and inputs by procedure, add typed stubAuthMe and caps helpers, and decide the subset rule per fixture.

## Why

Hand casts and subset fixtures mean contract changes compile and pass, which is the drift the owner found.

## Done when

lastInput<P>(p) returns TrpcInput<P>; the hand casts and the 19 lastPatch copies are gone; auth and caps stubs are typed; a planted rename in a procedure input turns its CTs red; the lazy casts listed in the audit inventories are fixed.

## Evidence

Filled at landing: what ran and where its output is.
