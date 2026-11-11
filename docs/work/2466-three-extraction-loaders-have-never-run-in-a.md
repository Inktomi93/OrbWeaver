---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: testing
lane: wt/agent-a6c90fc66144ff360
---

# Three extraction loaders have never run in a test

## What

packages/server/src/infra/extraction/loaders/{pdf,docx,epub}.ts: no test feeds a real PDF, docx or epub through createExtractText anywhere in the tree. The only %PDF bytes in tests are a fake for an assets-ownership refusal (tests/server/domain/chat/verbs/send-blocks.int.test.ts:259); no docx/epub fixture or mime appears in any suite; UnsupportedDocTypeError has zero test hits, so the 415-before-parse taxonomy is unproved. The composed int tests (scrape-web, corpus-databank) do exercise the real html and textlike loaders plus normalization end to end, because image/extraction ops are composed non-injectably at the entry tier. The pdf loader header records its only proof: legacy pdfjs build verified extracting by hand under plain node, with no successor door. Source: reports/codebase-review/units/server-infra-io.md F2.

## Why

A pdfjs-dist or Node bump ships a dead PDF path silently; the hand-run proof is the same corpse the providers law mourns for the deleted SDK probe fleet — a measured claim with no runnable instrument.

## Done when

One contract suite feeds createExtractText minimal real fixtures per format (a one-page pdf, a two-paragraph docx, a two-chapter epub; the zip-shaped ones constructible from infra/storage zip.ts) and asserts the normalized text, charCount and the extractorVersion stamp, plus one UnsupportedDocTypeError case for the taxonomy.

## Evidence

Filled at landing: what ran and where its output is.
