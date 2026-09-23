---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Vendored docs leave git

## What

Delete `docs/vendor/` (the ai-sdk, base-ui and vite mirrors), add the path to `.gitignore`, and give any reader a real source: `rg -n 'docs/vendor' packages tooling tests scripts .claude` names each one; a tool that needs an upstream doc fetches it into `reports/` or reads the installed package's own docs. Drop the `vendor` lane and its attestation file from `docs/catalog/`, the `VENDOR_PREFIX` exemptions in `tooling/src/doc-catalog/lib/frontmatter.ts` and `tooling/src/doc-catalog/lib/debt.ts`, and the vendor authority and disposition rows in `tooling/src/doc-catalog/lib/vocab.ts`.

## Why

A third of the tracked docs are bytes this repo does not author; they are searchable upstream and in `node_modules`.

## Done when

`docs/vendor/` is gone and ignored; every former reader has a named source; `LEGACY_ROOTS` loses the `vendor` row; `pnpm check:doc-catalog` (if the catalog still exists) and `pnpm check:agents` are green.

## Evidence

Filled at landing: what ran and where its output is.
