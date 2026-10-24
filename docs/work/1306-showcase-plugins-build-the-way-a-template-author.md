---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: plugin
---

# Showcase plugins build the way a template author builds

## What

The showcase tsconfigs (packages/showcase-plugins/tsconfig.author-\*.json and tsconfig.json) include the SDK declarations by path (../plugin-sdk/main.d.ts, shared.d.ts, frame.d.ts), add the repository's reset.d.ts and platform.d.ts globals, and extend the repository's tsconfig.base.json or tsconfig.world-browser.json. ADR 0266 says authors build against the standalone public SDK, shipped as a deterministic tarball on a versioned GitHub Release that the template repositories lock, with the author toolchain checking emitted artifacts.

## Why

The showcases are the reference plugins. If they compile against more than a template author gets (repo globals, unpublished declarations, repository compiler options), a showcase can depend on something no author can use, and an SDK packaging defect never shows up in our own build.

## Done when

Each showcase builds against the packed SDK and toolchain artifacts a template locks (or byte-identical declarations resolved through the package's exports), with the template's compiler options and no repository globals; a planted use of a repository-only global or an unexported SDK path fails the showcase build; one showcase also builds in a clean template-shaped checkout outside the workspace.

## Evidence

Filled at landing: what ran and where its output is.
