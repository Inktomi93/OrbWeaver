---
kind: bug
status: open
updated: 2026-10-10
priority: P1
area: install
---

# Verify packaged FFmpeg installation on macOS

## What

Verify node-av installation on a native macOS runner with the direct release-asset patch. Confirm token support and preserve the required packaged FFmpeg postinstall check.

## Why

The metadata API returns HTTP 403 on native macOS install runs. The dependency continues without FFmpeg, then server postinstall correctly refuses installation.

## Done when

Retain native install logs proving the patched download and runnable packaged FFmpeg. Record whether response evidence establishes the HTTP refusal cause. Keep missing-binary failures actionable without silently accepting an unusable installation.

## Evidence

Filled at landing: what ran and where its output is.
