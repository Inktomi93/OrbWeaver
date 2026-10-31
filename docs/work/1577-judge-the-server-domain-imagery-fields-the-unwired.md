---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/imagery fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/imagery`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GenerateImageResolveParams.task` | `server/src/domain/imagery/contract/generation-ops.ts:9` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/image-provider-ops.ts:17`) |
| `ImageGenerateRequest.model` | `server/src/domain/imagery/contract/service.ts:79` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:60`) |
| `ImageGenerateRequest.prompt` | `server/src/domain/imagery/contract/service.ts:80` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:62`) |
| `ImageGenerateRequest.owner` | `server/src/domain/imagery/contract/service.ts:82` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:61`) |
| `ImageGenerateRequest.n` | `server/src/domain/imagery/contract/service.ts:83` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:63`) |
| `ImageGenerateRequest.systemPrompt` | `server/src/domain/imagery/contract/service.ts:84` | unreferenced | delete | delete the field |
| `ImageGenerateRequest.negativePrompt` | `server/src/domain/imagery/contract/service.ts:86` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/generate-picture.ts:238`) |
| `ImageGenerateRequest.size` | `server/src/domain/imagery/contract/service.ts:88` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:65`) |
| `ImageGenerateRequest.edit` | `server/src/domain/imagery/contract/service.ts:89` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:66`) |
| `ImageGenerateRequest.capability` | `server/src/domain/imagery/contract/service.ts:94` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/edit-image.ts:69`) |
| `AvatarReference.references` | `server/src/domain/imagery/verbs/generate-picture.ts:41` | never-written | delete | delete the field and the branch that reads its default at `server/src/domain/imagery/verbs/generate-picture.ts:82` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
