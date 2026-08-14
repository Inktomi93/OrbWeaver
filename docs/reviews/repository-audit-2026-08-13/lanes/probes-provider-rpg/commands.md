# Command receipt — probes-provider-rpg

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`; frozen assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

## Read and snapshot barrier

| Command | Exit / duration | Result |
| - | - | - |
| Assignment reconciliation: `wc -l -c` and `sha256sum` over every owned row | 0 / <1s | All 39 current SHA-256 values and all 481,657 bytes match. The frozen logical-line total is 7,571. `wc -l` reports 7,567 because four JSON artifacts lack a terminal newline. |
| Full sequential `sed -n '1,$p'` reads | 0 / <1s | Read every assigned file before analysis: 20 TypeScript, 6 Markdown, 11 JSON/JSONL, and 2 ignore files. |
| Full reads of shared prerequisites | 0 / <1s | Read `AGENTS.md`, mission, architecture/type/testing spines, the 4,099-line AST instrument, and all five audit controls. |
| `pnpm ast --help` | 0 / 1.7s | Confirmed the repository-native structural-search contract before scans. |

## Structural and literal receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `pnpm ast exports scripts/probes/openrouter --files`; same for `rpg-extraction` | 0 / 30.3s | Both report 0 files: standalone scripts are outside this instrument's workspace project. This is a tool limitation, not an absence claim. |
| `pnpm ast ident OPENROUTER_API_KEY --in scripts/probes --files` | 0 / 20.3s | 0 files for the same standalone-script exclusion. No negative conclusion is credited. |
| `rg -n '/home/inktomi/inktomi-stack/development/orbweaver'` over both corpus roots | 0 / <1s | Eight matching TypeScript files; exact receipts are reported in PPR-01. Scan denominator: 20 assigned TypeScript files, 0 excluded by `rg`. |
| `rg -n 'OPENROUTER_API_KEY|ANTHROPIC_API_KEY|CARD_DRY|process.env|dotenv|loadEnv'` | 0 / <1s | Cross-checked key-loading and no-spend controls across the same 20 TypeScript files. |
| `rg --files ... -g '*.test.ts' -g '*.int.test.ts' -g '*.contract.test.ts' -g '*.test-d.ts'`; independent `find` equivalent | 0 / <1s each | 0 owned test files by both methods. This only establishes the assigned-corpus denominator; it does not claim repository-wide test absence. |

## Behavioral receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `CARD_DRY=1 CARD_ARMS=A node scripts/probes/rpg-extraction/card-teach-probe.ts` | 0 / 0.4s | Executed the explicitly documented no-spend branch. It assembled and printed arm A's card-teach injection, then exited before `runArm` or any write/network path. |

No paid OpenRouter/Anthropic command was run: the owned READMEs explicitly price those commands and the local checkout can supply credentials. No local vLLM probe was run because no existing local service configuration was proven. These are bounded current-live-proof gaps, not product failures. No command had a tool failure. The three AST calls above were the only long structural commands; all returned completed output, with no timeout.
