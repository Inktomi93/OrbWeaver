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

| Need | Entry point |
| - | - |
| Node tests, deterministic inputs and owned resources | [node/fixtures.ts](node/fixtures.ts) |
| Tool tests | [node/tool-fixtures.ts](node/tool-fixtures.ts) |
| Real server composition | [node/server.ts](node/server.ts) and [node/composed-real.ts](node/composed-real.ts) |
| Production-derived inputs | [node/factories](node/factories) and [node/corpus.ts](node/corpus.ts) |
| Client runtime and production providers | [browser/ct-data-providers.tsx](browser/ct-data-providers.tsx) |
| Corpus-backed component fixtures | [node/ct-corpus.ts](node/ct-corpus.ts) |
| Declared tRPC interception | [node/route-trpc.ts](node/route-trpc.ts) |

Import testkit through its `iso`, `node` or `browser` package subpaths. Inside testkit, use relative imports. Follow [the test layout and world rules](../../docs/law/Spine-Testing.md#2-the-tree).

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
| Declared package doors and helper-world import direction | Package exports, compiler programs and [dependency-cruiser](../../.dependency-cruiser.ts) |
| Story props and updated props | Explicit native `mount<typeof Story>` and [compiler assertions](browser/gallery.dom.test-d.ts) |
| Ordinary CT authoring uses typed mounts, browser JSX and type-only story imports | Native ESLint syntax restrictions in [eslint.config.js](../../eslint.config.js) |
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
