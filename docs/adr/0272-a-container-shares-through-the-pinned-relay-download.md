---
kind: adr
status: active
updated: 2026-09-26
---

# A container shares through the pinned relay download

## Context

A share needs a relay, and the Docker image carries none. Two shapes supply one outside the bare-metal path: a quick-tunnel sidecar container whose hostname the app reads from cloudflared's metrics endpoint, and a cloudflared binary built into the image. The owner ruled out both.

## Decision

A container shares on the same path as bare metal. Start sharing, and a SHARE_RELAY=quick boot start, download the release CLOUDFLARED_PIN names, check its size and sha256, and run it from the data layout's relay slot (cache/relay under DATA_DIR). The binary survives a container restart in the data volume, and a later start downloads nothing. No share precondition reads whether the process runs in a container, and SHARE_REFUSALS has no container member. The image carries no relay binary, and no compose overlay runs a relay for sharing. The pin covers linux-x64 and linux-arm64, the two architectures the image builds on, and a pin move keeps both.

Homes: packages/server/src/domain/share/substrate/refusal.ts, packages/server/src/entry/lifecycle.ts, packages/server/src/infra/relay/pin.ts, packages/server/src/foundation/data-layout/index.ts. Enforcers: tests/server/entry/lifecycle-share-container.suite.int.test.ts, tests/server/domain/share/substrate/refusal.test.ts, tests/server/infra/relay/pin.test.ts.

## Consequences

The first share from a container needs outbound HTTPS to the pin's download hosts. The relay runs from the data volume, so a volume mounted noexec cannot share: the relay process fails to start and the Share card shows the relay down. The named-tunnel overlay docker/compose.cloudflared.yaml stays as the recipe for a lasting address on the owner's own hostname; it is not a share path. The Share status carries no standing refusal, because every remaining standing refusal is the sign-in mode the card already reads.

## Alternatives rejected

A quick-tunnel sidecar that the app reads through cloudflared's /quicktunnel metrics endpoint: a second container to run and a second code path for one feature. cloudflared baked into the image: every image carries the binary whether or not anyone shares, and the pin would move in two places.
