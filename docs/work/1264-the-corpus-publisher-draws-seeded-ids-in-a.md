---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: testkit
---

# The corpus publisher draws seeded ids in a nondeterministic order

## What

Two runs of `scripts/corpus-fixture.ts publish` from one tree differ in the `libraryRelations` roster-preset and tag ids and in the database bytes. Every run is a valid publication, but the committed fixture under `tests/support/node/corpus-data` cannot be reproduced byte for byte, so a reviewer cannot tell a schema-driven republish from an unrelated change, and no check can assert that the committed fixture matches the current publisher. The fixture also went stale silently when a contract gained a required field (the auth config's `uploads.importBundle`); every corpus-backed Node and CT case failed on main until a lane republished it by hand.

## Why

Spine-Testing requires seeded ids so fixtures are deterministic. A fixture that cannot be reproduced is a fixture nobody can verify, and a fixture that goes stale without a check turns every contract change into a hidden red.

## Done when

Two publishes from one tree are byte-identical (the library relation producers draw from the injected id source in a fixed order). A cheap check parses the committed fixture against the current published-corpus schema and fails with the name of the missing or extra field, so a contract change that needs a republish fails before merge; it runs with the Node tests. The publish command and the check are documented in the testkit README.

## Evidence

Filled at landing: what ran and where its output is.
