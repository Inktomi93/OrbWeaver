# root-config — reviewed

package.json, pnpm-workspace.yaml, the seven root tsconfigs, .editorconfig, .gitattributes,
.env.example.

## Sweeps and reads

Read in full. `.editorconfig` matches `biome.json` (2/160/lf confirmed at `biome.json:36-38`).
`pnpm format:docs` reports 0/625 to fix. `tsc --showConfig` / `--listFiles` used to resolve the
`packages/*/*` include semantics (thirteen depth-2 files, zero `src` or `dist`; five
`packages/server/dist/router-types/*.d.ts` enter via imports). `pnpm typecheck` exit 0.
Suites that read these files (`comment-path-citations.repo.int.test.ts`,
`root-development-dependencies.test.ts`, `node-heap.int.test.ts`, `jscpd-config.test.ts`) pass.

## Findings

- \[P2] `pnpm-workspace.yaml:169-171` (pre-sweep) — the undici comment claimed the package is
  "Mirrored into root devDependencies" and named the SSRF dispatcher tripwire as
  `tests/legacy/server/infra/network/dispatcher-contract.suite.int.test.ts`. Both false:
  `package.json:78-162` has no undici (`node -e import('undici')` fails from root), `tests/legacy/`
  does not exist in the repo (removed by `821e8f8dff`), and the suite lives only in the
  reference-only pile `orbweaver-legacy-tests-2026-10-21`. The global-dispatcher handoff the comment
  itself calls "A SECURITY BUG, NOT A CHORE" if it silently breaks has no in-repo tripwire.
  `tests/tooling/root-development-dependencies.test.ts` passes and does not name undici.
  Direction: port the tripwire into `tests/server/infra/network/`, re-declare undici at root for it.
  Covered: `rg undici package.json`, `rg -l dispatcher-contract|setGlobalDispatcher tests/
  packages/` (only `infra/network/egress.ts` consumes the dispatcher), legacy-pile listing.
- \[P2] `tests/tooling/doc/comment-path-citations.repo.int.test.ts:16` — `SCANNED_ROOTS` is
  `["packages","tooling","tests"]`, so root configs and `scripts/` are never read and their comments
  may cite deleted files forever — the exact rot found and cleaned in `pnpm-workspace.yaml`.
  `HASH_COMMENT_EXTS` already handles `.yaml`, so adding the roots is a set edit, not a parser edit.
- \[P2] `pnpm-workspace.yaml` inference block (pre-sweep) — the catalog says every provider bump
  "re-runs the wire-capture byte pins under
  `tests/legacy/inference/backends/{anthropic-messages,openai-compat}/chat.test.ts` before it is
  trusted", but those suites exist only in the reference-only legacy pile; no in-repo suite holds
  the per-transport byte pins. The brace in the path would also read as a prose pattern even to the
  citation gate. Porting the byte-pin suites is open work, together with the undici tripwire.
- \[P3] `package.json:9` — `engines.node` floor is `>=26.3.0` while `@types/node` is `^26.6.5`;
  code may typecheck against 26.4-26.6-only APIs and fail at runtime on a floor-legal Node.
  `devEngines` downloads 26.11.1 for pnpm-aware users, so this bites bare `node` and CI matrices.
  Raise the floor to the types floor.
- \[P3] FIXED — `pnpm-workspace.yaml` stale pin rationales: the `lucide-react` comment argued
  against `.23` at a `^1.22` pin that now reads `^1.61.0`; the `vite` comment argued `^8.1.2` at a
  `^8.3.5` pin. Deleted with the rest of the dig.
- \[P3] FIXED — `tsconfig.node.json` `"packages/*/*"` relied, undocumented, on wildcard include
  patterns matching files only (thirteen depth-2 files; `src`/`dist` enter via imports). Now
  carries its one-line comment.
- \[P3] FIXED — the whole chunk was swept against `.claude/rules/comments.md`: dates, issue-number
  citations, inventory counts, "docs said" comparisons, "was transitive" history voice, a banned
  `load-bearing`, and the `tsconfig.base.json` incremental incident narrative (kept: the trap, the
  re-enable proof, the `tsBuildInfoFile` warning). Dead cites repointed:
  `proposed/ui-package-design.md` → `docs/law/ui-package-design.md`;
  `tests/tooling/snap/ops/lighthouse.int.test.ts` → `tests/tooling/snap/ops/arms/`.

Retracted during the unit: `@sentry/node` packageExtensions looked dead; they are live
(27 lockfile mentions — the first grep ate the pattern with `rg -r`'s replacement flag).

## Program thesis after phase 0 (carry forward, re-derive if contradicted)

Code has gates; prose does not. Four dead-reference findings in the first unit, all one crime:
structure moved (D333 legacy retirement, suite renames) and the sentences pointing at it went
false silently. In a repo whose design is that prose is the memory, stale prose is false memory,
not a nit. Two of four were security tripwires (SSRF dispatcher, provider byte-pins) — now
unpinned in-repo. Expect more wherever prose references moved structure: run the
`rg tests/legacy` axis on every unit, and distrust any comment citing a path the citation gate
cannot see. Secondary worry for phase 2: the enforcement layer's debt instruments
("a bump must port it", 40+ version-keyed patches) pay out only if the bumper reads them.
