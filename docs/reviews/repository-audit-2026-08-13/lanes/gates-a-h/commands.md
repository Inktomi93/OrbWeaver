# Command receipts — gates-a-h

Working-tree basis: current bytes. The 61 owned rows matched `assignment.txt` exactly: 17,895 text lines, 871,889 bytes, and all SHA-256 values. `README.md` is a shared prerequisite and intentionally drifted from its assigned hash: assigned `82036ce740936cdeffaecc9a67bb4f953f4b5ebbd64daac0b63b205504a22afd`, current `738833fde2717dfb3bd6cd1f8bc436a327ca2dc773787a93752480516ced062b` (the final synthesis-reader line).

| Command | Result / receipt |
| - | - |
| Full-read barrier: `sed -n '1,$p'` for every OWNED path, then `wc` + `sha256sum` | 61/61 files; 17,895/17,895 lines; 871,889/871,889 bytes; 0 hash drift. Receipt: `read-receipt.tsv`. |
| `sed -n '1,4099p' scripts/codemods/ast.ts` | Complete: 4,099 lines, 223,111 bytes. |
| `pnpm ast` | Exit 0 in 1.5s. Instrument exposes `refs`, `callers`, `importers`, `exports`, `jsx`, `ident`, and resolution-based lenses; no gate-specific scan-count lens exists. |
| `pnpm ast exports scripts/check/gates --max 200` | Exit 0 in 8.9s. It found the `gate` export in every assigned TypeScript gate (58 descriptors); the three remaining assigned files are JSON data artifacts. This is declaration evidence only. |
| `pnpm check:structure` | Final clean run: exit 0, 68.7s elapsed after polling; all 58 assigned active descriptor names printed `✓` and the full 200-gate pass ended `single-pass: clean`. No source/test/config was changed. |
| `pnpm vitest run tests/tooling/gate-conformance.int.test.ts tests/tooling/check-gates.int.test.ts` | Initial run: `gate-conformance` passed (2 tests, 8.9s), including “every contract-form gate's mustFlag/mustPass proofs hold”; `check-gates` could not spawn its `find` cleanup helper under the sandbox (`EPERM`). Tool failure, not a gate finding. |
| `pnpm vitest run tests/tooling/check-gates.int.test.ts` (approved unsandboxed rerun) | Exit 0 in 145.3s: 3/3 tests passed — non-trivial registry derivation, every registered structural gate fires on fixture, every active gate file is run by `report.ts`. This is the live-registration and positive-control receipt. |
| `jq` on both owned baselines | `density-tier.baseline.json`: 46 files / 226 budgeted sites. `finding-overload-provenance.baseline.json`: 24 files / 52 budgeted sites. |
| Final `reports/check-structure.json` inspection | `ok: true`, `total: 0`, `toolErrors: []`, and 58 assigned TypeScript descriptors present. The schema exposes no per-gate scanned/skipped-file count. |

The harness’s current run prints gate names and violations, but not each predicate’s matched-file denominator or excluded-file count. The report does not treat a green zero as proof of a complete denominator.
