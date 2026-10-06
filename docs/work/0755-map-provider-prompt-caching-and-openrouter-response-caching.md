---
kind: work
status: open
updated: 2026-10-06
priority: P2
area: inference
---

# Map provider prompt caching and OpenRouter response caching controls

## What

Read each provider's OpenRouter caching details and its direct API documentation. Separate implicit caching, explicit prefix controls, routing affinity and complete response replay. Implement supported controls through existing configuration and request paths. Preserve prompt placement, provider precedence and fresh generation. Normalize reported usage and free response hits into canonical accounting and provenance. Direct Gemini uses automatic implicit caching. Managed cached-content resources are outside the alpha scope.

Verify successive turns through real persisted chats on OpenRouter and direct routes. Cover one human with one character, two humans with one character, and multiple humans with multiple characters. Include consecutive human messages and consecutive character turns. Test conversation chunking, shaping, Default and Always naming, and each permitted merge setting above the family's required minimum.

## Why

Provider prefix caching and complete response replay have different controls, token semantics and billing. Silent adapter drops prevent truthful support claims.

## Done when

A closed provider and endpoint matrix cites primary documentation and installed transport evidence. It records requested and effective naming, merge, shaping and cache settings. Real chat cases prove prefix reuse, changed-prefix behavior, identical-response replay and fresh-output bypass on OpenRouter and direct routes. Report actual provider, outbound ordering, cache reads and writes, generation identity and billed usage. Unsupported modes and required settings remain explicit. Response hits retain reported billable zero without fabricated counts or duplicate costs. Applicable behavioral, rendered, compiler and repository checks pass. Independent reviews clear required findings.

## Evidence

Implementation is integrated in `fc9074aa6b534c3e4bdfad76af8dffe2c03a3e9f`. Independent security and rendered reviews cleared required findings. Integrated affected tests and the staged static check passed. The representative live calls and scripted chat matrix remain separate evidence under `scripts/probes/caching/`. Combined accounting integration remains required. The owner deferred additional paid live qualification because of cost. Do not describe scripted variations as individually live-proven. The item remains open.
