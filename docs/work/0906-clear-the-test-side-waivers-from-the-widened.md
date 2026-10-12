---
kind: work
status: doing
updated: 2026-10-12
priority: P2
area: tests
lane: wt/agent-a17cadbff65d8d346
plan: test-mirror
---

# Clear the test-side waivers from the widened type gates

## What

Burn down the @orb-waive markers item 900 placed in tests for no-inline-types (fixture shapes), testid-typed-only (CT stories), platform-spellings, no-loose-id-cast and no-vanity-alias. Fixture shapes derive from contracts or production types; story test ids come from the typed testid registry; platform strings use the platform constants; ids are minted through real builders, never cast; aliases are deleted in favour of the source type. Work by directory alongside 888, 891 and 894 where the same file is touched. Owner ruling: tRPC responder fixtures return the FULL contract output, built from the real test-data builders, never a subset; replace the TrpcFixture subset type in tests/support/node/route-trpc.ts and migrate its call sites directory by directory. Also type the recorder's count(proc) by procedure path so a misspelled procedure fails typecheck instead of counting zero. Also from the 891 verifier: type the /api/auth/config stub body in tests/client/features/chat/\_gallery-fixtures.ts against the config contract, and replace the hand-typed recorder shapes in worst-legal-art-contrast.suite.ct.tsx and suggestion-card-mount.ct.tsx with the typed recorder.

## Why

Tests that hand-spell types and ids do not follow product changes, which is the drift Spine-Testing section 10 forbids.

## Done when

No @orb-waive marker naming this item remains in tests for any of the five gates, TrpcFixture accepts only a full contract output, and count takes a typed procedure path.

## Evidence

Filled at landing: what ran and where its output is.
