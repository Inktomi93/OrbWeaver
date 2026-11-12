---
kind: work
status: open
updated: 2026-11-12
priority: P2
area: server
plan: cross-platform
---

# Server and launcher code that assumes POSIX is found and made OS-neutral

## What

Survey `packages/server/src`, `packages/inference/src`, the launcher scripts and the shipped start path for behaviour that differs on Windows or macOS: signals used as a protocol, descriptor numbers and FIFO checks, file modes used as a guarantee, path separators and case, symlinks, rename over an open file, file locks, shell-outs to Unix binaries, child process trees and their teardown, and the spawns of tar, cloudflared, ffmpeg and git. Start with what changed since the last release tag. `packages/server/src/entry/compose/share.ts`, `packages/server/src/infra/storage/cas.ts` and `packages/kit/src/path-containment/index.ts` already branch on platform and show the house pattern.

## Why

Development and every local check run on Linux, so a POSIX assumption passes everything until a native install hits it.

## Done when

Each finding is fixed with a Node mechanism that behaves the same on all three systems or carries a tested Windows path, the survey's method and scanned counts are in the lane report, and a rule file states that server and launcher code targets Windows, macOS and Linux with the checks that run on each.

## Evidence

Filled at landing: what ran and where its output is.
