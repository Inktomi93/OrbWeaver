---
kind: adr
status: active
updated: 2026-09-23
---

# Snap records motion as PNG contact sheets, not video

## Context

Agents need to see transitions that one screenshot misses. Playwright records video only from a context created with `recordVideo`. Video therefore needs a second browser context beside the one Snap drives.

## Decision

`--filmstrip` samples the driven page with CDP `Page.startScreencast`. It renders one bounded, labelled PNG contact sheet per page with Sharp (`tooling/src/snap/ops/arms/filmstrip.ts`, `tooling/src/snap/lib/filmstrip-sheet.ts`). It keeps no WebM or GIF.

## Consequences

Motion evidence comes from the same page, device and client state as every other Snap check. A reader opens it with the `Read` tool as one image.

## Alternatives rejected

Playwright video: it needs a second context, which splits the session path. No reader consumes a WebM or GIF file; readers open PNG sheets. Add video only for a measured consumer.
