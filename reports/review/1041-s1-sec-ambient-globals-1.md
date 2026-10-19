# 1041 s1-sec-ambient-globals-1: raw egress, sole env reader, scrubber home

## Outcome

- `no-raw-egress`: done. Native `orb/no-raw-egress` plus `orb/no-raw-http-client`, a composed-root behavioural test, gate and scaffolding deleted.
- `sole-env-reader`: done. Native `orb/sole-env-reader`, the composed-root role-policy test, gate and scaffolding deleted.
- `scrubber-home`: escalate. Native `orb/scrubber-home` and a composed-root behavioural test landed; the gate, its grant, its budget row and its liveness arm stay, so both enforce.

The rules live in `AMBIENT_GLOBAL_RESTRICTIONS` in `eslint.config.js`. The durable native suite is `tests/tooling/verify/ops/ambient-globals-native.suite.test.ts` (173 cases).

This is a fresh redo from main: the two earlier commits were cherry-picked without committing, conflicts resolved against main, and the round-3 finding fixed on top. One commit.

## Round 4 (item 1104): the declare-shadow arm

The round-3 verifier refuted both done gates with one root cause: `ambientReferences` and `unknowableValue` treated any binding with a definition as proven-local, so a TypeScript `declare var fetch` or `declare var process` (no emitted code, still the global at run time) passed. The old gates flagged `declare var fetch` (e04), `declare var process` (d03) and `declare let process: any` (d04).

- Fix: `declaredOnly` and `isGlobalBinding` in `eslint.config.js`. A binding declared only with `declare`, in any scope, is the global; its value references are judged as ambient, and an `env` read off any other declared name fails closed like a global declared elsewhere.
- Red first: 9 new suite rows failed on the cherry-picked rules (183 cases, 9 failed); green 183/183. Stronger than the old gates: `declare const fetch`, `declare function fetch`, `declare const globalThis` and `declare const process` now flag too; the old gates missed them.
- Changed row: "env pass: static member path receiver" moved from a `declare const o` receiver to a parameter receiver. A declared `o` is a global declared elsewhere and now fails closed.
- Real door: the verifier's two plants replayed. `role-policy.ts` with `declare var process` reports `48:35 orb/sole-env-reader`; `services.ts:921` with `declare var fetch` reports `921:95 orb/no-raw-egress`. Abuse path still live without the lint: role-policy-config 4/27 red (late-arrival got `admin`), scrape-web 4/4 red. Restored by byte copy, hashes matched.
- Parity replay at main (old gate modules imported from a main extraction, rows linted with the worktree config): egress 8/8 mustFlag and 7/7 mustPass kept; env 16/17 mustFlag kept (lost mustFlag[0], the TDZ alias cycle) and 8/10 mustPass kept (mustPass[7] and [8] are the deliberate fail-closed inversions). Losses are stated in the rule header's NOT CLAIMED paragraph, with the home grain.
- Const-key gap (item 1145): the egress rule and the env rule's process and global-root arms fail closed on any computed key, so `globalThis[K]` and `process[K]` flag. The env rule's imported-value arm does not resolve a const key: `processDoor[K]` with `const K = "env"` passes. The old gate missed the run-time-key form too.
- Census: forced on over 2019 server and inference files, 15 findings, all in the three homes. `ast-grep` `ambient_declaration` over the same roots: 2 `declare const ... unique symbol` brands, neither a door; no `.tsx` files exist there.

## Round 3: verifier finding addressed

P1, `sole-env-reader`: cross-module process laundering. The old gate resolved an `env` read through another module's exports, so `export const processDoor = process` in `@orb/db` followed by `processDoor.env["OIDC_ADMIN_GROUPS"]` in `role-policy.ts` was flagged; the native rule judged only direct `node:process` imports and passed it.

The fix is fail-closed, because a one-file rule cannot read another module's exports:

- Every value imported from any module other than `node:process`/`process` is followed through aliases, members (static or run-time keyed), destructures (object, array, nested, rest, assignment) and reassignments. An `env` key read on it, at any depth, is a finding. A static or computed dynamic import, awaited directly or through a stored promise, is followed the same way.
- An `await` is a value wrapper (`await x` denotes `x`'s value or its resolution), so a stored `import()` promise and `(await globalThis).fetch` are followed.
- A template-literal dynamic import of `node:process` is reported like a string one (old-gate row x4). The same `staticSource` reader closes `import(\`undici\`)` and `import(\`node:https\`)` in the egress rules.
- An `env` read whose static path is rooted at a global declared outside the file fails closed (old-gate row x33: `globalThis.procDoor = process` in another module, then `procDoor.env.X`). A member of `globalThis` other than `process` or a nested root is judged as an imported value.

Old-gate differential. The deleted gate was restored as a scratch module and run through `verifyPolicyProofs` with 33 cross-module rows; the native rule was run over the same rows' server files with the repo config.

- Old gate flags 18: x01 kit re-export of the default, x02 kit exported alias, x04 template dynamic import, x07 namespace member, x08 namespace destructure, x09 `env` destructure, x12 third-party declaration re-export, x13 two-hop re-export, x16 kit export of `globalThis.process`, x17 kit local alias re-export, x18 bracket `env`, x21 kit namespace export, x22 alias of the import, x24 renamed `env` destructure, x27 and x28 server re-exports, x30 stored dynamic import, x33 global member assignment.
- The native rule flags all 18, plus x03, x06, x20, x25, x26 and x32 (old-gate misses), plus the control c01 (a project module's own `env` settings object), which now fails closed.
- Missed by both, not lost claims: x05 an import copied into an object literal, x10/x11/x23 a module exporting the bag itself (`bag.A` names no `env` key), x14 `import proc = require("node:process")`, x19 a run-time key `proc[k]`, x29 a helper's return value bound to a `const`, x31 a `.then` callback parameter.

## Round 3 checks

- Durable suite red first: with the cherry-picked rules swapped back in, 24 of 173 cases failed (every new must-flag row except three the prior fail-closed arms already caught: a run-time namespace member, an assignment destructure and an awaited `process`; plus four former pass rows that now fail closed: old mustPass[7] and mustPass[8], and the two literal-dynamic-import rows the earlier rounds added); the fixed rules restored by byte copy (sha256 `fde9ab48…2b35`), 173/173.
- Live tree: `orb/sole-env-reader`, `orb/no-raw-egress` and `orb/no-raw-http-client` forced on every tracked `.ts`/`.tsx` file under `packages/server/src` and `packages/inference/src` (2018 files, 0 `.tsx`): 15 findings, all in the three homes (12 in `foundation/env/index.ts`, 2 in `infra/network/egress.ts`, 1 in `infra/network/tls-terminator.ts`), which the config exempts. Second method: `ast-grep run -l ts -p '$X.env'` over the same roots has 50 matches in 10 files, 38 in 9 files outside the home; receivers are `frame` 16, `mod` 11, `deps` 3, `input` 3, `spec` 2, `ctx.deps` 1, `kernel` 1, `c` 1, all parameters or locals, none imported; `-l tsx` has 0.
- Real door, `sole-env-reader`, the verifier's exact counterexample: `import process from "node:process"; export const processDoor = process;` appended to `packages/db/src/client/backup-names.ts`, and `role-policy.ts` importing `processDoor` from `@orb/db/backup-names` with `roleFor` returning `intersects(groups, csv(processDoor.env["OIDC_ADMIN_GROUPS"])) ? "admin" : "user"`. `pnpm exec eslint` on both files: exit 1, `49:35 error ... orb/sole-env-reader`. `ORB_ENV_NO_FILE=1 pnpm test:scoped tests/server/domain/sessions/role-policy-config.int.test.ts`: 4/27 red, including the late-arrival case (got `admin`). Restored by byte copy: `backup-names.ts` sha256 `2fa63079…7ce3`, `role-policy.ts` `38cc9d6e…7b5d`, both matched; clean run 27/27.
- Real door, `no-raw-egress`: `packages/server/src/entry/compose/services.ts:921` planted as `fetchWebDocument: async (url: string): Promise<Uint8Array> => new Uint8Array(await (await (await globalThis).fetch(url)).arrayBuffer()),`. `pnpm exec eslint --format json`: exit 1, `921:95 orb/no-raw-egress` (plus `await-thenable` and the entry-only `no-restricted-globals` on that line; the file's 116 `orb/server-factory-tier-reference` findings are present without the plant). `pnpm test:scoped tests/server/domain/databank/verbs/scrape/scrape-web.int.test.ts`: 4/4 red, "the ambient global fetch was reached". Restored by byte copy, sha256 `6149e209…d01f` matched.
- Real door, `scrubber-home` (native rule): `import { createHiddenSpanStreamScrubber as coldScrubberFactory } from "@orb/kit/content"; export const coldScrubber = coldScrubberFactory();` appended to `packages/server/src/domain/chat/verbs/read.ts`. `pnpm exec eslint` exit 1, `1820:10 orb/scrubber-home`. Restored by byte copy, sha256 `5df0d166…1ff6` matched.
- Typecheck: `flock <heavy.lock> env -C <wt> pnpm typecheck --config tsconfig.json` exits 1 on three errors, `tests/legacy/inference/_support.ts:201` (TS2322), `tests/legacy/server/domain/embeddings/_support.ts:300` and `tests/legacy/server/domain/search/_support.ts:296` (TS2554). This change edits none of those files and no product source; the errors are argument-count and missing-property mismatches against product signatures it does not touch. Not reproduced on a clean main (one typecheck per shard).

## no-raw-egress

- Successor: `rawEgressRule`, scope `@server` and `@inference`. It reports an ambient `fetch`, a member or run-time key of `globalThis`/`global`/`self`/`window` (through aliases, casts, `await`, sequences, destructures, reassignments and nested roots), an import or re-export bound as `fetch`, any value import, re-export or static dynamic import (string or template) of `undici`/`node-fetch`/`cross-fetch`, an export, array copy, object-property copy or object-spread copy of a global root, and reads of a local `fetch` reassigned with an unfollowable value. `rawHttpClientRule` reports client doors of node `http`/`https` (`request`, `get`) and `http2` (`connect`), including default and namespace imports, re-exports and static dynamic imports.
- Homes: `infra/network/egress.ts` for `no-raw-egress` (former grant `no-raw-egress:egress-hop`); `infra/network/tls-terminator.ts` for `no-raw-http-client` only. Both are held live by the durable home test.
- Parity: 8 mustFlag / 7 mustPass ported, 0 lost.
- Lost claim: none. The reviewed-grant STALE alarm moved to the durable home test.
- Missed by both old and new: a global root passed as a call argument (including `Reflect.get(globalThis, "fetch")`), returned from a helper, used as a parameter default or picked by a conditional; a computed dynamic-import specifier; `fetch` or a global root re-exported from a non-server package (verifier rows y1-y3). Not in either claim: `WebSocket`, `EventSource`, `node:net`/`node:tls` sockets, `undici` subpath imports.
- Behavioural test: `tests/server/domain/databank/verbs/scrape/scrape-web.int.test.ts`.

## sole-env-reader

- Successor: `soleEnvReaderRule`, scope `@server` and `@inference`. It follows the real `process` (ambient, `globalThis.process` through nested roots, a default import of `node:process`/`process`, and the `default` member of a namespace import) through aliases, casts, `await`, sequences and assignments, and reports a member read of `env` or a run-time key, a destructure that can take `env`, a named `env` import, a static dynamic import, a value re-export of the module's default or `env`, and an export or copy of the process. It fails closed on an `env` key read off an imported value, a dynamic import, a global declared elsewhere, a call, `new`, awaited, conditional, logical, sequence or element-indexed receiver, or a binding reassigned with such a value.
- Home: `packages/server/src/foundation/env/index.ts`, held live by the durable home test. The five former grants all named this file and are rejudged to one home.
- Parity: 16 mustFlag / 10 mustPass ported, 1 lost (mustFlag[0]). Two mustPass rows are inverted to fail closed, a tightening: mustPass[7] (a project module's default export carrying its own `env` object) and mustPass[8] (a trusted lookalike global `procezz.env`). A one-file rule cannot read the other module or declaration, so it refuses rather than passes; the live census above finds no site of either shape.
- Lost claims, each with no live population:
  - mustFlag[0]: a written alias cycle with no `process` origin (`const left = right; const right = left; left.env.X = 1;`), which throws in its temporal dead zone at load.
  - Checker-typed fail-closure on a declared receiver the checker cannot type (`declare const o: any; o.inner.env.X`). D328 partial coverage.
- Census for the lost claims: the old gate was `reviewed-grant` at `error`, so every live finding needed a grant; at main it had exactly 5 grants, all with subject `packages/server/src/foundation/env/index.ts`, and `rg --count-matches -F '@orb-waive sole-env-reader' .` finds 0. The native rule over 2018 files finds 0 outside the home. `ast-grep run -l ts -p '$A.$B.env'` over `packages/server/src` and `packages/inference/src` has 1 match, `packages/inference/src/resolve/availability.ts:58` `ctx.deps.env`, a typed `InferenceDeps` member the old gate passed. `ast-grep` for `import * as $N from "node:process"` and `"process"`: 0.
- Behavioural test: `tests/server/domain/sessions/role-policy-config.int.test.ts`, case "an identity first seen after a late process-environment admin grant is provisioned from the composed policy".

## scrubber-home (escalate)

- Successor: selector row, scope `@product`. It refuses the factory name as an import (identifier or string name), re-export, member read (dotted, literal or template) and destructure key. Home: `domain/chat/substrate/member-visibility.ts`, held live by the durable home test.
- Parity: 5 mustFlag / 4 mustPass ported, 0 lost. mustPass[3], a same-named factory from a non-kit module, is now refused by name.
- Behavioural test: `tests/server/domain/chat/substrate/member-visibility.int.test.ts`.
- Escalation reason: `tests/tooling/verify/ops/structure-corpus.suite.int.test.ts` binds this gate and its grant (`scrubber-home:member-visibility-stamp`) as the structure CLI's reviewed-grant representative, and `native-sealed-reference-delivery.int.test.ts` and `native-export-home-delivery.int.test.ts` use it as a sealed-reference consumer. Primary picks the new representative; then the gate, grant, budget row, liveness arm and family entry go. Removing the factory from the public `@orb/kit/content` export needs an exports-map change a worktree typecheck cannot prove.


## Owed to primary

- A clean-main typecheck of `tsconfig.json` to confirm the three legacy errors are inherited.
- `pnpm lint:eslint-scoped` on the changed files.
- `tests/tooling/verify/gates/tooling-plumbing-family.suite.test.ts` (whole-checkout program; covers the `_proof/node-types.ts` edit).
- The real-corpus liveness runner for `_liveness/product-db-server.ts`.
- The structure-corpus and delivery-suite rebind, then deletion of `scrubber-home`.
- Regeneration of `docs/law/Core-Enforcement-Active-Gates.md`.
- Board item: `WebSocket`, `EventSource`, `node:net`/`node:tls` and `undici` subpath imports are in neither egress claim.
