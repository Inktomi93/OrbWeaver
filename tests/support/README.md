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

Before restoring a reference case, consult the [restoration register](../../docs/plans/test-foundation/design.md#restoration-register). Compare assertions and record keep, rebuild, move or drop decisions in the existing work item. An unreviewed area is not evidence of missing coverage.

## Use the maintained entry points

Import testkit through the doors its `package.json` exports. A door is a barrel that names what tests may use; a helper a door does not export is internal to testkit.

| Door | Holds |
| - | - |
| `@orb/testkit/iso` | pure helpers every world may import: the frozen clock, seeded ids, corpus readers, wire shapes |
| `@orb/testkit/node` | the vitest `test` and `expect` with their fixtures; it registers fixtures at import, so only vitest files import it |
| `@orb/testkit/node/helpers` | Node-side helpers that never load the server graph at import; Playwright configs and scripts may import it |
| `@orb/testkit/node/composed` | the server harness, database, factories, corpus producers and chat composition; it loads the server graph |
| `@orb/testkit/ct` | Playwright-side helpers for component specs: declared tRPC and socket interception, section navigation |
| `@orb/testkit/ct-corpus` | the Playwright `test` and `expect` that mount against a corpus-backed server |
| `@orb/testkit/browser` | production-backed providers, the registry door and isolation helpers a story mounts in the browser |
| `@orb/testkit/browser/spec` | Node-side helpers a component spec drives the page with: contrast and prose measurement, wire types |
| `@orb/testkit/tooling` | the vitest `test` and fixtures for tooling tests |
| `@orb/testkit/sdk` | what a spawned SDK stand-in process imports |

To publish a helper, add its name to the door's barrel. Inside testkit, use relative imports. Follow [the test layout and world rules](../../docs/law/Spine-Testing.md#2-the-tree).

Call production operations and registry factories. Derive inputs from their contracts, builders or corpus. Script external execution at its real boundary. Do not replace domain services, authorization, persistence or application modules with fabricated behavior.

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

## What is enforced

| Contract | Enforcement |
| - | - |
| Tests import testkit only through its doors, and a kit module no door or kit test reaches is unused | The `exports` map in [package.json](package.json), knip (the `tests/support` entries derive from that map) and the `testkit-doors-only` rule in [dependency-cruiser](../../.dependency-cruiser.ts) |
| Helper-world import direction | Compiler programs and the world rules in [dependency-cruiser](../../.dependency-cruiser.ts) |
| Integration files share one module registry and never read the environment at import | `isolate: false` and the `setupFiles` warm on the integration project in [vitest.config.ts](../../vitest.config.ts); the harness seams in [node/server.ts](node/server.ts) |
| Story props and updated props | Explicit native `mount<typeof Story>` and [compiler assertions](browser/gallery.dom.test-d.ts) |
| Ordinary CT authoring uses typed mounts, browser JSX and type-only story imports | Native ESLint syntax restrictions in [eslint.config.ts](../../eslint.config.ts) |
| Inline callback props stay out of Node mount calls | The same ESLint restrictions; aliases and arbitrary dataflow remain review responsibilities |
| Recognized internal-module mocks and replacement service constructors are refused | Existing ESLint syntax and import restrictions |
| Unknown stories and render failures do not become successful empty mounts | [Gallery runtime regressions](browser/gallery.ct.tsx) |
| Cold failures remain failures | Native runner configuration and first-navigation regression checks; no automatic warm-up navigation or test retries |

Explicit story types do not type-check the story ID string. Unknown IDs fail at runtime. Do not describe syntax checks as complete semantic proof.

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
