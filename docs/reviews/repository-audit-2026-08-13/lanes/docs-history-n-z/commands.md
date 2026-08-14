# docs-history-n-z command log

Working tree: `/home/inktomi/inktomi-stack/development/orbweaver`

## Read and snapshot reconciliation

```sh
awk -F '\t' '$1=="OWNED" {print $2 "\t" $3 "\t" $4 "\t" $5}' assignment.txt
while IFS=$'\t' read -r expected_lines expected_bytes expected_hash path; do
  actual_lines=$(wc -l < "$path")
  actual_bytes=$(wc -c < "$path")
  actual_hash=$(sha256sum "$path" | awk '{print $1}')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$expected_lines" "$actual_lines" "$expected_bytes" "$actual_bytes" "$expected_hash" "$actual_hash"
done
```

Result: 45 assigned owned files; 17,237 lines; 1,513,652 bytes; 0 line/byte/SHA-256 mismatches before analysis. Every owned file was read in full before analysis. Final reconciliation after analysis again found 0 / 45 mismatches.

```sh
git -C /home/inktomi/inktomi-stack/development/orbweaver rev-parse HEAD
git -C /home/inktomi/inktomi-stack/development/orbweaver status --short -- docs/history
```

Result: working-tree basis `dab3c8440f23ee23883897e446fe80e3838c9b29`; 0 dirty assigned `docs/history` paths.

## Repository structural instrument

```sh
sed -n '1,4099p' scripts/codemods/ast.ts
pnpm ast
```

Result: completed in 1.3s, exit 0. The bare command documented the repository-owned resolved-symbol lenses and their scan-count epilogue. No direct AST source query was needed for the archive-only findings; source-code absence was not inferred from history text.

## Local-link audit

A read-only Node resolver inspected every Markdown link in all 45 owned files. It excluded external, mailto, and fragment-only references; local targets were resolved against the source file’s directory.

```sh
node --input-type=module <local-link-resolver>
rg -n '\\]\\((docs/history/)?history/(retro-workboard-2026-08-03|retro-workboard-2026-08-07|retro-workboard-2026-08-08|dogfood-tracking-2026-08-08)\\.md\\)' docs/history/retro-workboard-2026-08-{08,09}.md
for target in docs/history/{retro-workboard-2026-08-03.md,retro-workboard-2026-08-07.md,retro-workboard-2026-08-08.md,dogfood-tracking-2026-08-08.md} docs/history/history/{retro-workboard-2026-08-03.md,retro-workboard-2026-08-07.md,retro-workboard-2026-08-08.md,dogfood-tracking-2026-08-08.md}; do
  test -e "$target" && printf 'EXISTS\t%s\n' "$target" || printf 'MISSING\t%s\n' "$target"
done
```

Result: 10 genuine local-target misses, all in `retro-workboard-2026-08-08.md` (4) and `retro-workboard-2026-08-09.md` (6). Four intended `docs/history/<file>` targets exist; the corresponding `docs/history/history/<file>` resolutions do not. No negative source-code claim was made.

## Metadata and documentation checks

```sh
rg -n -U '^---\\nkind: review\\nstatus: active' \
  docs/history/reviews/misc/2026-08-03-archive-rescue-audit-final.md \
  docs/history/reviews/misc/2026-08-03-archive-rescue-audit-tail.md \
  docs/history/reviews/misc/2026-08-07-narrator-live-drive.md \
  docs/history/reviews/stickler/2026-08-03-state-anchor-rows.md
pnpm check:docs <all 45 owned paths>
```

Result: four historical review files carry `status: active`. `pnpm check:docs` completed in 2.0s with exit 1, reporting 41 unformatted owned files and 4 formatted files. This is an advisory formatter result, not a behavioral or link-integrity receipt.

## Scope and failures

- Structural scan coverage: N/A for source code; no source structural claim was made. The repository instrument was run bare successfully.
- Local-link coverage: 45/45 owned Markdown files; 10 real misses. Excluded external URLs, mailto links, and fragment-only links.
- Tests examined: unit 0; integration 0; contract 0; CT 0; e2e 0; type 0.
- Commands with tool failure: 1 — `pnpm check:docs` exit 1, canonical stdout read in full; it reported formatting violations, not a broken checker.
- Long-running AST commands: none. Bare `pnpm ast`: 1.3s, completed.
