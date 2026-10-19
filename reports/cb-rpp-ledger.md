# cb-rpp ledger

Item 1062. Commit trailer: Closes: 1062.

Surveys: codegraph_explore (runPolicyPass nativeTypeFacts nativeTypeContextAbsent analysis types isolatedTypeFacts); rg 253 non-syntax analysis declarations (172 types, 81 resource); ast-grep -l ts runPolicyPass: 285 calls in 158 files (tsx 0) over 5302 ts + 723 tsx files under tests and tooling.
Mechanism: tooling/src/verify/lib/policy-pass.ts:48-52, policy-pass-context.ts:189-200 (the refusal fires only when a policy or fact CALLS a ctx.nativeTypes method with no context, so a types declaration alone is not a defect).

Oracle: scratchpad cb-rpp-vitest.config.ts + cb-rpp-oracle-setup.ts (outside the repo) wrap runPolicyPass and log every pass whose toolErrors or factErrors carry the refusal. Run with pnpm exec vitest run <files> --config=<scratch config>.

Read in full: policy-pass.ts, policy-pass-context.ts:180-279, owner-scoped-reads.ts, native-drizzle.ts (testkit), css-length-contract-family, css-variable-resolution-family, no-tailwind-dark-variant.int, test-world-browser-contracts.repo.int, identity-enforcement.repo.int, compose-wiring-only, ct-config-mirror-parity, native-sealed-reference-delivery tail, native-clone-export-delivery tail.
