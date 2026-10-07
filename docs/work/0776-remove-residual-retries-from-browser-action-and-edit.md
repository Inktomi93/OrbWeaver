---
kind: bug
status: doing
updated: 2026-10-07
priority: P2
area: tooling
lane: codex/ci-dependency-upgrade
---

# Remove residual retries from browser action and edit geometry tests

## What

Repair the installed-plugin toggle, container-config copy and short-message edit geometry cases found in the hosted component reports. Retain mutation payload, clipboard and box-preservation assertions.

## Why

Successful retries mask an unrecorded mutation, an empty clipboard result and an edit-height mismatch despite the font barrier.

## Done when

Each failure has a causal probe or preserved diagnostic boundary. Affected component suites and bounded repeats pass without widened timeouts, tolerance increases or weakened assertions. Coupled compiler, lint and structural checks pass.

## Evidence

A held history query reproduces the read/edit mismatch; the baseline now waits for settled history before measuring. A held request reproduces optimistic enabled state without a recorded payload; the test polls the exact payload and settled control.

Affected suites and bounded repeats pass without geometry tolerance, timeout or payload changes. Clipboard checks retain native writes, native readback and exact text. Copied-outcome and passive input/write diagnostics strengthen the completion boundary. The original hosted empty-clipboard cause remains unproven; fresh hosted evidence is required.
