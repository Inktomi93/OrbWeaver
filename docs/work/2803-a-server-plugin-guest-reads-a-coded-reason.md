---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A server plugin guest reads a coded reason for a failed model call

## What

A failed quiet model call now reaches a server plugin guest as the fixed host-call-failed sentence, so an author cannot tell a rate limit from an auth or content refusal. Ruling: the guest gets a closed kind derived from the provider error kind plus a retryable flag; no upstream text, no reset time, no provider or model name.

## Why

A plugin needs to decide between retry and stop.

## Done when

The guest receives the kind for each provider failure class through a scripted transport, nothing of the upstream body reaches its log, and the SDK type is pinned in the conformance test.

## Evidence

Filled at landing: what ran and where its output is.
