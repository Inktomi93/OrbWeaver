---
kind: adr
status: active
updated: 2026-09-23
---

# a theme's raw CUSTOM CSS field is footgun-allowed and deliberately bypasses the legibility engine

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled 2026-08-18, verbatim: *"if they are using custom css then let them footgun — i don't want to constrain creativity."* The \[\[D144]] ink clamps and the derive laws govern the STRUCTURED theme fields only — token pickers and overrides, where the engine can reason about polarity. The free-text field is bounded by LENGTH alone (`THEME_CSS_MAX`, `@orb/contracts/theme`) and by nothing else; extending a clamp, a contrast correction or a legibility rewrite into it is the defect this row refuses. Enforcer: owner-ruled, prose-enforced (the contract's length cap is the only mechanical bound, and that is deliberate).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
