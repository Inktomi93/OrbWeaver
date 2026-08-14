# Commands and results — docs-vendor-vite-rest

Working-tree basis: `906d7aa125130e1c4691a7097c6725d8d31d113d`. Assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

## Receipt and scope

```sh
git rev-parse HEAD
git diff --name-only -- docs/vendor/vite
sed -n '1,180p' docs/reviews/repository-audit-2026-08-13/lanes/docs-vendor-vite-rest/assignment.txt
for each assigned OWNED path: wc -l -c; sha256sum
```

Result: `20/20` assigned documents reconcile exactly: `2860/2860` lines and `117196/117196` bytes; all 20 SHA-256 values match `assignment.txt`. The scoped diff printed no owned Vite document. The resulting values are in `read-receipt.tsv`.

The required project/audit instructions and every owned document were read in full before searching. The requested `.Codex/rules/orchestration.md` was absent; the extant `.claude/rules/orchestration.md` was read instead. It explicitly says a subagent should ignore its orchestration policy and perform its assigned task.

## Local relevance and version checks

```sh
rg -n '^\s*vite:' pnpm-workspace.yaml
nl -ba packages/client/package.json | sed -n '42,50p'
nl -ba packages/client/vite.config.ts | sed -n '1,12p;80,90p;153,210p;225,285p;280,350p'
pnpm --filter @orb/client exec vite --version
pnpm why vite --recursive --depth 0
```

Results: workspace catalog pins `vite: ^8.1.2` at `pnpm-workspace.yaml:252`; the client declares catalog Vite and React-plugin dependencies at `packages/client/package.json:45-49`; installed client executable reports `vite/8.1.2 linux-x64 node-v26.5.0`. `pnpm why` reports Vite 8.1.2 for `@orb/client` and a separate Playwright CT dependency on Vite 6.4.3. This establishes only local dependency/config relevance, not that vendored reference prose proves application behavior.

## AST consumer checks

```sh
pnpm ast
pnpm ast importers vite --max 100
pnpm ast refs devCspMirror --max 20
```

`pnpm ast` completed and printed the repository tool contract. `importers vite` returned `974` hits in `956` files with `status=partial` (broad textual/identifier noise, including unrelated `invite`); it is not evidence. The targeted `refs devCspMirror` scan was complete: definition at `packages/client/vite.config.ts:85`, reference at `packages/client/vite.config.ts:198`, 2 hits in 1 file, `4922` typed files scanned and 0 skipped. This is an R3 configuration/wiring receipt only.

## Documentation checks and offline-link inventory

```sh
pnpm check:docs
node -e '<read each owned Markdown file; extract Markdown links; ignore http(s)/mailto; count root-relative targets and literal relative paths that do not exist as repository files>'
rg -n --glob '!docs/vendor/vite/**' 'docs/vendor/vite|vite\.dev/llms\.txt|Vite docs mirror|fetch.*vite|vite@8\.2\.1' .
```

`pnpm check:docs` passed: `check:docs — 104 file(s) formatted` (3.5s). It is a formatting check, not a link, provenance, or freshness check.

The offline inventory found `255` Markdown links across the 20 owned pages: `73` root-relative Vite-site links and `38` relative links, of which `31` do not resolve literally as local files. Examples include `docs/vendor/vite/config/preview-options.md:11`, `docs/vendor/vite/guide.md:10`, and `docs/vendor/vite/plugins.md:7`. This does not test hosted Vite-site routing or external availability.

The scoped producer search found the mirror declaration/index and audit artifacts but no runnable/documented refresh producer outside the vendored directory. This is bounded current-tree evidence, not a claim about git history or unavailable external tooling.

Command/tool failures: 0. The broad AST command was completed but deliberately excluded as partial/noisy evidence.
