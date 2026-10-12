---
kind: plan
status: active
updated: 2026-10-12
---

# Tests on one harness and one code-facts engine

## Goal

Tests run the real product through one harness, and one code-facts engine serves codemods, `pnpm ast` and the verify gates. When the product changes, the tests and the gates change with it, because neither holds a second copy of the product or of the way code is read.

## Shape

### Order of work

1. **One code-facts engine.** Every reader of code lives once in `tooling/src/floor/code-facts/`. `pnpm ast` verbs, codemods and gates call it. A reader in `tooling/src/ast/lib/`, `tooling/src/codemod/lib/` or `tooling/src/verify/lib/` that answers the same question is deleted. Start with drizzle query facts (tables, joins, columns, reads and writes) and shape identity, then symbol references and member reads, import doors and reach, liveness, tRPC wiring, ambient calls and casts. Each move proves `pnpm ast` output and gate findings unchanged.
2. **The server test harness.** A test composition root in `@orb/testkit/node` builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, the inference provider edge, the plugin host and the network. Production exposes those seams at the composition root. Domain harnesses are deleted as their suites move onto the root. Runs in parallel with step 1.
3. **Builders and corpus.** One builder per contract output and database row, built from contract defaults or by running production. One synthetic corpus from the seed tool, shared by e2e, CT, server tests and side-eye.
4. **The client CT door.** CTs mount through the real client compose. A story isolates only through the named exception.
5. **The legacy ledger.** One shrink-only list names every test file not yet rebuilt. Ledger files run in CI and nightly only, not in commit hooks or lane floors. Gates judge every file outside the ledger at full strictness. A file leaves the ledger when its cases, the regression cases first, are ported onto the new harness and verified; then it is deleted.
6. **Rebuild.** The e2e smoke matrix on the corpus first, then server suites by domain on the composition root, then CTs on the door, then the rest.

### Rules

- Not yet built: the engine, the composition root, the builders and corpus, and the ledger.
- A rebuilt test calls production through a public entry, builds data through a builder, and carries no fake that stands in for domain logic.
- A ported suite keeps every case of the file it replaces; the verifier checks the case list.
- Retrofit work on fake-heavy server harnesses stops; those rows move to the rebuild.
- Each test layer answers its own question. e2e owns user flows and every wire: router, auth, streams, the database and the plugin host. CT owns component behaviour, rendered measurement and states a real backend does not produce on demand; a CT never mounts a route to walk a flow. Server integration tests own domain logic and permissions on the composition root. Unit tests own pure logic in `@orb/kit` and `@orb/contracts`.

## Rejected

Moving the tests out of the repository: it drops the regression net for the whole rebuild. Per-gate time budgets: gate cost is a design defect fixed by the shared engine, not a rule. Retrofitting fake-heavy server harnesses row by row: each row needs fixture repair and a fresh review.

## Coupled sites

The test-mirror plan: item 890 server harness rows move here, item 901 hosts the harness, items 887 and 898 feed the corpus and the smoke matrix, items 951 and 952 burn down against the ledger. `docs/law/Spine-Testing.md` sections 2 and 10, `docs/law/Core-0-Architecture-and-Structure.md` section 5, and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` section 4 for inner-loop membership.

## Test plan

Each engine move diffs `pnpm ast` output and gate findings before and after. Each ported suite shows the same case list and a production mutant that turns it red. The ledger gate refuses a new entry and a returning file.
