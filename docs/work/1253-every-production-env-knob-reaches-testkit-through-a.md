---
kind: work
status: open
updated: 2026-10-23
priority: P1
area: tests
---

# Every production env knob reaches testkit through a typed seam map

## What

`packages/server/src/foundation/env/record/index.ts` declares about eighty env keys (`AUTH_MODE`, `AUTH_FALLBACK`, `DEBUG_TOKEN`, `WIRE_CAPTURE*`, `RPG_TRACE`, `LOG_LEVEL`, `EGRESS_FIREWALL`, `EGRESS_ALLOWLIST`, `IP_ALLOWLIST`, `ALLOWED_HOSTS`, `FORWARD_AUTH_*`, `OIDC_*`, `LOCAL_LIGHT_*`, `DATA_LAYOUT*`, `IMPORT_*`, `CORPUS_AUTOINDEX`, `DEV_SEED`, …). The harness exposes a handful as seams (`authConfig`, `rolePolicyConfig`, `logLevel`, `debugToken`, `wireCapture`, `wireCaptureReply`, `rpgTrace`, `wireCaptureDir`, `importReportsDir`, `networkExecution`) and reads the rest from the composed `env` record. With env stubs now a lint error, a test that needs any other knob has no door, and nothing says which keys are test knobs, which are deploy-only, and which are already seams.

## Why

A knob a test cannot turn is a code path no test runs; the owner's bar is that testkit can set anything production can set, and a new env key must fail to compile until it is placed.

## Done when

One typed table in testkit, `Record<EnvKey, Seam>` over the env schema's key tuple, where each entry is one of: `seam` naming the harness option that controls it, `composed` for a key the harness derives from another seam (with the derivation named), or `deploy-only` with the reason (bind host, dist dir, container paths, secrets files); a `tsc` failure when a key is added to the schema without a table entry; every `seam` entry backed by a real harness option that reaches the same production read the env key does (not a second config path), with one test per seam class proving the knob changes product behaviour through the root; the README documents the table; `tests/support/node/server.ts` reads env only through the table.

## Evidence

Filled at landing: what ran and where its output is.
