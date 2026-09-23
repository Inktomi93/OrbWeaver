---
kind: plan
status: active
updated: 2026-09-23
---

# Plugin distribution: three install doors into the one bundle funnel

## Goal

A plugin author can install a plugin without zipping it: load an unpacked directory in development, upload a folder, or install from a git URL that the app clones.

## Shape

**Already built:** the showcase plugins live in their own workspace package, `packages/showcase-plugins/`, with the authoring guide and the published `host-v1.d.ts`; the zip dropzone and the URL fetch doors land through the one install funnel (`packages/server/src/domain/plugin/substrate/manifest.ts`).

Every new door produces bundle bytes for the same funnel and lands through the unchanged `install` and `upgrade` verbs, so parsing, the grant-within-declared check, the consent screen and the disabled-by-default landing stay the one trust story (D147).

- **Load unpacked (development only).** A generalized packer (`packPluginDir`) packs a local directory's admitted entries; `plugin.installUnpacked` installs or upgrades from it. The verb refuses outside development, and a test pins both the refusal and the admission. Reload means re-running the verb; no file watcher.
- **Folder upload.** Client-only: the install card gains a `FolderPicker` beside the zip dropzone and packs exactly the admitted entry names (`manifest.json`, `main.js`, `ui.js`, `ui/assets/*`) with `fflate`. The server re-judges every byte as today. No new server verb.
- **Install from git.** A new `infra/git` adapter shallow-clones into a scratch directory, packs with the same packer, deletes the clone, and returns the bytes plus the resolved commit. Git runs through `isomorphic-git` with its HTTP client wrapped over the egress validators, so the SSRF policy keeps one home. `PLUGIN_ORIGINS` gains `git`; a new `plugins.source_commit` column is non-null exactly when the origin is `git`. The verbs mirror the URL family: preview, install, upgrade from the stored URL (owner-scoped row load before any clone), and a git case in `checkForUpdates` that asks for the remote head without cloning. The slug comes from `manifest.id`, never the repo name. The URL field accepts any https git remote; the copy names GitHub. An inline disclaimer sits beside the field, with no extra confirmation step.
- **Guest type-checking.** A `checkJs` program over the showcase `.js` guests, typed against `host-v1.d.ts`, so the teaching plugins stop rotting.

## Rejected

- An unpacked-plugin registry that serves from the live directory: a second store of guest code beside the CAS bundle.
- A server verb that accepts a multipart folder upload: a second install path with its own validation surface.
- System git through `execFile`: the runtime image ships no git binary, and a shell is a new attack surface.
- A persistent per-user clone as SillyTavern keeps: a second store of guest code, with cleanup, quota and drift against the bundle.
- A host allowlist for git remotes: the URL door has none, and a second policy for the same reach would fork the SSRF rule.

## Coupled sites

- `packages/showcase-plugins/` (the packer and the `checkJs` program)
- `packages/server/src/domain/plugin/` (the verbs and the manifest funnel)
- `packages/server/src/infra/` (the new git adapter) and `packages/server/src/infra/network/egress.ts`
- `packages/contracts/src/plugin/lifecycle.ts` (`PLUGIN_ORIGINS`)
- `packages/db/src/schema/plugin.ts` (the commit column, as a forward migration)
- `packages/client/src/features/plugin/` (the install card)
- the plugin router and the cross-tenant sweep classification for each new procedure

## Test plan

- The development gate pinned in both directions: refused in production, admitted in development.
- Packer tests over a traversal corpus: only the admitted entry names are emitted.
- A folder-upload CT on the install card.
- Git adapter tests: every HTTP hop passes the egress validators, including redirects; the scratch directory is removed on every error path; the owner-scoped load runs before any clone.
- A security review of the git adapter and the unpacked path read before the git door ships.
