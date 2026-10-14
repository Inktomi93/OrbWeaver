---
kind: tooling
status: doing
updated: 2026-10-14
priority: P1
lane: codex/type-homes-981
plan: test-foundation
---

# One type-home gate judges every package by the 7.4 table

## What

Spine-TypeScript section 7.4 forbids any exported type, interface or zod object outside the homes, in every package. The gates enforce less: no-inline-types judges aliases only in client, server, inference, tooling and tests; the interface gates cover server domain, server non-domain and inference; no-inline-wire-interface judges a client interface only when its name ends in a wire suffix. Nothing judges ui, plugin-sdk, plugin-toolchain, showcase-plugins, default-content or scripts, nor a client, tooling or test interface with another name. Replace no-inline-types, no-inline-domain-interface, no-inline-wire-interface, no-inline-package-interface, types-in-contract and contract-banned-shapes with one gate driven by the type-home table, judging every declaration kind by its home and never by its name, over every workspace package. Decide in law whether ui component props are a home. The interfaces item 952 baselined become this gate's population; the product moves into type homes still happen here.

## Why

A gate narrower than its law lets the drift the law forbids accumulate where nobody looks, and a name-suffix test is a spelling check, not a type check.

## Done when

One gate whose population is every package, with a planted control per package and per declaration kind; the six old gates are deleted; findings outside the old populations are fixed or baselined against this item; section 7.4 names the one gate.

## Evidence

Filled at landing: what ran and where its output is.
