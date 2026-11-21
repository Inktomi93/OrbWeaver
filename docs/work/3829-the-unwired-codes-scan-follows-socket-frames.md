---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# The unwired codes scan follows socket frames

## What

pnpm unwired codes links a code to the client through a thrown reason or a tRPC or HTTP return value, but not through the stream socket, so STREAM_ERROR_CODES and other codes sent in socket frames never show as reaching the client.

## Why

A socket-only code nothing handles stays invisible to the scan.

## Done when

A code carried by a socket frame type reports as reaching the client, a red-first planted socket-frame case covers it, and the orchestrator reruns pnpm unwired codes.

## Evidence

Filled at landing: what ran and where its output is.
