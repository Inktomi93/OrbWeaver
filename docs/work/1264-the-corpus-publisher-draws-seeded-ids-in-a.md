---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: testkit
---

# The corpus publisher draws seeded ids in a nondeterministic order

## What

Two runs of `scripts/corpus-fixture.ts publish` from one tree differ in the `libraryRelations` roster-preset and tag ids, in the character, asset and plugin ids, and in the database bytes. The cause is first-login seeding concurrency, not the library producers: each signed-in user started three concurrent seeders (`packages/server/src/entry/http/app.ts`), the showcase seeder installed its slugs concurrently (`domain/plugin/seeder/showcase.ts`), and two users' seeding overlapped, all drawing from the one injected id source. Every run is a valid publication, but the committed fixture under `tests/support/node/corpus-data` cannot be reproduced byte for byte, so a reviewer cannot tell a schema-driven republish from an unrelated change, and no check can assert that the committed fixture matches the current publisher. The fixture also went stale silently when a contract gained a required field (the auth config's `uploads.importBundle`); every corpus-backed Node and CT case failed on main until a lane republished it by hand.

## Why

Spine-Testing requires seeded ids so fixtures are deterministic. A fixture that cannot be reproduced is a fixture nobody can verify, and a fixture that goes stale without a check turns every contract change into a hidden red.

## Done when

Two publishes from one tree are byte-identical (the library relation producers draw from the injected id source in a fixed order). A cheap check parses the committed fixture against the current published-corpus schema and fails with the name of the missing or extra field, so a contract change that needs a republish fails before merge; it runs with the Node tests. The publish command and the check are documented in the testkit README.

## Evidence

- First-login seeding runs as one queue for the process: each user's seeders run in order (backgrounds, content, example plugins, distributed plugins), each step with its own span and failure report, and the showcase slugs install one at a time with every later slug still attempted after a failure. The chain stays background and the completeness latch is unchanged.
- A mint-stack probe over two full capsule captures diverged at seeded id 58 before the change, at 20 of 8728 mints with per-user ordering only, and at none with the process queue.
- Two `pnpm exec node scripts/corpus-fixture.ts publish` runs from the final tree: `diff -rq` reports no difference, and `cmp` passes on `corpus.json`, `db/orbweaver.db` and `replay.json`.
- `tests/support/node/corpus-fixture-schema.test.ts` parses the committed fixture with the Node tests and names each failing field. Against the fixture before the `uploads.importBundle` republish it reports `auth.anonymousConfig.uploads.importBundle` and four sibling paths.
- First-login seed suites pass: `seed-consent`, `showcase-provenance`, `settings/seeder/content`.
- The committed fixture was not republished; its next republish is the first reproducible one.
