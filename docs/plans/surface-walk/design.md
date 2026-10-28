---
kind: plan
status: active
updated: 2026-10-28
---

# Automated product surface review

## Goal

Run repeatable production-backed surface journeys and retain complete local evidence without repeated model-driven navigation.

## Shape

Use native Playwright projects and shared journeys with separate measurement and evidence passes. Select synthetic or owner-clone data explicitly and reuse existing testkit composition, collectors and production navigation.

## Rejected

No copied application, approval baselines, blanket exclusions, synthetic data mislabeled as owner data, unsupported metrics recorded as zero, or replacement verification framework.

## Coupled sites

Playwright and testkit; axe and web-vitals; shell pane capabilities; plugin inventory; local artifact custody; existing surface consistency work.

## Test plan

Prove real defects and healthy controls, framework state handling, privacy boundaries, measurement lifecycle and actual end-to-end journeys before independent review.

## Data and privacy

Require an explicit synthetic or owner data selection.

Synthetic mode creates disposable data through production builders. Owner mode copies the selected database and assets without synthetic augmentation.

Never modify the original owner source. Reconcile the copied subject and plugin inventory before claiming owner coverage.

Keep generated datasets and all evidence outside the checkout in a private run directory. This includes synthetic evidence, screenshots, traces, accessibility snippets and logs.

Do not commit generated data or upload walkthrough artifacts to GitHub or external services. Track only implementation, configuration and documentation.

Make the command local and opt-in. Exclude its artifact-producing journeys from ordinary CI collection and refuse invocation in CI.

## Coverage

Derive section and mode vocabulary from production. Use named independent journeys, not blind clicking or copied navigation registries.

Cover the agreed major sections and primary Characters and Chat workflows, including their tabs, menus, group controls and plugin contributions.

For each applicable desktop section, cover content alone, List with content, content with Context, and all regions together.

For mobile, exercise the actual screen and sheet model in portrait and landscape. Do not force desktop docking onto the mobile shell.

Record requested pane preferences and actual resolved topology, including effective content width. Mark unsupported pane capabilities not applicable.

Exercise explicit defaults and relevant enlarged-text profiles. Expand chat mode coverage without multiplying unrelated settings journeys across chat styles.

Record visited, failed, skipped and unvisited states. Hidden retained content is not visited coverage.

## Framework-aware checks

Qualify checks against real Base UI components, including hidden inputs, portals, open and closed overlays, keyboard focus and coarse-pointer interaction.

Prove Suspense pending and resolved states. Require actual subject witnesses before accepting a loaded checkpoint.

Prove Activity hidden and visible states. Exclude legitimately unrendered content from visual judgments while retaining visible orphaned portals as findings.

Use precise detector applicability, not blanket exclusions or disabled accessibility rules. Retain incomplete and untested frame evidence.

Qualify the selected standards profile against installed rule metadata, including relevant rules disabled by default.

## Measurement and evidence

Run separate measurement and evidence passes through the same journey definitions.

The measurement pass disables tracing, video and audits. Measure actual post-action readiness inside the action window.

The evidence pass retains full accessibility results, geometry, overflow, touch, focus, console and network findings, screenshots and native reports.

Install vendor observers once per document. Keep document Core Web Vitals separate from checkpoint and application-specific shift measurements.

Preserve meaningful native entry fields and useful privacy-safe attribution. Record unsupported, unreported, incomplete and measured states distinctly.

Use genuine lifecycle events and truthful finalization status. Do not simulate visibility events or subtract cumulative metrics to invent checkpoint scores.

Map every retained design and motion check to its observable and maintained replacement before changing detector ownership.

Keep React profiling diagnostics separate from uninstrumented performance evidence. Reuse existing instrumentation before adding another collector.

Do not relabel application reset-scoped shift sums as standard CLS.

Keep aesthetic judgment separate from automated conformance. Provide a consolidated local comparison index for the remaining human review.

## Acceptance

Complete the relevant vendor configuration and API reading and verify the installed interfaces before use.

Prove defects and healthy behavior through native controls, including framework states, metric collection, window boundaries and privacy refusal.

Run real journeys in both data modes and the declared browser, device and pane matrix. Preserve first-run failures and precise exclusions.

Complete applicable compiler, lint, dependency and browser checks. Obtain independent review and document the local command and report locations.

Keep existing unfinished UI work and discovered product defects on their governed items. This workflow does not silently close them.
