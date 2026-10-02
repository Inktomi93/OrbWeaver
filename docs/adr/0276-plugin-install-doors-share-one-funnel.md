---
kind: adr
status: superseded
updated: 2026-10-02
superseded-by: docs/adr/0280-plugin-supported-install-sources.md
---

# Every plugin install door lands through the one bundle funnel

## Context

Authors install a plugin from a zip upload, a bundle URL, a development directory, a folder upload or a Git repository. Each source could grow its own parser, validation and storage.

## Decision

Every door produces bundle bytes and lands through the unchanged `install` and `upgrade` verbs, so parsing, the grant-within-declared check, consent and the disabled-by-default landing stay one trust story (D147). Load unpacked packs a directory with `packPluginDir` and is refused outside development. Folder upload is client-only: the install card packs exactly the admitted entry names and the server re-judges every byte. Install from Git shallow-clones with `isomorphic-git` over the egress validators into a scratch directory, packs with the same packer, deletes the clone, and records the resolved commit in `plugins.source_commit`, non-null exactly when the origin is `git`; the update check reads the remote head without cloning. The slug comes from the admitted manifest, never the repository name. A URL or Git install binds to the bytes shown at preview: install and upgrade refetch and refuse a changed bundle. Homes: `packages/server/src/domain/plugin/` (verbs and funnel), `packages/server/src/infra/plugin-source/` (the packer), `packages/server/src/infra/network/plugin-git.ts` (the Git adapter), `packages/contracts/src/plugin/lifecycle.ts` (`PLUGIN_ORIGINS`), `packages/client/src/features/plugin/` (the install card).

## Consequences

A new install source is a new producer of bundle bytes, never a new validation path. The SSRF policy keeps one home in the egress validators for URL and Git reach alike.

## Alternatives rejected

An unpacked-plugin registry serving the live directory: a second store of guest code beside the CAS bundle. A server verb accepting a multipart folder: a second install path with its own validation. System git through execFile: the runtime image ships no git binary, and a shell is new attack surface. A persistent per-user clone: a second store of guest code with cleanup, quota and drift. A host allowlist for Git remotes: the URL door has none, and a second policy for the same reach would fork the SSRF rule.
