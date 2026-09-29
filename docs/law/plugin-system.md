---
kind: law
status: active
updated: 2026-09-28
---

# Plugin system

Plugins are installed per user and run only with that user's grants. [D147](../adr/0147-a-plugin-is-user-scoped-anyone-installs-one.md) owns installation authority. [D46](../adr/0046-scripting-variables-live-on-two-planes.md) owns the QuickJS guest boundary.

## Author and install path

The installable unit is an admitted bundle, not a source repository. `packages/contracts/src/plugin/manifest.ts` owns its manifest and entry limits. `packages/server/src/domain/plugin/substrate/manifest.ts` validates the bundle. The install verbs store admitted bytes and the plugin's owner-scoped asset links. They do not run repository build commands.

The author guide is `packages/showcase-plugins/bundles/README.md`. Showcase TypeScript is checked against the public `packages/plugin-sdk/` declarations and packed by `packages/plugin-toolchain/`. The tracked package contains source, manifests, assets, and prose. The release build creates ignored, atomic installable zips under `packages/showcase-plugins/dist/bundles/`; the server reads only those zips and never loads the compiler. [D266](../adr/0266-plugin-build-artifact-boundary.md) owns that boundary. [The authoring plan](../plans/plugin-authoring/design.md) tracks the standalone templates and remaining author work.

Third-party Git repositories author TypeScript under `src/` and commit deterministic built entry files beside the root manifest. Their trusted CI refuses missing, stale, or obsolete generated JavaScript. Git-backed installation fetches those built root entries through the live bundle validator and consent path while the server is running; the application never compiles fetched TypeScript or runs repository scripts. Zip upload and bundle-URL sources remain valid prebuilt forms. The SDK and toolchain themselves ship as deterministic tarballs on a versioned public GitHub Release so locked author projects can install them anonymously without a package-registry credential.

The bundle may come from an upload, a development directory, a bundle URL, or a Git repository. Each source must pass the same admission and consent path. [D276](../adr/0276-plugin-install-doors-share-one-funnel.md) rules those install doors. A repository name does not set plugin identity: the admitted manifest does.

## Execution planes

| Plane | Entry and authority | UI access |
| - | - | - |
| Server guest | `main.js` runs in QuickJS through `packages/server/src/infra/plugin-host/` and the granted host membrane. | Registers host-rendered surfaces and commands. |
| Browser guest | Optional `ui.js` runs in a QuickJS worker through `packages/client/src/features/plugin/lib/ui-guest/`. | Returns scripted house surface data; it has no DOM. |
| Isolated frame | A consented frame receives a bounded message bridge through `packages/contracts/src/plugin/frame.ts`. | Owns pixels inside its frame, not application chrome. |

`packages/contracts/src/plugin/host-v1.ts` and `packages/contracts/src/plugin/ui.ts` own the guest API and surface vocabulary. The host checks grants on effects and validates data crossing each boundary. Background plugin code cannot insert prose into chat canon; [D188](../adr/0188-background-automation-and-plugins-never-write-a-message.md) owns that rule.

## Placement and assets

The host owns application chrome. Plugin commands currently reach the Plugins menu, command palette, and slash flow. [D267](../adr/0267-plugin-ui-placement-boundary.md) rules the typed placement boundary for other host menus. General composer and media menu placements are not yet built; [the placement item](../work/0237-expose-typed-plugin-action-placement-in-host-menus.md) names the work.

House surfaces resolve admitted bundle images through owner-scoped asset links. An isolated frame reads its plugin's installed images through its own frame handle at `GET /api/plugin-frame/:id/asset`, which checks owner, plugin, asset, size and revocation on every request (`packages/server/src/entry/http/plugin-frame.ts`). Guest isolation alone does not authorize a browser asset request.

## Change checks

Update the public contract, guest validation, host adapter, and SDK mirror together when a capability changes. Test both grant and refusal through the real guest. Add a placement only with a host mount and rendered keyboard and mobile tests. Test a new install source through the shared bundle validator, consent path, and owner boundary. The plugin path rule in `.claude/rules/plugins.md` names the additional local controls.
