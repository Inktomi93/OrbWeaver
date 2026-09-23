---
kind: tooling
status: done
updated: 2026-09-23
priority: P2
area: verify
evidence: 64af3802453f7cb9f8af18a4981bd14dd4de119c
---

# Prove the client production build emits the app stylesheet, and ban sideEffects on the client package

## What

Add two checks.

(1) A build-output check that runs on the real production build of packages/client. It fails when the emitted dist/index.html links no stylesheet from dist/assets. It also fails when that linked stylesheet lacks a sentinel that only the app's own CSS front door (packages/client/src/styles/index.ts and what it imports) can contribute, such as a known theme custom property or selector. It fits best inside the existing push-tier stage in tooling/src/verify/ops/boot-chunk-ratchet.ts, which already runs that build and parses the emitted html; today it treats CSS hrefs as unmeasured. If the build output cannot be read, report a tool error, never a pass.

(2) A static check that fails whenever packages/client/package.json declares a sideEffects field.

## Why

The client's stylesheet reaches the bundle only through a bare side-effect import in packages/client/src/main.tsx. Rolldown applies the nearest package.json sideEffects setting to the app's own files. A sideEffects allowlist on the client package once let the bundler drop that import, and the production app shipped with no stylesheet. The fix removed the field but added no guard. Existing checks look only at the authored import graph (sanctioned-css-homes, playwright-css-topology) or at JS boot bytes (boot-chunk-ratchet). The e2e suite runs against the dev server, not a production build. So a re-added sideEffects field, or any other change that makes the bundler drop the CSS entry, would pass every check today.

## Done when

On the unmodified tree, both checks pass: the build-output check under `pnpm verify --push` and the static sideEffects check under `pnpm check`. Each check also has a committed test under tests/tooling that flips a fixture copy both ways: (a) remove the styles import from main.tsx, or strip the sentinel from the stylesheet, and the build-output check fails and names the missing sentinel; (b) add a sideEffects field to the client package.json and the static check fails and names the file. Restore the fixture and both pass.

## Evidence

Filled at landing: what ran and where its output is.
