---
kind: plan
status: active
updated: 2026-11-06
rank: 2
---

# Automated product surface review

## Goal

Run repeatable production-backed surface journeys and retain complete local evidence without repeated model-driven navigation.

## Shape

Use native Playwright projects and shared journeys with separate measurement and evidence passes. Select synthetic or owner-clone data explicitly and reuse existing testkit composition, collectors and production navigation.

This plan runs beside [cross-surface consistency](../cross-surface-consistency/design.md) and supplies the repeatable collection its acceptance scores.

## Rejected

No copied application, approval baselines, blanket exclusions, synthetic data mislabeled as owner data, unsupported metrics recorded as zero, or replacement verification framework.

## Coupled sites

Playwright and testkit; axe and web-vitals; shell pane capabilities; plugin inventory; local artifact custody; existing surface consistency work.

## Test plan

Prove real defects and healthy controls, framework state handling, privacy boundaries, measurement lifecycle and actual end-to-end journeys before independent review.

## Data and privacy

Require an explicit synthetic or owner data selection.

Synthetic mode creates disposable data through production builders. Owner mode uses a one-time consistent snapshot of the current Orb database, assets, completed embeddings and retained plugin setup without synthetic augmentation. Repeated review reuses that admitted outside-Git source snapshot and creates a fresh disposable per-walk clone. It does not reimport, recompute embeddings, or reuse a previously mutated test database. SillyTavern intake is an alternative through the existing importer, not a second importer or the default. The exact reusable intake mechanism remains subject to source qualification.

Never modify the original owner source. Reconcile the copied subject and plugin inventory before claiming owner coverage.

Keep generated datasets and all evidence outside the checkout in a private run directory. This includes synthetic evidence, screenshots, traces, accessibility snippets and logs.

Do not commit generated data or upload walkthrough artifacts to GitHub or external services. Track only implementation, configuration and documentation.

Make the command local and opt-in. Exclude its artifact-producing journeys from ordinary CI collection and refuse invocation in CI.

## Coverage

Derive section and mode vocabulary from production. Use named independent journeys, not blind clicking or copied navigation registries.

Inventory expected categories, tabs, panels, disclosures, menus and nested scroll regions from production registries and actual rendered surfaces. A newly registered entry without a substantive witnessed disposition fails coverage. Landing on a rail or opening a dialog does not establish its content or submitted action. Preserve expected, visited, failed, skipped and unvisited entries with explicit reasons; hidden retained content is not coverage.

Cover the agreed major sections and primary Characters and Chat workflows, including their tabs, menus, group controls and plugin contributions.

For each applicable desktop section, cover content alone, List with content, content with Context, and all regions together.

For mobile, exercise the actual screen and sheet model in portrait and landscape. Do not force desktop docking onto the mobile shell.

Record requested pane preferences and actual resolved topology, including effective content width. Mark unsupported pane capabilities not applicable.

Exercise explicit defaults and relevant enlarged-text profiles. Expand chat mode coverage without multiplying unrelated settings journeys across chat styles.

The `-text200` and `-text300` projects set the browser's default font size to 200% and 300% before the first navigation. The appearance setting stays at its default, because its range stops at `FONT_SCALE.max`. Each checkpoint asserts the resulting root font size and records the enlarged-text geometry findings of its scope. Media-query `rem` follows the browser size, so the 1440 desktop resolves the mobile shell at 200%. The topology attachment records that resolved regime, and the flow does not force desktop docking onto it. WebKit has no enlarged-text project: it exposes no browser text-size setting to the runner.

Record visited, failed, skipped and unvisited states. Hidden retained content is not visited coverage.

Compare cross-section controls only when their semantic role, declared density and resolved container width match. Derive containment and scroll ownership assertions from production layout contracts. This consistency coverage is not yet qualified across the matrix.

Run the existing public design-audit engine last in evidence checkpoints.
Compare governed tier and variant values against their browser-resolved tokens, not another section's screenshot.
Keep sibling geometry cohorts within one containing parent and the same authored component, variant, density and tier claims.
Retain each cohort member's box and two pixel fingerprints: its outermost one-pixel edge band and the fill band just inside it. Read both bands on the pixel-snapped box, leaving out the rounded corners. An edge within two levels per channel of the band outside the box reads as the parent's backdrop, so transparent members over chat art still match. A fill within two levels of the edge reads as the edge. Group the remaining colours per cohort within the same two levels, and compare resting members on both bands with the comparison ui-facts uses for source cohorts. Fail a cohort whose majority has outliers in either band. Record these members as incomplete, not as a match:

- a member in another interaction state, or with a selected or current descendant;
- a member outside the viewport;
- a member with a band that is not one colour.

Retain original samples, findings, population accounting and incomplete-evidence details in native files and step parameters.
Resolve pending backdrops through the public pixel pass before judging samples. Retain original samples, resolved samples and sampling refusals.
Keep unresolved populations incomplete rather than presenting them as product defects or clean results.
These checks provide automated token, hierarchy and containment evidence. They do not establish complete aesthetic consistency.

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
It also runs the existing public class-token hygiene scan after timing collection.
Retain its complete CSSOM census and fail dead tokens, used empty rules, and unreadable stylesheets.
This scan does not prove selector matching, cascade correctness, or whole-application unused CSS.

Install vendor observers once per document. Keep document Core Web Vitals separate from checkpoint and application-specific shift measurements.

Preserve meaningful native entry fields and useful privacy-safe attribution. Record unsupported, unreported, incomplete and measured states distinctly.

Use genuine lifecycle events and truthful finalization status. Do not simulate visibility events or subtract cumulative metrics to invent checkpoint scores.

Map every retained design and motion check to its observable and maintained replacement before changing detector ownership.

Keep React profiling diagnostics separate from uninstrumented performance evidence. Reuse existing instrumentation before adding another collector.

Do not relabel application reset-scoped shift sums as standard CLS.

Keep aesthetic judgment separate from automated conformance. Agents read the native results through a local Markdown entry and complete-case routing files. Native HTML remains optional visual evidence.

## Acceptance

Complete the relevant vendor configuration and API reading and verify the installed interfaces before use.

Prove defects and healthy behavior through native controls, including framework states, metric collection, window boundaries and privacy refusal.

Run real journeys in both data modes and the declared browser, device and pane matrix. Preserve first-run failures and precise exclusions.

Complete applicable compiler, lint, dependency and browser checks. Obtain independent review and document the local command and report locations.

Keep existing unfinished UI work and discovered product defects on their governed items. This workflow does not silently close them.

## Local commands

Run the synthetic walkthrough with `pnpm e2e:surface --data=synthetic --auth=local`.
Run framework controls with `pnpm e2e:surface:controls`.
Pass native selectors after `--`, for example `-- --project=desktop-1440-all-panes-evidence`.
Use native `--global-timeout=<milliseconds>` for an explicitly larger or smaller execution budget.
The outer process deadline follows that exact native budget and adds only its cleanup reserve.
The launcher refuses unlimited, repeated or invalid timeout overrides because they cannot own bounded cleanup.

Owner data requires a consistent admitted local snapshot. The native surface workflow uses the production-composed sandbox and controlled external provider/SDK boundaries; it does not claim host-wide network isolation. The existing `corpus-fixture private`/matrix workflow retains its separately governed namespace boundary unchanged.
Use `pnpm e2e:surface --data=owner --owner-data=<snapshot> --auth=single-user`.
The original snapshot remains source; the command writes only its disposable copy.
Owner snapshot intake and custody must be qualified per operating system before that mode is accepted there.

The default private parent is the user's local state directory under `.local/state/orbweaver/surface-walk`.
Use `--private-root=<directory>` to select an existing private parent.
The command prints its outcome, external run directory, `agent-entry.md` path and exact optional detail-reader command.
Read `agent-entry.md` first. It retains native errors, locations, metric annotations and explicit coverage omissions without inferred diagnoses.
Use final native errors for failure summaries. Retain transient step errors in complete step events without labeling them final failures.
Use the printed complete-case command for all native result fields, attachment paths and step-event routing.
The reader prints the complete selected text artifact. Encoded path arguments avoid shell-dependent quoting.
Startup failures retain an entry after private run allocation, even before native collection.
Completed native step events and case results remain readable if final native reporters cannot finish.
The command retains its latest-run pointer in the private parent.
Native logs, screenshots, traces, configuration, credentials, and provenance remain within the private run directory.

## Development loop

Develop a journey one case at a time on a measurement project.

1. Select one case with `-- --project=<project> -g "<describe> <title>$"`. Each case in `agent-entry.md` prints its exact selector.
2. Use the `-measurement` twin of a project while you develop. It runs the same journey without axe, the design census, the touch sweep, screenshots or traces.
3. Run the `-evidence` project for a surface once its journeys pass.

The launcher reuses the production client build while the source state of `packages/` and the root build files is unchanged. It keys the build on the git blob ids of the current working-tree bytes, keeps only the current build under the private parent's `client-builds/`, and refuses to cache a build whose inputs changed while it ran. Journey and testkit edits reuse the build.

A one-case measurement run takes about 45 seconds. The synthetic dataset production and the native case each take about 20 seconds of it. The showcase bundle build takes about 2 seconds and has no reuse.

The per-surface journey status and the driver triage live in [work item 1401](../../work/1401-build-and-qualify-the-native-automated-surface-walkthrough.md#surface-status).

## Journey authoring method

Coverage comes from the generic walker: tab bodies, disclosures, menus, scroll windows and the unvisited-control inventory over production registries and rendered controls.

Write bespoke driver code only for an action with an outcome to assert: create, rename, delete, run, generate, or persist across a reload. A control that a journey only opens or navigates gets no bespoke function.

1. Read the surface's unvisited and failed rows in the walk's own inventory first.
2. Where the inventory does not name a control or its success signal, read Snap's machine output: `pnpm snap <route> --map` for the control map and `pnpm snap --report latest` for the run index. Do not review screenshots to find controls.
3. Write the journey for the actions with outcomes.
4. Iterate with one-case measurement runs until the journey passes.
5. Run the evidence project once for the surface.
6. Group the evidence findings by rule for each surface. Board one item per rule per surface. Do not gate journey work on evidence findings.

## Generic walker

`tests/e2e/support/surface-walker.ts` owns one case's coverage and the generic traversal.

- Create a `SurfaceWalk` with `createSurfaceWalk`, record with `expectSubject`, `observe` and `skip`, and end with `publishWalk`.
- Use `recordAs` when one id is expected under two kinds; `observe` files the outcome under the first kind expected for the id.
- Call `walkScope` on any rendered scope. It walks disclosures, tabs, selects, menus, `aria-haspopup="dialog"` doors, scroll windows and the control census.
- Call `walkDoor` for a body opened by a plain button. Pass its trigger, body and exit from a data table, not a function per door.
- Use `checkpoint` for one loaded witness and `checkpointState` for a declared empty or error state or several witnesses.
- Use `SurfaceWalkHooks` only for a surface that needs its own menu traversal or settles menu leaves against operation proofs.

The walker opens, reads and dismisses. It never activates a menu leaf or submits a form. It records each menu leaf it reads as its own `skipped` row. It opens one row menu per list and records its siblings as `skipped`. It lists a hidden control as `skipped`, never as witnessed.

### Skip reasons

A `skipped` observation names one reason from `SURFACE_SKIP_REASONS` in `tests/support/iso/surface-coverage.ts`, plus its detail.

- `publishSurfaceInventory` fails the case on a skip without a listed reason.
- `auditSurfaceInventory` names each such skip by subject.
- The walk report prints the reason legend, the run's skip total, and every skipped subject of each case.
- A later observation of the same subject supersedes the skip, so a journey settles what the walk only read.

## Driver handover

Follow "Journey authoring method" per file. Run `pnpm e2e:surface --data=synthetic --auth=local -- --project=desktop-1440-all-panes-measurement -g "<case>"`. Do not edit the tree during a run; the working-tree guard fails the run.

### tests/e2e/support/surface-chat.ts

1. Replace `inspectMenu`, `inspectTrigger`, `menuTerminal` and `dismissMenu` with `walkMenuTrigger`, using a `menuLeaves` hook for `accountMessageLeaves`.
2. Replace `contextCells` and the context walk with `walkScope` over the Context pane.
3. Replace `closeContextOverlay` with `dismissContext` where no action window is asserted.
4. Move names to production copy modules.

### tests/e2e/support/surface-config.ts

1. Move names to production copy modules.
2. Keep `disclosures` until the walker opens non-collapsible `aria-expanded` buttons. It opens them and leaves them open; the group's one `walkScope` reads their bodies.

### tests/e2e/support/surface-sections.ts

1. Move names to production copy modules.

Keep these functions; the walker cannot reach what they drive:

| Function | Reason |
| - | - |
| `presetViews` | It runs the rack drills and the Context readout under each selected tab; `walkScope` has no per-tab hook. |
| `homeSectionDoor` | Each Home jump is a registered Home operation with an `aria-current` witness. |
| `databankAdd` | It steps the add-method choices inside the open dialog. |
| `refineryVersions` | Compare is a label-swapping toggle with no `aria-expanded` or `aria-haspopup`. |
| `refineryDoors` | The workbench and Setup dialogs open from plain buttons; it is one door table. |

### Shared and surface-character.ts

1. Move the remaining hand-typed names in `surface-character.ts` to production copy. Shared dialog verbs (Cancel, Close, Done, Retry, Save, Create) need one shared home read by `packages/client/src/components/confirm-dialog.tsx`, `packages/client/src/components/form-dialog.tsx` and each dialog that prints them.
2. Replace the `dismissContext` name pattern with a production name.
3. Build the layout-stability matrix and the shared audit run. The matrix needs a post-ready movement measure that WebKit can take: it has no `layout-shift` entries, so sample the checkpoint witnesses' boxes across a settle window after `readyAt`, and prove it with a planted shifting fixture.

## Runner configuration

[playwright-surface.config.ts](../../../playwright-surface.config.ts) owns native journey selection, projects, deadlines, and reporting.
[playwright-surface-controls.config.ts](../../../playwright-surface-controls.config.ts) reuses the production component-test gallery pipeline for framework controls.
The ordinary E2E and CT configurations exclude these local artifact-producing files.
Both the launcher and configuration boundary refuse CI execution.

Configuration input contracts remain Node-safe; browser drivers stay in the browser test program. Type-only dependencies do not waive compiler-world boundaries.

The frontend is a production build with no development agent bridge.
The backend is the existing production-composed testkit graph with native HTTP, actual plugin reactivation, stopped jobs, and an owned scripted text-generation peer.
The launcher builds maintained showcase bundles before admission and reuses a current production client build (see Development loop). Production admission may upgrade pristine managed plugins to those exact bundles.
Private boot provenance records these changes beside immutable source facts; the original-subject census excludes replacement bundle assets.
Startup refuses unrelated subject, consent or completed embedding changes.
The peer admits only its exact origin, supported paths and declared model; other provider and SDK execution stays refused.
Synthetic memory queries use the canonical corpus embedding endpoint, model and vector function without network calls or vector-generation changes.
Owner embedding endpoints remain refused; the run descriptor distinguishes this synthetic fixture capability from the text peer.
Two production-created disposable connections point at that peer without changing original funding bindings or credentials at boot: a text connection for chat turns and one declaring structured output for Refinery stages, whose replies the peer admits only for the maintained refinery schemas.
Production settings temporarily admit the exact scripted ports on the copy and restore the effective allowlist during cleanup.
Generation journeys temporarily select this connection through the cloned owner's real chat-task binding and restore the prior choice in `finally`.
Completed turns assert durable generated output. The separately held cancellation case observes streaming and physical cancellation without claiming intermediate paint for immediate completions.
This composition does not establish normal deployment boot, background jobs, paid model execution, or field performance.
The fixture sets production-derived display preferences before browser navigation and preserves the owner's background-library data. Browser contexts are fresh; canonical presentation variants are not copied and the run cache may warm during journeys. These measurements do not match the original live application's warm-cache posture.

| Area | Choice and reason |
| - | - |
| Context | Fresh native context per independent journey; observers install before the first browser navigation. |
| Scheduling | Serial worker, no test retries; first failures remain evidence. |
| Measurement pass | Same journey body, trace and video off, no axe, design census, touch sweep, or screenshots. |
| Measurement overhead | Vendor observers, native assertions, browser protocol calls, and file-backed native attachments remain; this is not zero-overhead measurement. |
| Evidence pass | Native steps, complete axe results, existing geometry/name/form/density/touch collectors, console/network findings, and local PNGs. The public static design engine runs last. |
| Design audit | Preserve original samples, the public pixel pass, findings and incomplete populations. Restore scroll positions, exact inline-style attributes, temporary probes and observers on failure. |
| Request evidence | Reuse the public request ring only in evidence passes. Retain bounded status, timing and size metadata with query-free addresses; retain no headers or bodies. |
| Layout stability | The `-stability` projects run the measurement pass on Chromium and WebKit, desktop and phone. Each checkpoint samples its witnesses' boxes per frame across a settle window after `readyAt`, with scroll ancestors' offsets removed, so a scroll is not movement. It fails on movement unless an effect on the witness or an ancestor animates a geometry property in that frame or the frame before. Native layout-shift entries in that window stay separate evidence, `unsupported` on WebKit; the measure is not CLS. |
| Enlarged text | The `-text200` and `-text300` projects run the measurement pass on Chromium desktop and phone with the browser's default font size enlarged through CDP `Page.setFontSizes`. Each checkpoint asserts its root font size and runs the shared enlarged-text geometry probes over its scope. |
| Boot diagnostic | A separate Chromium project uses the public boot-trace engine and official insight summary. It does not run inside measurement journeys. |
| Diagnostic limits | Forced-hover design passes are not run. Boot summaries omit complete culprit frames and dependency graphs. CPU sampling is not wired. Lighthouse and the cascade analysis are excluded; see "Excluded diagnostics". |
| Screenshots | Primary captures show the visible viewport at CSS scale without masks, injected styles or animation suppression. Nested scroll checkpoints are separate; no offscreen coverage is claimed. Native failure screenshots and trace artifacts retain their recorder's native scale; on scaled phone profiles they are device pixels, because the installed Playwright `screenshot` option accepts only `fullPage` and `omitBackground`, not `scale`. The public pixel pass retains its own animation-disabled viewport screenshot. |
| Reports | Native list, JSON, blob, HTML and traces. The primary Markdown entry routes public native errors, steps and original attachments; no additional finding model or GitHub upload. |
| Deadlines | Native global timeout owns the execution budget. The outer process allows only a separate report/teardown reserve and retains its complete transcript. |
| Graphics | Shared native launch profile; record the actual browser's acceleration evidence independently from host timing capability. |
| Portability | Functional runs target Linux, macOS, and Windows. Hardware discovery may remain unavailable without failing a functional journey. |
| Private directories | POSIX ownership/mode checks and Windows per-user-profile custody have different guarantees; record the effective assumption. |

## Excluded diagnostics

Snap's Lighthouse audit and its `--cascade` winning-rule analysis do not run behind the surface command. Use `pnpm snap <route> --lighthouse <desktop|mobile>` or `--cascade` on the surface instead.

Both attach a second client to the run's own Chromium through a debugging endpoint that Chrome publishes in its profile's `DevToolsActivePort` file (`tooling/src/floor/browser/debugging-endpoint.ts`). That launch shape is the only one Snap supports; Snap does not reserve fixed debugging ports (`tooling/src/snap/ops/session.ts`, `debuggingPortFor`).

The walk cannot locate such an endpoint for its own browser through supported APIs:

- Playwright Test launches the worker browser with `browserType.launch()`. The installed Playwright creates that profile itself, in a random temporary directory named `playwright_chromiumdev_profile-*`.
- A `--remote-debugging-port=0` argument makes Chrome write `DevToolsActivePort` into that random profile, and no supported API names the profile directory.
- The same launch refuses a `--user-data-dir` argument and a `--remote-debugging-pipe` override.
- The installed Lighthouse audits only a Puppeteer page: its `startTimespan` declaration takes `LH.Puppeteer.Page`. Puppeteer connects through a browser endpoint or a whole-browser transport. Playwright's `CDPSession.send(method, params)` carries no target session id, so it cannot serve as that transport.
- A Lighthouse timespan starts its own protocol trace inside the action window. The measurement pass refuses audits there.
- The cascade analysis also reads the development merge handle `__orb.css`, which the production build does not install. It answers only explicit selector and property questions, and the walk does not ask any.

Replacing the fixture's launch with a persistent profile would give up Playwright Test's native browser lifecycle.

## Vendor options

The configuration reading covers complete primary axe Playwright/API and web-vitals references, plus native Playwright runner, context, project, emulation, screenshot, trace, reporter, parallelism, and retry references.
Installed exports and declarations govern the selected APIs.
Linked specifications, the complete vendor websites, every rule implementation, and vendor test suites are outside that reading.

| Option | Choice and reason |
| - | - |
| Axe rule profile | Keep default enabled document/frame rules and explicitly enable `target-size`, which the installed vendor disables by default. |
| Axe house target floor | Retain the separate production-token coarse-pointer hit collector; WCAG target size and the house target floor differ. |
| Axe selection | No excludes, disabled rules, severity filtering, or reduced result groups. |
| Axe output | Preserve violations, incomplete, passes, inapplicable, full nodes, checks, targets, environment, and options. |
| Accessibility conflicts | Keep vendor violations visible when they conflict with a production naming policy. Native semantic assertions alone do not establish that policy's accessibility. |
| Axe frames | Keep vendor partial-run aggregation, preload, selectors, and default frame timeouts. Preserve frame failures. |
| Axe experiments | Keep disabled experimental rules separate from the primary standards profile. Enable a named experiment only for a concrete question. |
| Web vitals | Inject the installed attribution IIFE only in test contexts; register once per top-level document. |
| `reportAllChanges` | `true`, to retain changing diagnostic values. |
| `reportSoftNavs` | `false`; app checkpoints which retain their URL do not become independent document visits. |
| `generateTarget` | Structural element path; do not copy owner text, element identifiers, or image URLs. |
| INP detail | `durationThreshold: 16` and `includeProcessedEventEntries: true` for bounded diagnostic journeys. |
| LCP buffer | Keep the vendor resource-buffer default until evidence shows lost attribution. |
| Metrics | Retain document identity, callback time, meaningful native entry fields, and attribution. Missing callbacks and unsupported APIs remain distinct. |
| Action window | Freeze `readyAt` after semantic readiness. Wait for native post-paint publication separately, record `collectedAt`, and filter entries to the original window. |
| Lifecycle | Drain emitted binding calls and mark unfinished visible documents incomplete. Do not manufacture final callbacks. |
| Frames | Top-document metrics do not establish iframe metric coverage; report that limitation explicitly. |

## Portability acceptance

Run functional synthetic journeys and framework controls on each claimed operating system.
Exercise path handling, temporary directories, native process cleanup, browser startup, and local artifact custody there.
Do not infer macOS or Windows acceptance from Linux source checks.
Record owner snapshot intake and controlled external-execution support separately from ordinary functional portability.
Keep unavailable GPU discovery and unqualified timing explicit while preserving functional execution.
