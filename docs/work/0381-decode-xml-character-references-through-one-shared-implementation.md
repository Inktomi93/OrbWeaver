---
kind: bug
status: open
updated: 2026-10-02
priority: P3
area: extraction
---

# Decode XML character references through one shared implementation

## What

Unify XML entity decoding used by DOCX, EPUB metadata and manifest paths, and YouTube captions. Decode named, decimal and hexadecimal character references.

## Why

The duplicated decoders disagree on apostrophes and retain legal numeric references. Encoded EPUB chapter paths can fail to resolve.

## Done when

Focused tests cover DOCX text, EPUB titles and encoded chapter paths, and captions. Preserve single-pass decoding, malformed-input handling and existing archive limits.

## Evidence

Source review: `/tmp/claude-launch-registry-audit/results.json`, group `xml-entity-decoders`. Main checked the cited definitions and consumers. Implementation and affected checks remain pending.
