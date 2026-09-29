---
kind: adr
status: active
updated: 2026-09-28
---

# Plugin authors publish checked JavaScript artifacts

## Context

Authors need TypeScript types and editor support outside the Orbweaver checkout. Installed repositories can contain untrusted build scripts, while QuickJS executes JavaScript artifacts.

## Decision

Authors write TypeScript against a standalone public SDK and build deterministic JavaScript before distribution. The installable bundle contains the manifest, built entry files, and admitted assets. The app admits and executes built files through the existing bundle validator; it never builds fetched source. The public SDK separates server guest, browser guest, and isolated frame contracts. The author toolchain checks emitted artifacts in their matching runtimes and owns deterministic zip construction.

First-party showcases keep one tracked source: TypeScript, manifests, assets, and prose. The release build writes ignored, atomic installable zips under the showcase package's `dist/` tree; the server reads only those zips. Docker and bare-metal release builds materialize that tree before the server starts.

Standalone template repositories use a different distribution shape because the Git repository itself is an install source. Authors edit TypeScript under `src/`; the checked build writes deterministic `main.js` and optional `ui.js` beside the root manifest. Those generated root entries are committed and a strict freshness check keeps them byte-consistent with source. Git installation fetches only the built root entries and admitted assets. It never compiles fetched TypeScript or runs repository scripts. Deterministic zip packing remains available for upload and bundle-URL installation, but a GitHub Release is not required for an ordinary plugin.

The SDK and toolchain are distributed as deterministic tarballs on a versioned public GitHub Release, not through a package registry. Templates lock the two anonymous release-asset URLs. Homes: `docs/law/plugin-system.md`, `packages/plugin-sdk/`, `packages/plugin-toolchain/`, and `docs/plans/plugin-authoring/design.md`.

## Consequences

Templates and showcase examples share the public SDK and build pipeline. A clean install of each template must build and check committed output outside the monorepo. Source and emitted artifacts must remain byte-consistent. Showcase installable-byte input changes require a strictly newer manifest version so the existing per-user seeder can deliver the new zip.

## Alternatives rejected

Building cloned repositories inside the app runs untrusted build commands outside the guest sandbox. Running raw TypeScript or JSX inside QuickJS does not provide typechecking or a renderer. Keeping the SDK tied to repository-relative globals forces authors into the Orbweaver checkout.
