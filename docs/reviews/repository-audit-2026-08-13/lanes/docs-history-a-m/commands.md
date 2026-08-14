# docs-history-a-m command receipt

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`.

| Command / method | Result | Scope / notes |
| - | - | - |
| `git -C /home/inktomi/inktomi-stack/development/orbweaver rev-parse HEAD` | `dab3c8440f23ee23883897e446fe80e3838c9b29` | Assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`; this lane is a rolling working-tree audit. |
| Assignment reconciliation (`wc -l -c`, `sha256sum`) | 8 / 8 match | 5,487 lines; 393,536 bytes; zero owned-byte drift before or after analysis. |
| Full-read barrier (`sed -n '1,$p'`) | completed | All eight owned historical documents, including comments and retained original reports. |
| Shared prerequisites | completed | Read project instructions, audit controls, Mission, Core-0, TypeScript and Testing spines, and `scripts/codemods/ast.ts`; `.Codex/rules/orchestration.md` is absent in this checkout. |
| `pnpm ast` | exit 0 | Read the repository-supported structural lenses and scan-ledger semantics before current-code checks. |
| `pnpm ast ident HomeTileContribution --in packages/client/src --max 30` | exit 0; 31 hits in 15 files, 30 displayed | Current-code R3 spot check. Scan ledger: 933 scanned (`ts:429`, `tsx:503`, `dts:1`), 3,865 excluded by `--in`; output partial only because display cap hid one hit. |
| Full reads: `packages/client/src/main.tsx`, `features/home/lib/home-section.tsx`, `features/home/surfaces/home-surface.tsx` | completed | Establishes current door assembly and home factory/host details used for the precise HOME status check. |
| `pnpm ast ident StreamRoomRef --in packages --max 30` | exit 0; 52 hits in 12 files, 30 displayed | Current-code R3 spot check for the historical SSE record. Scan ledger: 2,741 scanned (`ts:2134`, `tsx:605`, `dts:2`), 2,057 excluded; partial display only. |
| `pnpm ast ident RPG_GAME_MODES --in packages --max 30` | exit 0; 14 hits in 6 files | Current-code R3 spot check for the lite/full provenance. Scan ledger: 2,741 scanned; 2,057 excluded; complete. |
| Full reads: `packages/contracts/src/rpg/enums.ts`, `packages/db/src/schema/rpg.ts` | completed | Confirms the mode tuple is contract-homed and its DB CHECK derives from it. |
| Read-only local Markdown-target scan | 8 documents; 2 relative targets; 2 broken | Both broken targets are in `baseui-crunch.md`; external URLs and fragment validity excluded. The intended active-core files exist at their root-relative locations. |
| `pnpm check:docs` | exit 0: `104 file(s) formatted` | Formatter check only; it does not validate local link targets or whether historical status metadata is current. |

## Tool failures and limits

- No command tool failures used as evidence.
- AST hit lists capped by `--max` are marked partial in their own scan ledgers; they support only the positive exact-symbol checks stated above, not absence claims.
- Tests examined/run: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. This history-doc lane did not change executable behavior; behavioral suites remain with source-owning lanes.
