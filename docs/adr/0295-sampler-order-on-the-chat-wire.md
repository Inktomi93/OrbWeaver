---
kind: adr
status: active
updated: 2026-10-03
---

# Sampler order on the chat wire

## Context

D47 put "sampler-ordering" out of scope beside the text-completion backends (Horde, NAI, Kobold's native API, instruct mode, CFG). Local servers reached through the chat-completions wire also take a sampler order: llama.cpp reads `samplers` and KoboldCpp reads `sampler_order` on their OpenAI routes. The users who run local models tune that order with their other samplers. The owner ruled it in for the chat wire.

## Decision

D47's sampler-ordering clause covers the text-completion backends only. On the chat wire, a preset may carry a sampler order, and it rides to any server whose capability states one.

- The stage vocabulary is `SAMPLER_STAGES` in `packages/contracts/src/inference/capability/generation.ts`. A preset stores `samplerOrder` as a list of stages, each at most once.
- A server's capability states `sampling.samplerOrder`: the stages it can order, in its own default order. The curated rows for local servers live in `packages/inference/src/capability/sources/curated/local-servers.ts`.
- The order sent is `completeSamplerOrder` in `packages/contracts/src/inference/capability/reads.ts`: the preset's stages that the server orders, in the preset's order, then the server's other stages in its default order. A preset therefore never switches a sampler off by leaving its stage out. The funnel drops the stages the server cannot order with a `sampling_knob_dropped` warning naming `samplerOrder`. The editor shows the same completed order.
- A provider row names the order vocabulary its server reads (`features.samplerOrder`); `SAMPLER_ORDER_TOKENS` in `packages/contracts/src/inference/features.ts` holds each vocabulary's body key and stage tokens. Code never branches on a server name. The spelling seam is `packages/inference/src/backends/openai-compat/sampling.ts`.
- The preset editor shows the order control only where the target capability states `samplerOrder`.

## Consequences

- A new orderable server that reads a known vocabulary is a row: a curated `samplerOrder` list and a `features.samplerOrder` name. A new vocabulary is one `SAMPLER_ORDER_TOKENS` entry.
- A preset written against one server keeps its order on another. Stages the second server cannot order are dropped with a warning, and stages it can order but the preset omits run after the listed ones.
- D47 stands for the text-completion backends.

## Alternatives rejected

- Keep D47 whole: the local-server audience could not set an order their servers accept on the wire we already use.
- One order format per server in code: it would branch on server names, which a row spelling avoids.
