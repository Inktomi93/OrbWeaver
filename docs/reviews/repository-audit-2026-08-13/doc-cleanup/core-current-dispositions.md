---
kind: history
status: active
updated: 2026-08-14
---

# Core current-document dispositions

| id | disposition | current path:line | change or reason | verification receipt |
| - | - | - | - | - |
| DCL-01 | fixed | `docs/architecture/core/Core-Laws-and-Precedents.md:58` | Registry redirect now includes D137. | `Core-Path-Registry.md:7,502` |
| DCL-02 | needs-owner | `docs/architecture/core/Documentation-Law.md:142` | The stated size ceiling conflicts with `Core-Audits-and-Debt.md`; `Core-Enforcement-Active-Gates.md` is fenced to its live owner. Owner must rule permanent exceptions versus a split. | `wc -c` shows 69,665 B and 147,926 B respectively. |
| DCL-03 | fixed | `docs/architecture/core/Documentation-Law.md:128` | Taxonomy now names the workboard as active and Mission as the root-level exception. | `AGENTS.md:78,301`; `docs/Mission.md:1` |
| DCL-04 | fixed | `docs/architecture/core/Core-Audits-and-Debt.md:11` | Deleted the contradicted frozen clean-list; the live registry now requires a tree re-sweep. | Rider at `Core-Audits-and-Debt.md:9` |
| DOCS-CORE-SPINES-01 | fixed | `docs/architecture/core/Spine-Config-and-Serialization.md:23` | Effective-config inventory is 25 fields, including the three omitted structured/cache fields. | `packages/contracts/src/settings/index.ts:1141-1167` |
| DOCS-CORE-SPINES-02 | fixed | `docs/architecture/core/Tier-3b-Providers.md:9,23-54` | Removed purged backend and override paths from active inventory/layout; design record remains D67/D68. | `BACKEND_KEYS` source and provider tree |
| DOCS-CORE-UI-01 | fixed | `docs/architecture/core/UI-Architecture-and-Layout.md:11,17` | Current-program pointers now route to the workboard; theming law no longer delegates live mechanics to the parked set. | `AGENTS.md:78,301` |
| DOCS-CORE-UI-02 | fixed | `docs/architecture/core/client-architecture-lockdown.md:670` | Removed volatile gate count; Active-Gates remains its one authoritative inventory. | `Core-Enforcement-Active-Gates.md:146,282` |
| DOCS-CORE-UI-03 | fixed | `docs/architecture/core/ui-package-design.md:181-185` | Seed rows and generated `[data-theme]` blocks are documented as parallel outputs. | `packages/ui/tokens.build.ts:211-232`; `theme.css:221-250` |
| DOC-CUR-03 | fixed | `docs/architecture/Context-Panel-Program.md:60,119,128` | Separates build-gated normal-chat tracker data from shipped HUD mechanics. | `Core-Path-Registry.md:321`; `rpg-hud-region.tsx:16,27` |
| AM-01 | fixed | `docs/reviews/misc/2026-08-03-archive-rescue-audit.md:64` | CA-10 now records the current unused-placeholder source state. | `packages/contracts/src/index.ts:1` |
| AM-02 | needs-owner | `docs/reviews/misc/2026-07-25-buried-knobs-audit-wip.md:1` | Existing frontmatter schema cannot truthfully classify all mixed review records as historical/current/superseded; owner must define the review disposition convention. | Audit denominator: 11 of 14 records lack provenance. |
| DOCREV-NZ-01 | needs-owner | `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md:1-14` | Do not mass-rewrite dated findings; owner must define machine-legible review disposition/current-authority links. | `stale-session.ts:1-29`; `query-client.ts:56-71` |
