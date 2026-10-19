# 1041 shard s1-sec-principal-brand-1 (round 4)

Outcome: `entry-synthetic-role-is-user`, `one-principal-mint-population` and `turn-identity` are retired. Rounds 2 and 3 (`450f1f94e0`, `4c192427f3`) were applied onto current main and redone in one commit. Round 3 was refuted because its fixed-depth selectors missed a class `accessor` field and a literal under more than six wrappers. This round replaces those selectors with hand-written rules that walk without a depth bound, registers each mint site per function instead of per file, and moves the Principal rules to the HARD profile.

## Successors

- Type: `Principal` extends a `declare class PrincipalMint { private readonly principalMint: true }` (`packages/contracts/src/identity/index.ts`). A literal, a spread of a minted Principal and a `satisfies` check fail tsc (TS2741). The only constructor is the cast in `packages/server/src/entry/auth/principal-mint.ts` (`mintPrincipal`).
- dependency-cruiser `principal-mint-owners`: only `entry/auth/seam.ts` and `entry/compose/chat.ts` import `principal-mint.ts`.
- HARD ESLint, `PRINCIPAL_RULES` in `eslint.config.js`, emitted only by `hardConfig` (`eslint-hard.config.js`, run with `--no-inline-config`), scope `@server` + `@inference`:
  - `orb/principal-literal`: an object literal that a Principal position's value can be built from. Positions: an annotated binding, a parameter default, a class field (`PropertyDefinition`, `AccessorProperty`, and the two abstract kinds), a return inside a function whose own return type is `Principal`, and an arrow body. The walk follows `as`, `satisfies`, `<T>`, `!`, instantiation, chain, `await`, assignment, conditional, logical, sequence, binary left, member object, call callee and tag, with no depth bound. It also refuses `Object.assign`. No file is exempt.
  - `orb/principal-assertion`: an `as`, `<T>` or `satisfies` whose type names `Principal` anywhere. Exempt only inside `mintPrincipal` in `principal-mint.ts`.
  - `orb/principal-return-site`: a function, method, arrow or overload whose return type is a bare `Principal`. Exempt only for the registered functions `PRINCIPAL_RETURN_SITES`: `mintPrincipal`, `principalFromRow` (seam.ts) and `hostPrincipal` (chat.ts).
  - `orb/principal-mint-site` (new): any identifier, computed member, string import name or re-export naming `mintPrincipal` outside the registered callers `PRINCIPAL_MINT_CALLERS`: `resolveCookiePrincipal`, `resolveHeaderOrFallbackPrincipal`, `principalFromRow`, `hostPrincipal`. A plain import is left to dependency-cruiser. A callback nested inside a registered site is not exempt.
  - `orb/principal-synthetic-role`: a literal carrying `externalId`, `via` and `role: "user"` outside `entry/**`.
  - `orb/principal-brand-launder`: any `as never` / `<never>`, and an object literal under two casts anywhere in an unbounded wrapper chain.
- Ordinary ESLint `orb/turn-identity-principal` (engine): any import or export specifier named `Principal`, `ns.Principal`, `import("…").Principal`. `orb/turn-identity-name` (already on main) owns the lowercase binding.

## Verifier findings answered

| Finding | Fix | Durable rows |
| - | - | - |
| `accessor held: Principal = { ...caller, userId: victim } as typeof caller` passes (ESTree `AccessorProperty`) | `principal-literal` lists `AccessorProperty` and the abstract kinds; abstract fields with an initializer already fail tsc (TS1267, probe below) | "accessor field forge", "accessor field role demotion", "static accessor field" |
| 7 wrappers with one cast pass (`satisfies object` ×6, `!!!!!!`) | the value walk has no depth bound; `principal-brand-launder` counts casts over an unbounded chain | "seven wrappers and one cast", "six non-null layers and one cast", "twelve mixed wrappers in a return", "eight wrappers and two casts at a call" |
| Pattern 2 matched any initializer that starts with `{` | the walk follows the leading-`{` positions too (member object, call callee, binary left, conditional test, sequence first, tag) | "member read of a literal", "conditional branch", "logical fallback", "sequence and assignment", "awaited literal in an async return" |
| Round 3 recorded "non-literal returns in the seam and bridge homes" as lost while two waived sites hit that arm | per-function registry; seam.ts and chat.ts are no longer file homes | "a new return site in the request seam", "a new return site in the host bridge", "mint call in a new seam function", "the registered Principal site is live and earned" ×5 |
| The successor of a HARD gate ran in the ordinary (suppressible) profile | all six Principal rules run only in `hardConfig` | "the Principal construction rules run only in the hard profile" ×4, "an inline directive cannot excuse a forged Principal" |

## entry-synthetic-role-is-user

- Verdict: done. Authority was hard; the successors are HARD.
- Parity: 2 mustFlag / 4 mustPass ported, 0 lost. Rows: "retired policy row: synthetic …" in `tests/tooling/native-principal-boundary.test.ts`.
  - Arm (a), the five-field shape: `principal-synthetic-role`, same `entry/**` exclusion.
  - Arm (b), the annotation walk (As/Satisfies of any type, paren, return, block, up to 5 hops, to a `Principal` VariableDeclaration, PropertyDeclaration or return type): `principal-literal` covers every one of those positions, including `accessor` fields, through any number of wrappers, and inside `entry/` too. An `as`/`satisfies` naming `Principal` goes to `principal-assertion`.
- Lost claim: none.
- Deleted: `tooling/src/verify/gates/entry-synthetic-role-is-user.ts`; its arm in `tests/tooling/verify/gates/_liveness/product-db-server.ts`; its cases in `tests/tooling/verify/gates/principal-serde-family.suite.test.ts`.
- Waivers and grants: none (hard gate).

## one-principal-mint-population

- Verdict: done.
- Parity: 3 mustFlag / 3 mustPass ported, 0 lost. The mustPass row for a waived `entry/auth` arrow is inverted on purpose: the waiver door is gone and a new site is refused.
- Pattern mapping: 1 (`: Principal =>`) and 3 (`): Principal {`) go to `principal-return-site`; 2 (`: Principal = {`) to `principal-literal`; 4 and 5 (`satisfies`/`as Principal`) to `principal-assertion`, which is wider (`Principal[]`, `| null`, `Promise<Principal>`).
- Live census of the five regexes, `rg --type ts` over `packages/server/src` and `packages/inference/src` (2019 files): 4 code lines, `entry/compose/chat.ts:319`, `entry/auth/principal-mint.ts:6-7` and `entry/auth/seam.ts:255`. All belong to registered functions. One more hit, `domain/imagery/contract/service.ts:138`, is a comment the gate blanked.
- Regex text matches that are not mint sites, and so not carried over: the same spellings inside a string, an import or export renamed `as Principal`, and an object pattern on the left of an assignment initializer (`= {a} = x`, whose value is `x`). Census over the same 2019 files: 0 live occurrences.
- Lost claim: none.
- Deleted: the gate file, its `_liveness/product-db-server.ts` arm, its family-suite cases, and its row in `tooling/src/verify/lib/waiver-budget.ts`.
- Waivers rejudged:
  - `entry/auth/seam.ts` above `principalFromRow`: home. It is now a row in `PRINCIPAL_RETURN_SITES` and `PRINCIPAL_MINT_CALLERS`, and the earned-site test proves it still returns a Principal and calls the mint.
  - `entry/compose/chat.ts` above `hostPrincipal`: home, the same two tables.
  - The gate file's own fixture marker went with the gate.

## turn-identity

- Verdict: done.
- Parity: 4 mustFlag / 5 mustPass ported, 0 lost. Two mustPass rows are inverted on purpose and are now refused: a foreign same-named `Principal`, and the waived shim. This is stricter; the engine has 0 `Principal` code references today (`rg` over its 12 files: 2 comment hits).
- Deleted: the gate file, its `_liveness/server-app.ts` arm, its row in `origin-server-family.suite.test.ts`, its fixture and assertions in `native-sealed-reference-delivery.int.test.ts`, and its mention in the `discovery-no-stats-rollups.ts` family comment. `lib/sealed-origin.ts` and `floor/code-facts/reference-fact.ts` stay: other gates import every helper it used.
- Waivers: 2 fixture markers (the gate's own mustPass row and the sealed-reference fixture), both removed with their hosts.

## Evidence

- Red first, round 3's rules: `pnpm test:scoped tests/tooling/native-principal-boundary.test.ts` exit 1, 36 failed / 119 passed. Every new flag row failed, including all the verifier's spellings.
- Red, hard blocks removed (`PRINCIPAL_RULES.filter(() => false)` in `hardConfig`): exit 1, 92 failed / 63 passed, every retired mustFlag port included. Restored.
- Green: 155/155.
- Real hard door, `env -C <wt> pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config` on a planted `domain/chat/verbs/pb3-plant-verb.ts` and a function appended to `entry/auth/seam.ts`: exit 1, 11 errors. `principal-literal` fired at verb lines 5 (6 `satisfies` + cast), 6 (6 `!` + cast), 9 (accessor userId forge), 10 (accessor role demotion), 11 (plain field control) and 13 (member read). `principal-return-site` fired at 14, `principal-synthetic-role` at 15. In seam.ts, `principal-return-site` fired at 438, and `principal-mint-site` and `principal-assertion` at 439.
- Ordinary door, `pnpm exec eslint` on a planted `domain/chat/engine/pb3-plant-engine.ts` (`import type { Principal as Caller } from "@orb/contracts"`): exit 1, `orb/turn-identity-principal` at 1:15.
- The plants were removed; `git status --short` lists none.
- Live sweep, the six Principal rules from the effective hard profile, untyped, over 2019 tracked server and inference files: 0 findings, 0 fatal. With the plants present, the same sweep reported exactly the 11 plant lines.
- Named tests, `pnpm test:scoped`, serially:
  - `tests/tooling/native-turn-identity-boundary.test.ts`: 21/21.
  - `origin-server-family.suite.test.ts` + `principal-serde-family.suite.test.ts`: 4/4.
  - `tests/tooling/verify/ops/native-sealed-reference-delivery.int.test.ts`: 8/8.
  - `tests/tooling/dependency-cruiser.int.test.ts`: 14 failed / 113 passed; `principal-mint-owners` passes. With main's `.dependency-cruiser.cjs` and test swapped in, the same 14 rows fail (14 / 112; identical failure list: role-data, chat-engine-authority-context, entry-wiring, query-wiring, client-persisted fixtures). Inherited, not this shard.
  - `tests/server/entry/auth/identity-placement.int.test.ts` (real composition root): the frozen-host and fallback case, which mints through `principalFromRow`, passes. The forward-header case fails (`authenticated: false`) and fails identically with main's `seam.ts` and `compose/chat.ts` swapped in. Inherited, not this shard.
- `flock heavy.lock env -C <wt> pnpm typecheck --config packages/server/tsconfig.json`: exit 0, PASS, run last.
- `pnpm exec biome check <19 changed code files> --diagnostic-level=error`: clean.
- `pnpm check:agents`: 3 findings, all dead links from `docs/plans/test-foundation/design.md` to untracked `reports/review` files absent from a worktree; none in the edited law doc. `pnpm check:docs`: clean.
- Standalone tsc probe of the exact brand (`pnpm exec tsc --ignoreConfig --strict`): TS2741 on a spread under another user id, a five-field literal, an unannotated spread at a call and a `satisfies`; TS1267 on an abstract accessor with an initializer. It accepts the accessor cast, six `satisfies` plus a cast, a member read of a literal and `as never` at a call. The HARD rules own those four.

## Security assumptions

- Threat: developer error or a shortcut in server or inference code, caught by tsc, the HARD profile or review. It is not a hostile committer: every lint rule is keyed by name or shape.
- The brand cannot refuse an `any` value, an `Object.assign` intersection or an assertion. Biome `noExplicitAny` and `noImplicitAny` cover `any`; `principal-literal` refuses `Object.assign`; the assertion and launder rules cover assertions that name `Principal` or `never`, or stack two casts.
- Residue that neither retired gate caught, so it is not a parity loss: a single assertion to a type that resolves to Principal without naming it, at an unannotated site or under a non-exact annotation. Examples are `actAs({ ...caller, userId: victim } as typeof caller)`, an alias `type Caller = Principal`, and `const p: Principal | null = { ... } as typeof caller`. The sound control is typed `@typescript-eslint/no-unsafe-type-assertion` over `@server`/`@inference` (board candidate below).
- A non-literal `any` value in a Principal binding (`const p: Principal = anyRow`) is accepted, as it was by both gates.
- D1/D40: the construction points are unchanged in behaviour. The seam's three request paths and the row mapper, plus the bridge's host floor, are the only `mintPrincipal` callers. The role still comes from the users row (D135), and `tests/server/entry/auth/identity-placement.int.test.ts` drives that through the real composition root. D118 subscription placement is untouched.

## Owed to primary

- `pnpm lint:eslint-scoped` (eslint.config.js changed) and the full HARD profile run.
- Typecheck of the programs not run here: `tsconfig.json` (it holds `tests/server/entry/auth/principal-mint.test-d.ts` and `scripts/generate-seed-vectors.ts`), `packages/contracts/tsconfig.json`, `packages/inference/tsconfig.json`, `tooling/tsconfig.json`, `tsconfig.tests-dom.json`, `tsconfig.tests-legacy.json`. Also `pnpm test:scoped tests/server/entry/auth/principal-mint.test-d.ts`, which builds the root program.
- `tsconfig.tests-legacy.json` stays red: the brand turns each legacy Principal literal into a type error (about 57 files). Item 1093 owns the legacy Principal ruling; primary decides the merge.
- `check:structure --check compose-wiring-only`: its `principalFromRow` carve-out expects a returned object literal. On main it already rejects the `captureUserRole("user")` default, so this change should not move its verdict, but it was not run.
- Two inherited reds found on main, not caused here: the forward-header case of `tests/server/entry/auth/identity-placement.int.test.ts` (the real seam answers `authenticated: false` for a trusted-proxy header request), and 14 fixture rows of `tests/tooling/dependency-cruiser.int.test.ts`. Board candidates.
- Whole `pnpm depcruise`, the real-corpus liveness families after the arm removals, and the `docs/law/Core-Enforcement-Active-Gates.md` regeneration (rows still name the three retired ids).

## Board candidate

- Title: typed assertion soundness for server Principal handling.
- What: enable `@typescript-eslint/no-unsafe-type-assertion` for `@server`/`@inference`, or a narrower typed check on assertions whose target is assignable to Principal.
- Why: a single assertion to a non-`Principal` spelling of the type (`as typeof caller`, an alias) forges a Principal past the brand and every name-keyed rule.
- Done: a planted `actAs({ ...caller, userId: victim } as typeof caller)` in a domain verb is refused by the real door, and the live single-literal assertions are fixed or carry a reason.
