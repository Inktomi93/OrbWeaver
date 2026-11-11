---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: server
---

# The pdf loader joins text items without adding spaces the page does not have

## What

`packages/server/src/infra/extraction/loaders/pdf.ts` joins the text items pdfjs returns with a space. pdfjs emits a separate empty end-of-line item after a font change, so such a line ends in a space, and two items with no gap between them gain one. Found while testing the loaders under item 2466; the new pdf fixture avoids pinning the artifact.

## Why

Extracted text feeds search and memory, and stray spaces split words.

## Done when

The join rule for empty and whitespace-only items is decided and tested through the databank upload verb. If the output changes, `EXTRACTOR_VERSION` rises so stored documents are re-extracted.

## Evidence

Filled at landing: what ran and where its output is.
