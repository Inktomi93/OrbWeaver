# Command receipts — docs-design-a-f

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against the current working tree. No command modified production source, tests, configuration, or an assigned document.

## Snapshot and receipt recheck

```sh
sha256sum docs/design/actions-tab-information-architecture.md docs/design/boot-loader-smoothness-options.md docs/design/config-ia-the-junk-drawer-problem.md docs/design/config-rail-spec.md docs/design/containerize-build-plan.md docs/design/containerize-prod-image-spec.md docs/design/context-panel-fidelity-findings.md docs/design/databank-surface-spec.md docs/design/default-character-roster.md docs/design/demo-seeding-rebuild.md docs/design/density-pass-spec.md docs/design/docker-modern-practices-research.md docs/design/draft-trust-render-policy-seam.md docs/design/event-bus-coverage-survey.md
wc -l -c docs/design/actions-tab-information-architecture.md docs/design/boot-loader-smoothness-options.md docs/design/config-ia-the-junk-drawer-problem.md docs/design/config-rail-spec.md docs/design/containerize-build-plan.md docs/design/containerize-prod-image-spec.md docs/design/context-panel-fidelity-findings.md docs/design/databank-surface-spec.md docs/design/default-character-roster.md docs/design/demo-seeding-rebuild.md docs/design/density-pass-spec.md docs/design/docker-modern-practices-research.md docs/design/draft-trust-render-policy-seam.md docs/design/event-bus-coverage-survey.md
```

Result: all 14 hashes matched `assignment.txt`; total `5487` lines and `413160` bytes.

## Required AST-tool preflight

```sh
pnpm ast
```

Result: exit 0; printed the repository-supported AST search verbs and usage. `scripts/codemods/ast.ts` was fully read before this preflight and all structural queries below.

## Structural reachability

```sh
pnpm ast importers packages/client/src/features/databank
```

Result: `44 hit(s) in 16 file(s)`, including `packages/client/src/main.tsx:61` and Databank CT/support imports.

```sh
pnpm ast importers packages/client/src/features/config
```

Result: `17 hit(s) in 10 file(s)`, including `packages/client/src/main.tsx:59`.

```sh
pnpm ast importers packages/client/src/features/preset
```

Result: `171 hit(s) in 61 file(s)` (auto-collapsed), including the named Actions view and its CT file.

```sh
pnpm ast refs usePreviewRenderPolicy --in packages/client/src
```

Result: `5 hit(s) in 3 file(s)`: the hook definition plus production consumers in `character-hero-band.tsx` and `character-editor-surface.tsx`.

```sh
pnpm ast refs SegmentBar --in packages/client/src
```

Result: `2 hit(s) in 1 file(s)`: import and JSX use in `features/chat/components/assembly-preview-panel.tsx`.

```sh
pnpm ast refs DEFAULT_CHARACTER_CARDS --in packages/server
```

Result: `7 hit(s) in 4 file(s)`: definition, public re-exports, and the seeder’s imports/uses.

```sh
pnpm ast ident WELCOME_ASSISTANT_HANDLE
```

Result: `24 hit(s) in 8 file(s)`, including seeder code and seed contract/integration tests.

```sh
pnpm ast ident VLLM_ENGINE_HOST --in packages/server
```

Result: `3 hit(s) in 3 file(s)`: env schema, egress, and engine URL.

```sh
pnpm ast ident AutomationBusEvent
```

Result: exit 0 with no identifier-hit output. This command is not a string-literal emitter proof, so it was not used as a negative conclusion.

## Exact-literal and artifact cross-checks

```sh
rg -n --glob '*.{ts,tsx}' 'AutomationBusEvent|rulesChanged' packages tests scripts | sed -n '1,160p'
```

Result: the `rulesChanged` discriminant appears in `packages/contracts/src/automation/index.ts:347` and transport commentary; no server emit literal appeared in the reported corpus. This corroborates, but does not independently prove, the survey’s negative claim.

```sh
rg --files -g 'Dockerfile' -g 'docker-compose.y*ml' -g 'entrypoint.sh' -g '.dockerignore'
```

Result:

```text
.dockerignore
docker-compose.yaml
Dockerfile
docker/entrypoint.sh
```

## Safe formatting and behavioral checks

```sh
pnpm check:docs
```

Result: exit 0 — `check:docs — 104 file(s) formatted`.

```sh
pnpm exec vitest run tests/contracts/chat/roster.contract.test.ts
```

Result: exit 0 — 1 contract file / 15 tests passed; type errors: none.

```sh
pnpm exec vitest run tests/server/domain/character/seeder/seed.int.test.ts
```

Result: exit 0 — 1 integration file / 8 tests passed; type errors: none.

## Source receipts read after structural targeting

```sh
nl -ba packages/client/src/main.tsx | sed -n '208,265p'
nl -ba packages/client/src/features/databank/index.ts | sed -n '1,30p'
nl -ba packages/client/src/features/character/hooks/use-preview-render-policy.ts | sed -n '1,45p'
nl -ba packages/client/src/features/chat/components/assembly-preview-panel.tsx | sed -n '128,145p'
nl -ba packages/server/src/domain/character/seeder/cards.ts | sed -n '20,100p'
nl -ba packages/server/src/domain/character/seeder/seed.ts | sed -n '65,90p'
nl -ba packages/server/src/domain/character/seeder/seed.ts | sed -n '166,195p'
```

These reads established the exact `path:line` receipts cited in `report.md`; no visual-fidelity inference was drawn from code presence.
