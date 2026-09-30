---
kind: plan
status: active
updated: 2026-09-28
---

# Typed plugin authoring and standalone templates

## Goal

Authors build checked TypeScript into installable JavaScript for the QuickJS guest and isolated frame runtimes.

## Shape

Plugin authors write TypeScript and distribute built JavaScript. The app installs those bytes through the existing bundle funnel while it is running and never runs repository build commands. A standalone Git repository is directly installable when its root contains `manifest.json`, deterministic built `main.js`, optional built `ui.js`, and admitted assets. TypeScript lives under `src/`; CI runs the strict freshness check so committed runtime entries cannot drift from it. Deterministic zip packing remains an optional upload and bundle-URL path. Standalone starter repositories are tracked in the linked work item.

The public plugin SDK exposes separate main, scripted UI, and frame contracts. It has no workspace aliases or app runtime dependency. An editor resolves these types from an ordinary locked install in any directory. A packable author-toolchain package owns typechecking, output staging, freshness checking, and deterministic zip packing; showcases and both starter repositories consume that same package. The SDK and toolchain are deterministic `.tgz` assets on the versioned `plugin-authoring-v0.1.0` public GitHub Release. The application contracts remain authoritative through conformance tests. The template follow-up must expose the checked support map for hooks, placements, and live mount adapters without copying a prose registry into each repository.

## Checked author support map

The toolchain ships a typed support map and renders it as JSON or Markdown through `orb-plugin support`. A monorepo generator derives its growing members from the contract tuples and maps for capabilities, host calls, event hooks, transform points, anchors, tiers, and command placements. The generated module has no contract import, so the packed toolchain remains standalone. Small execution-environment facts stay beside the generator because no runtime contract tuple owns them.

`orb-plugin support --write <path>` writes the rendered guide atomically. `orb-plugin support --check <path>` refuses a missing or stale guide without changing it. Template guides link to that generated file instead of copying the lists. A conformance test compares every generated member with the live contract sources and plants an omitted member, an extra member, and a wrong runtime assignment to prove drift detection.

The SDK does not gain runtime data because it remains declaration-only. The toolchain does not parse contract source at install time because a standalone repository has no Orbweaver checkout. A hand-maintained prose catalog is rejected because it can disagree with the executable contracts without failing a build.

`composer-action` uses the composer action row. The host shows a fitting prefix of attributed command buttons and moves remaining commands into Plugin actions. `composer-media` uses the existing Message tools menu, including Imagine commands. Both targets use the permission-checked command runner. The host owns ordering, attribution, keyboard access, and touch targets.

Coupled sites are `packages/contracts/src/automation/index.ts`, `packages/contracts/src/chat/bus.ts`, `packages/contracts/src/plugin/host-v1.ts`, `packages/contracts/src/plugin/manifest.ts`, `packages/contracts/src/plugin/ui.ts`, `packages/plugin-toolchain/`, the support-map generator, and focused toolchain tests. The template owner chooses the generated guide path in each standalone repository and adds its freshness command after the public toolchain asset lands.

The showcase package uses that public SDK and toolchain. Each example tracks its manifest, admitted assets, TypeScript, and prose at the bundle root. Pocket Arcade's executable frame script is separately typed before it is embedded in its document. The release build creates one deterministic zip per slug under the ignored `packages/showcase-plugins/dist/bundles/` tree, writes each zip atomically, and leaves no generated JavaScript beside source.

A showcase release edits tracked source and bumps that plugin's manifest version. The release build materializes and checks the runtime zip tree before packaging; the Docker build copies it into the runtime image, and bare-metal launchers preflight it before the server starts. The release gate requires a strictly newer manifest version for every changed installable-byte input. The existing per-user seeder reads the shipped zip through the normal bundle install and upgrade verbs: it installs disabled and ungranted examples for new users on their first authenticated request, upgrades pristine seeded rows in place when a newer manifest version ships, and leaves removed or diverged copies alone. A widened capability request follows the normal re-consent path.

The compiler assigns source to the runtime that executes it:

- Main source runs in the server QuickJS WASM guest with the main host contract.
- Scripted UI source runs in the browser QuickJS worker with the UI host contract. It returns house-rendered data and has no DOM.
- Frame source runs in an isolated browser document with a typed message bridge and DOM types.

The initial author templates are two standalone repositories: a server plugin starter for host tools and static house UI, and a visual plugin starter whose root is a scripted house UI example and whose custom frame example lives under `examples/frame/`. The visual examples retain their distinct runtime and type contracts, and each builds and installs independently. Both repositories have locked development dependencies, a working default example, and CI that checks the committed root JavaScript against TypeScript. The ordinary path is GitHub-first: use a template, edit, let the template build the checked root entries, push, then paste the public repository URL into the running app. Local CLI commands are an optional maintainer/developer loop. Templates lock the two GitHub Release tarball URLs for the same SDK and toolchain the showcases use; those author dependencies stay invisible to ordinary installers. Build and install tests run outside the monorepo.

The installable root carries the authored manifest, built entry files, and admitted raster images. House surfaces refer to installed images through the existing bundle-asset mapping. Frames gain a scoped installed-asset path before the custom frame template promises image assets. The application install funnel remains authoritative for manifest rules and budgets; toolchain pack output is tested through that funnel rather than carrying a second rule set.

Plain TypeScript is the default for QuickJS source. The initial frame template also uses plain TypeScript. JSX needs a renderer and its own runtime contract, so a React frame variant waits for a measured frame budget and a separate test path.

For a direct-Git template, `orb-plugin build . --source-dir src --out-dir .` writes the committed root entries and `orb-plugin check . --source-dir src --out-dir .` verifies them without rewriting. The nested frame example uses its own plugin root and source directory. `orb-plugin pack` remains available when an author explicitly needs a zip. The author guide states the update rules for each install source.

## Rejected

The app does not build fetched repositories because their build scripts run outside the guest sandbox. QuickJS guests do not receive Node or browser globals. The toolchain does not add shims for those globals or a live-source install path.

## Coupled sites

`packages/showcase-plugins/`, `packages/plugin-sdk/`, `packages/plugin-toolchain/`, `packages/contracts/src/plugin/`, `tooling/src/_shared/project-worlds.ts`, `tooling/src/_shared/type-config-intent.ts`, `scripts/pack-plugin.ts`, and the guest harness change together. Both standalone template repositories consume versioned SDK and toolchain tarballs rather than workspace paths.

## Test plan

Plant wrong host methods, wrong main/UI contracts, Node and DOM leaks, missing, stale, and obsolete committed output, external imports, and frame type errors. Check emitted scripts in the matching QuickJS runtimes. Check frame behavior in its isolated document. Preserve showcase behavior tests, pack determinism, and bundle acceptance. Build both repositories and each visual example outside the monorepo, then install their built root entries through the real Git funnel.
