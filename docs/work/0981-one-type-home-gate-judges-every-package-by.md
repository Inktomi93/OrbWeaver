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

Spine-TypeScript section 7.4 forbids any exported type, interface or zod object outside the homes, in every package. The gates enforce less: no-inline-types judges aliases only in client, server, inference, tooling and tests; the interface gates cover server domain, server non-domain and inference; no-inline-wire-interface judges a client interface only when its name ends in a wire suffix. Nothing judges ui, plugin-sdk, plugin-toolchain, showcase-plugins, default-content or scripts, nor a client, tooling or test interface with another name. Consolidate inline alias and interface policies into one canonical placement judgment driven by the type-home table. Use native restrictions for covered syntax and shared readers for semantic origins. Judge every declaration kind by its home, never its name, across every workspace package. Preserve separate hard service-presence and ledger field claims until successor coverage is proved. Preserve component-owned prop and render APIs beside their components under section 7.4; derive lower-owned data and installed native types. The interfaces item 952 baselined become this gate's population; the product moves into type homes still happen here.

## Why

A gate narrower than its law lets the drift the law forbids accumulate where nobody looks, and a name-suffix test is a spelling check, not a type check.

## Done when

One canonical home table and placement judgment cover every workspace package and declaration kind, with discriminating controls. Retire duplicate placement policies only with successor evidence; preserve hard non-placement claims. Newly covered findings have owned repairs without new allowances. Section 7.4 names the actual native and semantic enforcers.

## Evidence

The component-home ruling preserves co-located UI and client prop APIs with canonical native and data derivation. Reviewed source `91ad8df309` integrates canonical factory aliases and exported origins. Reviewed source `8cc8687587` centralizes default-content and plugin-toolchain contracts and activates bounded native placement. Public APIs and generated support bytes remain unchanged. Native controls, affected behavior and compiler checks pass; root retains unrelated diagnostics.

Reviewed source `f8dadcb165` consolidates ordinary declaration ownership without changing findings or authority. Source `409ce2229e` proves native component and supporting origins; unrelated utility members remain unqualified. Source `582da2c7d1` relocates inference contracts without changing runtime statements or public names. Effective native syntax replaces only covered direct declarations; local exports, schemas and generated omissions retain custom ownership. Source `185e81b083` preserves complete finding assertions with typed sorting. Complete-owner evidence supports the attributable package-interface budget shrink; SandboxLimits remains a real unwaived finding. Generated admission, complete package coverage, lower-data derivation and production repairs remain open. Preserve hard non-placement claims.

Reviewed source `cc8afb0622` delivers registered native component context, stable render origins and same-owner supporting imports. Erased generics and forged foreign views refuse. Native and coupled controls pass. Ordinary callers retain their findings; UI activation remains off. Substituted members, schema effects, external render calls and non-render API owners remain unqualified.
