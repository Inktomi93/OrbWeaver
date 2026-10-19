---
kind: decision
status: open
updated: 2026-10-19
priority: P3
area: tests
plan: test-foundation
---

# Adjudicate legacy Principal construction against the rebuilt suites

## What

The testkit principal factory resolves the stored role through the production row resolver and takes a harness root, while legacy support wrappers call it with role and handle overrides that no longer exist. About 4,581 legacy call sites and about 20 wrappers depend on that shape, and pure unit legacy files have no database to resolve against.

## Why

A scripted rewrite would change what override-based legacy cases prove and is the legacy retrofit the rebuild direction rules out; leaving them red loses that regression coverage.

## Done when

A ruling records, per legacy domain, whether its cases are rebuilt in the maintained suites or migrated to the resolver, and the ruled work is filed.

## Evidence

The root typecheck is green after 1119, but these call sites type-check and still fail at runtime. The 1119 leg saw tests/legacy/server/domain/connection/_support.ts line 185 (`root.principalFor is not a function`, reached by the embeddings binding-race support), and tests/legacy/inference/resolve/resolve-task.suite.test.ts, index.test.ts, role-clients.suite.test.ts and tests/legacy/server/entry/compose/embedding-connection.test.ts lines 24 and 53, which call the one-argument form and read `.userId` off a Promise. The embeddings and search harnesses now use `createHostPrincipalResolver(createLoadUserById({ db }))`, as target-move-rebuild.suite.int.test.ts does.
