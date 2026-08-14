# Command receipts

Snapshot assignment: `41e18afe74afa570b67a3e670a1a38863c486a00`; current `HEAD` at close: `189f2c71e76e16f947f6de7dd35634d7bffc9c0c`.

| Command | Scope / result | Duration / exit |
| - | - | - |
| `pnpm ast` | Bare instrument discovery; printed the supported lenses and audit-epilogue contract. | 2.0s / 0 |
| `pnpm ast apisurface packages/ui/src/primitives --in /primitives/ --public --max 400` | Typed structural lens started for the primitive tree. The command host yielded at 30s; process polling confirmed it advanced through the requested typed lenses, but its detached stdout was unavailable. This is a tool-output capture failure, not a clean result; it is not used for a finding. | >30s / completion output unavailable |
| `pnpm ast orphans …`, `testonly …`, `prodonly …` | Same detached-output capture failure after the broad typed lens. No negative consumer/reachability conclusion relies on them. | >30s each / completion output unavailable |
| `pnpm ast ident onEndApproach|scrollToIndex|fadeEdge --in tests/ui/primitives/virtual-list --max 50` | Narrow structural test-scope lenses; same 30s host-yield capture failure. The independent literal check below and full-read receipt are the evidence for the test-quality finding. | >30s each / completion output unavailable |
| `rg -n --glob '*.tsx' 'onEndApproach|scrollToIndex|fadeEdge' tests/ui/primitives/virtual-list packages/ui/src/primitives/virtual-list` | Two-file declared scope: all 18 literal occurrences were in the source; none in the two mirrored test files. | 0.2s / 0 |
| `pnpm test:ct <22 owned .ct.tsx paths>` | Exact native CT invocation, no extra `--`; 188 passed, 0 failed, 0 flaky, 0 skipped. Canonical `reports/ct-results/.last-run.json`, `reports/ct-flaky.json`, and `reports/ct-report.json` inspected immediately. | 17.2s / 0 |
| receipt recomputation (`wc -l`, `wc -c`, `sha256sum`) | 96/96 assigned paths; 6,491/6,491 lines; 315,361/315,361 bytes. Current values match both assignment and receipt. | 1.1s / 0 |

No AST command reached a five-minute timeout; the only tool failures were the host's 30-second detached-output capture behavior above. No scope entered zero files. No test command had a nonzero exit. The CT run emitted pre-existing Vite/esbuild `es2025` target warnings but completed with the canonical all-pass result.
