---
kind: bug
status: doing
updated: 2026-11-08
priority: P1
area: security
lane: wt/agent-a868da7ba9eed6d7a
plan: test-foundation
---

# Recording provider tapes keeps the recording key out of the e2e servers

## What

The tape record command exports the provider key so the record proxy can call the provider, and every e2e webServer inherits it and seeds it as the e2e owner's credential. Pass the recording key under a name the server never reads, used only by the record proxy. An empty key is refused at boot, so blanking it is not the fix.

## Why

Each recording run copies a real provider key into throwaway e2e databases encrypted with a checked-in key, which is the leak lane F just closed for routine runs.

## Done when

A record run leaves the provider key absent from every webServer's environment and from the e2e owner's credentials, with a test that starts the record command's webServer and asserts the key is not visible to it.

## Evidence

Filled at landing: what ran and where its output is.
