---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/user-admin parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/user-admin`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AdminOverrideSelect.#0.disabled` | `client/src/features/user-admin/components/admin-override-field.tsx:133` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `write.partial.corpusAutoindex` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.importSkipCharacters` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.logLevel` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.forbidExternalMedia` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.trustHtml` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.allowInteractiveCards` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.memoryDefaults` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.rateLimits` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.maxImageBytes` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.maxDatabankBytes` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptTransformDeadlineMs` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.catalogRefreshIntervalMs` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.imageVariantQuality` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.privateEndpointAllowlist` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.ipCertificate` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptCacheMinDepth` | `client/src/features/user-admin/components/governance-sections.tsx:84` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.corpusAutoindex` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.importSkipCharacters` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.logLevel` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.memoryDefaults` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.rateLimits` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.maxDatabankBytes` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptTransformDeadlineMs` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.catalogRefreshIntervalMs` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.imageVariantQuality` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.privateEndpointAllowlist` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.localMultiUser` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.discreetLogin` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.ipCertificate` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptCacheMinDepth` | `client/src/features/user-admin/components/media-trust-section.tsx:90` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.importSkipCharacters` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.forbidExternalMedia` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.trustHtml` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.allowInteractiveCards` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.memoryDefaults` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.rateLimits` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.maxImageBytes` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.maxDatabankBytes` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptTransformDeadlineMs` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.catalogRefreshIntervalMs` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.imageVariantQuality` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.privateEndpointAllowlist` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.localMultiUser` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.discreetLogin` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.ipCertificate` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |
| `write.partial.promptCacheMinDepth` | `client/src/features/user-admin/components/operations-section.tsx:58` | unsupplied-prop | delete (read) | `write` forwards one `AppSettings` key per call: narrow its parameter to the keys its callers pass (`Pick<AppSettings, …>`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
