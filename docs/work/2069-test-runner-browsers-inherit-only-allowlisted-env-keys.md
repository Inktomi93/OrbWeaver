---
kind: bug
status: doing
updated: 2026-11-07
priority: P1
area: security
lane: main
plan: test-foundation
---

# Test runner browsers inherit only allowlisted env keys

## What

Every browser the test runners launch gets the whole ambient environment through inheritedProcessEnv in tooling/src/floor/process/process-env.ts, reached from nativeBrowserLaunchOptions. Playwright's JSON reporter then writes the config, env included, into local report files, so a personal access token lands on disk.

## Why

A secret in a report file can leak through an upload, a shared folder or a later commit, and nothing needs it there.

## Done when

Launched browsers receive only allowlisted keys beside TEST_INHERITED_ENV_KEYS, and a canary env value set before a run appears in no report file, red first.

## Evidence

Filled at landing: what ran and where its output is.
