# Testkit authoring contract

Read this before adding tests, stories or test helpers. Testkit supplies production composition and controlled external execution, not replacement application logic.

[Spine-Testing](../../docs/law/Spine-Testing.md) owns testing policy. This guide identifies the authoring path and its enforcement. The [test-foundation plan](../../docs/plans/test-foundation/design.md) owns restoration decisions and remaining work.

## Choose the behavior and layer

Choose the least expensive layer that exercises the actual behavior. Use the plan's [layer ownership table](../../docs/plans/test-foundation/design.md#layer-ownership-and-overlap).

- Use unit and contract tests for pure calculations and boundary input permutations.
- Use server integration for authorization, persistence and business behavior through production composition.
- Use component tests for rendered states, interactions, accessibility and layout.
- Use E2E for journeys connecting the browser, authentication, transport and persistence.
- Keep overlapping coverage only when it catches a distinct failure.

Before restoring a reference case, consult the [restoration register](../../docs/plans/restoration-register/design.md). Compare assertions and record keep, rebuild, move or drop decisions in the existing work item. An unreviewed area is not evidence of missing coverage.

## Use the maintained entry points

Import testkit through the doors its `package.json` exports. A door is a barrel that names what tests may use; a helper a door does not export is internal to testkit.

| Door | Holds |
| - | - |
| `@orb/testkit/iso` | pure helpers every world may import: the frozen clock, seeded ids, corpus readers, wire shapes |
| `@orb/testkit/node` | the vitest `test` and `expect` with their fixtures; it registers fixtures at import, so only vitest files import it |
| `@orb/testkit/node/helpers` | Node-side helpers that never load the server graph at import; Playwright configs and scripts may import it |
| `@orb/testkit/node/composed` | the server harness, database, root seeds that run production verbs and return only ids and the verb's own outcome (never a row read back), read helpers that call production read verbs (`readRoomCanon`, `readAccounts`), corpus producers and chat composition; it loads the server graph |
| `@orb/testkit/node/auth` | sign-in through the product's login path for each auth mode: `createAuthModeRoot`, `forEachAuthMode`, `signIn` and the per-route steps under it; only vitest files import it |
| `@orb/testkit/node/rows` | direct row builders for persistence suites under `tests/db/` and `tests/**/persistence/`, including suites on a pre-migration schema where production verbs cannot run: `makeUser`, `seedUser`, `seedChatRow`, `seedCharacterRow` and `seedMessageRow`, the raw readers `captureSdkSessionRows`, `captureTurnRows`, `capturePluginRows` and `captureRpgSnapshot`, and the `factories/rows/` tier behind it: a `<seed>Rows` twin per door seed that also reads the rows its verb left, and per-domain captures; dependency-cruiser refuses every other importer. Composed suites mint users with `harness.actor`, which runs `sessions.ensureUser` and the owner's audited admin verbs, or `sessions.provisionIdentity` on an unclaimed root; the harness seeds its owner through boot's `seedOwner`, and fixtures read ids back from the root |
| `@orb/testkit/ct` | Playwright-side helpers for component specs: declared tRPC and socket interception, section navigation |
| `@orb/testkit/ct-corpus` | the Playwright `test` and `expect` that mount against a corpus-backed server |
| `@orb/testkit/browser` | production-backed providers, the registry door and isolation helpers a story mounts in the browser |
| `@orb/testkit/browser/spec` | Node-side helpers a component spec drives the page with: contrast and prose measurement, wire types |
| `@orb/testkit/tooling` | the vitest `test` and fixtures for tooling tests |
| `@orb/testkit/sdk` | what a spawned SDK stand-in process imports |

To publish a helper, add its name to the door's barrel. Inside testkit, use relative imports. Follow [the test layout and world rules](../../docs/law/Spine-Testing.md#2-the-tree).

Call production operations and registry factories. Derive inputs from their contracts, builders or corpus. Script external execution at its real boundary. Do not replace domain services, authorization, persistence or application modules with fabricated behavior.

## Sign in through the product

Use `@orb/testkit/node/auth` for any case that needs an authenticated request.

1. Build a root in one mode with `createAuthModeRoot(mode)`, or run the case under every mode with `forEachAuthMode(name, body)`.
2. Mint accounts with `mintMember(root)` and take the owner with `ownerSubject(root)`.
3. Call `signIn(root, who)`. It returns the request `headers`, the admitted `viewer` and the row-derived `principal`.
4. Send `headers` with every `root.http.request`.

`signIn` drives the mode's own login path and reads `sessions.me` back. A product refusal throws `SignInRefusal` with the HTTP status; `trySignIn` returns it instead.

| Mode | Login path |
| - | - |
| `single-user` | the owner's un-credentialed request from a loopback peer; a member gets the password route's answer |
| `local` | `POST /api/auth/login` with the account's password |
| `oidc` | the authorization-code flow against the scripted issuer; an unbound owner presents the boot claim code |
| `forward-header` | the proxy's signed JWT headers for the account |

Branch a case on the capability, never on the mode name. `AUTH_MODE_CAPABILITIES` in [node/auth.ts](node/auth.ts) is the table:

| Mode | `members` |
| - | - |
| `single-user` | false |
| `local` | true |
| `oidc` | true |
| `forward-header` | true |

`members` means a second account can sign in. `ownerFallback` reads the product's unset `AUTH_FALLBACK` default, `AUTH_MODE_DEFAULT_FALLBACK` in `@orb/server/foundation/env`, and every door root composes that default. Multiplayer surfaces also need the product's `app.multiHumanCapable()`, which `local` turns on only with the `localMultiUser` app setting.

## Turn a production env knob

A root composes over one parsed env record, built through the production parse. `ENV_SEAMS` in [node/env-seams.ts](node/env-seams.ts) gives every env schema key and every machine fact the parse reads one row. A root runs on a bare-metal test machine with a fixed name unless its `containerMarker` or `hostname` option says otherwise:

| Kind | The key | The door |
| - | - | - |
| `seam` | a harness option writes it into the record | the row's `option`: `env` for a raw value, else a named option such as `logLevel`, `bindHost` or `oidc` |
| `composed` | the harness derives it from the root itself | none; the row's `derivation` says how |
| `deploy-only` | no test root reaches it | none; the row's `reason` says why |

1. Find the key's row. Set a raw row with `createServerHarness({ env: { ["KEY"]: "value" } })`, and a named row through its option.
2. Read the result through the product. The record is the dependency production composes with, so a seam reaches the read the key reaches in production.
3. Put the auth posture in `env`. Use `authConfig` only for a pairing the parse refuses, such as `single-user` with `deny`. A corpus capsule and `createCorpusHarness` take the posture the same way; a resumed corpus root defaults to `local` with `deny`.

The `env` type takes only raw rows, so a key with a named option, a composed key or a deploy-only key fails to compile there. An untyped caller, such as a script a case evaluates, has the key refused when the root is built. A new schema key fails `tsc` until it has a row. Give it a raw row unless a named option already writes that concern.

## Author a component case

Follow the [native gallery contract](../../docs/law/Spine-Testing.md#7-client--browser-tests--native-playwright).

1. Put the browser composition in a named export of a `*-stories.tsx` module beside the test.
2. Mount client features through the existing production-backed providers. Name justified primitive or registry isolation explicitly for review.
3. Import the story with `import type` in the spec.
4. Call native `mount<typeof Story>(exactStoryId, dataProps)`. Keep callbacks and state inside the browser story.
5. Register network handlers and initialization scripts before mounting. Use configured `baseURL` before the first navigation.
6. Assert the rendered outcome using accessible locators and retrying web assertions.
7. Use `update()` for state-preserving prop changes. Await `unmount()` when proving disposal.

The gallery uses the application Vite pipeline, development React and StrictMode. It does not replace production build or E2E qualification.

Runnable examples:

- [Header rendering and prop updates](../client/components/list-pane-header.ct.tsx)
- [Production providers and cache lifetime](../client/compose/client-mount.ct.tsx)
- [Corpus-backed media and real blob reads](../client/features/chat/components/media-lifetime.ct.tsx)
- [Gallery startup and failure behavior](browser/gallery.ct.tsx)
- [Native mount and update type contracts](browser/gallery.dom.test-d.ts)

## Republish the corpus fixture

The committed synthetic corpus lives in `node/corpus-data`. Republish it when a contract it captures changes.

1. Run `pnpm exec node scripts/corpus-fixture.ts publish <new-directory>`. The directory must not exist.
2. Replace `node/corpus-data` with the published directory.

Two publishes from one tree are byte-identical: every producer draws ids from the injected id source in a fixed order. `node/corpus-fixture-schema.test.ts` parses the committed fixture against the current published-corpus schema with the Node tests and names each missing or extra field.

## What is enforced

| Contract | Enforcement |
| - | - |
| Tests import testkit only through its doors, and a kit module no door or kit test reaches is unused | The `exports` map in [package.json](package.json), knip (the `tests/support` entries derive from that map) and the `testkit-doors-only` rule in [dependency-cruiser](../../.dependency-cruiser.ts) |
| Helper-world import direction | Compiler programs and the world rules in [dependency-cruiser](../../.dependency-cruiser.ts) |
| Tests outside the persistence tier write rows only through verbs, root seeds and the sanctioned historic states | The `orb/no-direct-row-writes` rule in [eslint.config.ts](../../eslint.config.ts) judges each call site |
| Tests outside the persistence tier read only through production read verbs; a case whose subject is storage lives in the persistence tier | The `orb/no-direct-row-reads` rule in [eslint.config.ts](../../eslint.config.ts) judges each query builder, raw read and `db.query` access; inside `tests/support` only the files in its `ROW_READ_HOMES` list may read |
| No door seed or helper reads a row and hands it to a verb suite | Inside `tests/support` the `testkit-rows-closed-importers` rule in [dependency-cruiser](../../.dependency-cruiser.ts) admits only its `ROWS_IMPORTERS` list to the rows tier |
| A helper under a `persistence/` directory serves only its own tier | The `testkit-persistence-helpers-own-tier` rule in [dependency-cruiser](../../.dependency-cruiser.ts) |
| Integration files share one module registry and never read the environment at import | `isolate: false` and the `setupFiles` warm on the integration project in [vitest.config.ts](../../vitest.config.ts); the harness seams in [node/server.ts](node/server.ts) |
| A test never stubs or writes the process environment (`vi.stubEnv`, `process.env` writes); it uses a harness seam or the subject's own parameter | The `TEST_ENVIRONMENT_RESTRICTIONS` syntax rules in [eslint.config.ts](../../eslint.config.ts); `tests/tooling` is outside them because that project isolates modules |
| A root's env knob is a key in its own parsed record, refused where production refuses it | `createServerHarness({ env })` and `createTestEnv` ([node/env.ts](node/env.ts)), both through the production `parseEnv` |
| Every env schema key and machine fact has one row saying how a root reaches it, and `env` takes only raw rows | `ENV_SEAMS` is a `Record` over the schema's `EnvKey` and the parse's `HostFacts` in [node/env-seams.ts](node/env-seams.ts); [the class cases](node/env-seams.int.test.ts) and [type cases](node/env-seams.test-d.ts) |
| Story props and updated props | Explicit native `mount<typeof Story>` and [compiler assertions](browser/gallery.dom.test-d.ts) |
| Ordinary CT authoring uses typed mounts, browser JSX and type-only story imports | Native ESLint syntax restrictions in [eslint.config.ts](../../eslint.config.ts) |
| Inline callback props stay out of Node mount calls | The same ESLint restrictions; aliases and arbitrary dataflow remain review responsibilities |
| Recognized internal-module mocks and replacement service constructors are refused | Existing ESLint syntax and import restrictions |
| A test never calls `vi.mock` or `vi.doMock`; an external edge is scripted through an injected seam on the production options | `EXTERNAL_MODULE_MOCK_RESTRICTION` in [eslint.config.ts](../../eslint.config.ts); `tests/tooling` is outside it because that project isolates modules |
| Unknown stories and render failures do not become successful empty mounts | [Gallery runtime regressions](browser/gallery.ct.tsx) |
| Cold failures remain failures | Native runner configuration and first-navigation regression checks; no automatic warm-up navigation or test retries |

Explicit story types do not type-check the story ID string. Unknown IDs fail at runtime. Do not describe syntax checks as complete semantic proof.

## Sanctioned historic states

The row-write lint judges call sites, so a state the product can no longer produce has one enumerated home in `node/factories/`. Each home cites the ruling or migration that makes the state real. Add a home here only with that citation.

| Home | State | Why it is real |
| - | - | - |
| `damageOwnerRow` | an owner row below `owner`, or disabled | D135 and D218 rule that every Principal path reads it and fails closed |
| `plantLegacyZeroCanon` | imported canon numbered from seq 0 | launched databases held it until migration `0005_renumber-imported-canon` |
| `plantForeignRoomBackground`, `plantForeignCardBackground`, `plantForeignSettingsValue`, `plantForeignSettingsBytes` | a stored reference another build wrote | a database shared across versions holds kinds and encodings this build never writes |

## What review must establish

- The selected behavior matters and belongs at this layer.
- The case reaches production rather than a copied implementation or fabricated collaborator.
- Assertions catch the stated defect instead of confirming only fixture data or an array length.
- A refusal or absence assertion has a valid positive control or completed operation.
- Owned databases, processes, routes, requests and browser resources are released, including after failure.
- Reference cases have supported dispositions; unresolved cases remain explicit.

Reviewers compare selected original cases with the maintained assertions, not only the new diff. Follow the plan's [implementation and review briefs](../../docs/plans/test-foundation/design.md#implementation-and-review-briefs).

## Run and report

Use `pnpm test <paths>`, `pnpm test:ct <paths>` or the relevant native E2E command. Tooling CTs use the `tooling` project in `playwright-ct.config.ts`.

Run affected compiler programs, lint and dependency checks. Reuse matching completed results; do not repeat unchanged checks merely for confidence.

Read the completed output. A timeout, tool error or failed cold start supplies no passing verdict. Preserve first-failure artifacts and fix the cause. Do not raise limits, weaken assertions, suppress real findings or rerun warm to claim success.

Report the covered behavior, checks, remaining gaps and limitations. Passing a selected batch does not complete the wider restoration plan.
