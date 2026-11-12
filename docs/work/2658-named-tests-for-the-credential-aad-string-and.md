---
kind: work
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
plan: checked-law
---

# Named tests for the credential AAD string and the request-body merge defense

## What

`docs/law/Spine-Testing.md` lists behaviors that must each be a named test at its mirror. No test asserts the GCM additional data string that binds a stored credential to its user and provider (`packages/server/src/infra/crypto/secrets.ts` and its callers), and no test names `deepMergeRequestBody` in `packages/kit/src/custom-parameters/index.ts`, the second layer of the prototype-pollution defense. Write both through the production door.

## Why

The law calls these behaviors ones that must not regress silently, and a change to either passes every suite today.

## Done when

A test fails when the additional data string changes or a credential row is decrypted under another user or provider, and a test fails when a `__proto__`, `constructor` or `prototype` key in user-authored extras reaches the merged body; each report names its production entry and its red.

## Evidence

Filled at landing: what ran and where its output is.
