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

Hosted install run 38016473202, job `source (macos-latest)` on macos-26-arm64, installed `ffmpeg-v8.1-macos-arm64-jellyfin.zip` and the server postinstall reported `media runtime: ffmpeg version 8.1-Jellyfin`. The 10-06 failure (run 37535766671) was a 403 from the GitHub releases API in the node-av postinstall; patches/node-<av@6.1.1.patch> (fd13c9fefb) downloads from the release URL instead. The 403 cause is unproven because the log carries only the status line. Intel macOS is not covered.
