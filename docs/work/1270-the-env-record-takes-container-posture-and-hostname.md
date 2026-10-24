---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: server
---

# The env record takes container posture and hostname as inputs, not from the machine

## What

`packages/server/src/foundation/env/record/index.ts` is the pure side of the env split, yet its parse reads container marker files with `existsSync` and the machine hostname with `os.hostname()`. `installKind(env)` and the bind posture therefore follow the machine a test runs on: a test root inside a container judges itself a container install while the harness pins bare-metal for bind and HTTP, and no test can state either posture through the record. The composition root (`entry/compose/process-seams.ts`) is the one place that may read the machine.

## Why

Item 1254 made the record a root dependency so a test can set anything production can set; two inputs still come from the host, so the record is not the whole truth and a suite can disagree with itself across machines.

## Done when

`parseEnv` takes the container posture and hostname as explicit inputs beside the env source and the file-key set; `createProcessSeams` supplies them from the machine; `createTestEnv` defaults to bare-metal with a fixed hostname and exposes both as `ENV_SEAMS` rows; the record module has no `node:fs` or `node:os` import and a dependency-cruiser rule or the existing `process-env-composition-root-only` rule covers it with a planted control; one test per posture shows `installKind` and the bind refusal follow the record.

## Evidence

Filled at landing: what ran and where its output is.
