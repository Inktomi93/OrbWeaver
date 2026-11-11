---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# Tooling reads the credentials key name and env overrides from the server's exports

## What

The server does not export its `CREDENTIALS_KEY` env name from the data-layout entry, so `tooling/src/stack` type-checks a hand-spelled copy instead of importing it. Env override objects in tools such as `tooling/src/render-trace/ops/fire.ts` spell env keys by hand with no type check. Two snap files, `tooling/src/snap/ops/parse.ts` and the instrument argv module, cite a numbered section of a document that does not exist.

## Why

A renamed env key leaves the tool's copy compiling and wrong.

## Done when

The key name has one exported home that the stack tooling imports. Each env override object is typed over the server's env key type, so a wrong key fails `tsc`. The two section cites name a document that exists or are removed.

## Evidence

Filled at landing: what ran and where its output is.
