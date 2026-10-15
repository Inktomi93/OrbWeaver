---
kind: adr
status: active
updated: 2026-10-15
---

# Native protocol time stays native in scripted test edges

## Context

Frozen product time cannot satisfy native token freshness checks against current protocol time. Replacing verification with expanded tolerances or global clock interception changes the behavior being tested.

## Decision

Native libraries own current timestamp defaults for signed external-protocol test inputs and their verification. Use their maintained timestamp APIs in `tests/support/node/oidc-issuer.ts`. Preserve malformed, omitted and explicitly overridden claims for native refusal tests. Business data clocks and IDs remain injected. A protocol constructor, path or callback type does not authorize ambient helper reads. Keep native signature, issuer, audience and expiry checks intact. [Spine-Testing](../law/Spine-Testing.md) section 3 owns this test-edge boundary.

## Consequences

Scripted issuers retain real protocol freshness without changing production authentication. Testkit determinism continues to reject direct ambient business and helper reads. Native claim defaults do not repair deliberately malformed or missing inputs.

## Alternatives rejected

Coherent protocol-clock injection requires changes across native OpenID and JOSE paths and is not required for this test edge. Broad exceptions would admit nondeterministic business data.
