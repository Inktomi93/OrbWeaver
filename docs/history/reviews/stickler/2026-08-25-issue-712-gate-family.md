---
kind: review
status: archived
updated: 2026-08-30
---

# Stickler review — issue #712 gate-family substrate

Reviewed detached commit `625f9b5f7ae13627cbb4046a4e5b8176bfb3a5c4` in an isolated worktree against
`99603e98320453e1575c503ab17834d4bf359687..625f9b5f7`. Scope was the E1–E8 implementation named by issue
#712: tenancy write/upsert aliasing, the world-info regex seam, public mutating-body caps and their product
migrations, the QuickJS dump guard, E5/E6 inventories, E7 census honesty, the review mirror, active-gate
registry, and planted proof.

Verdict: **REFUTED — eight confirmed findings, severity ceiling P1.** The reviewed canonical E2/E4 product
seams are safe and the active registry/planted-proof wiring is live (there was no E1 product-code migration in
this diff), but multiple new descriptors accept unsafe counterexamples. The card-frame migration also rejects
a schema-valid request, and E7 can remove genuinely unresolved controls from its stated review residual.

## Confirmed findings

### P1 — `tooling/src/verify/lib/tenancy-read.ts:20` — E1 resolves import aliases but silently loses local symbol aliases

`ownerScopedTableBinding` accepts a direct owner-table identifier, a definition whose *name* is an owner-table
identifier, or an import specifier; it never follows a local variable initializer (`const table = characters`)
back to the imported owner-scoped table (`tooling/src/verify/lib/tenancy-read.ts:20-31`). Both owning gates
then treat an unresolved target as out of scope and return without a finding
(`tooling/src/verify/gates/owner-scoped-writes.ts:94-98`,
`tooling/src/verify/gates/owner-scoped-upserts.ts:119-123`).

Failure scenario: a persistence refactor introduces `const table = characters`, then performs
`db.update(table)...where(eq(table.id, callerId))` or an ownerless-target
`db.insert(table)...onConflictDoUpdate(...)`. The active E1 gates report zero even though the same
cross-tenant overwrite/delete/collision described by their registry rows remains possible.

Evidence produced this session: `pnpm tsx reports/stickler/scratch/issue-712-adversarial-probes.ts` ran the
real descriptors through `verifyGateProofs`. The local-alias write and local-alias upsert probes each expected
one finding and each got zero. This directly contradicts the authored design's promise to resolve aliased
bindings through the TypeScript symbol (`docs/history/design/issue-712-gate-family.md:19`) and the active registry's
claim that the family derives the table relation (`docs/architecture/core/Core-Enforcement-Active-Gates.md:167-168`).
`GATE-AUTHORING.md` requires coverage of every syntactic form and warns that a narrow identifier reader which
returns `undefined` silently passes violations (`tooling/src/verify/gates/GATE-AUTHORING.md:347-359`).

Safe remediation: recursively resolve identifier/property-access symbols through local constant initializers
to the underlying schema declaration, with a cycle/depth refusal that reports rather than exempts an
unreadable candidate. Add both local-alias write and local-alias upsert `mustFlag` rows, plus guarded aliases as
`mustPass` controls.

### P1 — `tooling/src/verify/gates/owner-scoped-writes.ts:103` — any `ownerId` text anywhere in the WHERE launders an unscoped write

The write gate clears a write when `where.getText().includes("ownerId")`; it does not require the target
table's qualified owner column (`<target>.ownerId`) or even a column access (`owner-scoped-writes.ts:103-108`).
This is weaker than the upsert sibling's qualified-column check (`owner-scoped-upserts.ts:88-100`) and weaker
than the registry's explicit `eq(T.ownerId, …)` contract.

Failure scenario: `db.update(characters).where(and(eq(characters.id, id), sql\`${ownerId} = ${ownerId}\`))`
contains the parameter name twice but the added SQL predicate is a tautology; no row is constrained by
`characters.ownerId`. The active gate returns clean and a caller-selected foreign character can be updated.

Evidence produced this session: the same adversarial-probe command passed that exact parseable statement to
the real descriptor with `expect.count = 1`; `verifyGateProofs` reported `expected ... 1 but got 0`.

Safe remediation: require a qualified target-column occurrence, using the same escaped
`\b${ident}\.ownerId\b` relation already used by `owner-scoped-upserts`, and plant unrelated/bare/tautological
`ownerId` mentions as `mustFlag` controls.

### P1 — `tooling/src/verify/gates/untrusted-regex-safe-exec.ts:38` — an unrelated compose property disables the canonical-seam blindness tripwire

The descriptor increments one global `seen` counter for every `testRegexKey` property anywhere under
`entry/compose/**` (`untrusted-regex-safe-exec.ts:38-42`), then suppresses its canonical-disappearance finding
whenever that global count is nonzero (`:53-54`). It never ties `seen` to `entry/compose/chat.ts`, despite its
message, design, and registry naming that exact execution boundary.

Failure scenario: the property disappears from `entry/compose/chat.ts` during a refactor and an unrelated
compose module retains a safe `testRegexKey: createRegexTest()`. The unrelated site passes, the blindness arm
does not fire, and the canonical user-authored regex seam can move back to native `.test` with a green gate.

Evidence produced this session: a two-file mini-project with property-free canonical `chat.ts` and a safe
property in `other.ts` expected the `no execution boundary` finding; the real descriptor returned zero under
`verifyGateProofs`.

Safe remediation: count/validate the property only in the canonical file (and the reserved canonical
conformance twin), or track canonical and noncanonical populations separately and base the fail-loud arm only
on the canonical population. Add this exact two-file counterexample to `mustFlag`.

### P1 — `tooling/src/verify/gates/public-route-body-cap.ts:30` — E3 misses buffering readers and accepts an unrelated capped stream as protection

`BODY_READ_METHODS` omits the standard `Request.blob()` reader, and `readsRequestBody` only accepts a method
whose immediate receiver is a `.req` property (`public-route-body-cap.ts:12-14`, `:30-48`), so
`c.req.raw.blob()` is not measured as a body-reading route. Separately, `hasCappedStream` accepts any descendant
`stageCapped(anything, anything, *_MAX_*_BYTES)` call (`:66-71`); it does not couple that call's first argument
to the same `c.req.raw.body` consumed by the route.

Failure scenarios:

- `app.post(..., async c => (await c.req.raw.blob()).size)` buffers an uncapped public body and the gate reports
  clean.
- A handler performs an unrelated capped file operation and independently calls `c.req.json()`; the incidental
  `stageCapped(unrelated, path, IMPORT_MAX_TOTAL_BYTES)` clears the route even though the request body is
  uncapped.

Evidence produced this session: both counterexamples were executed against the real descriptor. Each expected
one finding and got zero. The dangerous direction is permissive here: the registry states that a body-reading
mutating route must expose a cap and calls the streaming arm *exact*
(`docs/architecture/core/Core-Enforcement-Active-Gates.md:73`), while the implementation recognizes neither
the complete Request reader family nor the stream relation.

Safe remediation: enumerate Hono and raw-Request readers (`json`, `text`, `arrayBuffer`, `formData`, `blob`,
and the intentionally supported parse helper) through explicit receiver shapes, and accept `stageCapped` only
when its data argument resolves to the route request's raw body. Plant each raw reader plus an unrelated-stream
laundering control.

### P2 — `tooling/src/verify/gates/public-route-body-cap.ts:51` — E3 reports a real, correctly ordered named `bodyLimit` middleware as unsafe

`hasCapMiddleware` only accepts an inline call expression whose callee text is exactly `bodyLimit` or
`bodyCap` (`public-route-body-cap.ts:51-63`). A locally bound middleware—
`const cap = bodyLimit({ maxSize: MAX_BYTES }); app.post(path, cap, handler)`—is the same Hono protection in
the same ordering, but the gate reports it.

Failure scenario: a route family factors one shared, immutable cap middleware so its limit cannot drift. The
active gate reds valid code and pressures the author to duplicate inline middleware purely to satisfy the
matcher.

Evidence produced this session: the named-middleware counterexample was installed as `mustPass` on the real
descriptor; `verifyGateProofs` reported `expected count=0 but got 1`.

Safe remediation: resolve a preceding identifier to a local constant initialized by a recognized cap call
(and fail closed on mutable/unresolved bindings). Add that common safe form as a committed `mustPass`, as
required for declared limits by `GATE-AUTHORING.md:323-324`.

### P1 — `tooling/src/verify/gates/plugin-dump-guard.ts:62` — any nested return is mistaken for an all-path unsafe exit

`guardedHelperDump` treats the unsafe branch as exiting when the `then` statement contains *any* descendant
`return` (`plugin-dump-guard.ts:62-64`). It does not prove that every path through the branch exits before the
later `ctx.dump`.

Failure scenario: `if (!handleSafeToDump(ctx, handle)) { if (debug) return; } return ctx.dump(handle)`. With an
unsafe handle and `debug === false`, execution falls through to materialization, but the descriptor accepts the
helper. A deeply recursive guest value can therefore reach the host-stack traversal and threaten the shared
QuickJS/WASM runtime while the active E4 gate remains green.

Evidence produced this session: that exact conditional-return helper expected one `dump` finding and got zero
from the real descriptor under `verifyGateProofs`.

Safe remediation: prove the unsafe branch unconditionally terminates (direct return/throw, or a block whose
reachable final path terminates) instead of testing descendant presence. Add the conditional nested-return
counterexample to `mustFlag` and a block with logging followed by unconditional return to `mustPass`.

### P2 — `packages/server/src/entry/http/card-frame.ts:78` — the new 96 KiB cap rejects bodies accepted by the route's own schema

The product migration sizes `CARD_FRAME_BODY_MAX_BYTES` to 96 KiB because the decoded schema fields total
roughly 80 KiB (`card-frame.ts:78-81`), but the limit applies to encoded request bytes *before* JSON parsing
(`:250`). The schema allows 64,000 HTML characters and 16,000 CSS characters
(`packages/contracts/src/chat/card-frame.ts:28-57`); JSON escaping can expand each valid character, so decoded
character maxima are not a safe wire-size bound.

Failure scenario: a valid 64,000-character HTML string and valid 16,000-character CSS string containing
quotes serializes to 160,082 bytes. The schema accepts it, but the live Hono route returns 413 before schema
validation. Generated card markup with enough quoted attributes/backslashes can therefore be rejected despite
obeying the public contract.

Evidence produced this session: `pnpm tsx reports/stickler/scratch/card-frame-body-cap-probe.ts` registered the
real route in a Hono app and printed
`{"schemaAccepts":true,"encodedBytes":160082,"configuredCapBytes":98304,"responseStatus":413}`. The committed
test only proves a schema-invalid object with a large unknown `padding` property returns 413
(`tests/server/entry/http/card-frame.test.ts:169-171`); it has no maximum-valid escaped-body control.

Safe remediation: derive a wire cap from the worst-case encoded form of every bounded field (including token
keys/values and envelope overhead), or choose a documented higher bound that dominates every schema-valid
serialization while remaining a finite admission limit. Add a maximum-valid escaped payload that must reach
schema/route success and retain the oversized invalid 413 twin.

### P2 — `tooling/src/review-mirror/ops/pending-guard.ts:27` — E7 substring heuristics remove unresolved controls from the review residual

The census calls any handler text containing `epoch`, `sequence`, `requestId`, `requestToken`, or `generation`
an `epoch` guard (`pending-guard.ts:27`, `:141-151`) even when the word is incidental payload metadata and no
admission/stale-response guard exists. It also calls any disabled expression containing the substring
`isPending` a proven pending guard (`:113-115`, `:145-149`), including unrelated names such as
`isPendingLabelVisible`. Finally, `reviewResiduals` excludes both `epoch` and direct/derived pending rows
(`:201-205`), despite its contract defining the residual as controls whose safety cannot be mechanically
established (`tooling/src/review-mirror/contract/types.ts:32-38`).

Failure scenario: a mutation button passes `{ requestId }` but has no `disabled` guard; another uses
`disabled={form.isPendingLabelVisible}` where the value describes a label, not mutation admission. The
evidence reports both as mechanically handled and emits a zero review residual, so a reviewer is explicitly
told there is nothing left to inspect.

Evidence produced this session: an in-memory TSX project containing those two controls produced
`directControls: 2`, classifications `epoch` and `direct-pending`, and `reviewResiduals: 0`. The current real
tree happens to have zero epoch classifications and its 34 residual count is arithmetically correct; this is a
future evidence false-clean, not a claim that the current 34-row handoff was fabricated.

Safe remediation: require an exact, structurally recognized pending signal (symbol/property named exactly
`isPending`) and treat epoch-like names as review candidates unless the census can prove the actual
request-generation comparison/admission pattern. At minimum include every `epoch` candidate in
`reviewResiduals`; rename the class to make its unproven status explicit.

## Verified clean

- **Isolation and scope:** detached worktree `/tmp/orbweaver-712-review.l27u0d` at exact SHA
  `625f9b5f7ae13627cbb4046a4e5b8176bfb3a5c4`; `git status --short` was empty before the report. No product or
  tooling source was edited. The only probe code is under ignored `reports/stickler/scratch/`.
- **Full-file review:** all handwritten source and test files in the 34-file diff were read in full, including
  the complete E1–E4 descriptors/helpers, all review-mirror modules, auth/card/membrane migrations and tests,
  package/script front doors, and the deleted mirror implementation from the base commit. The relevant
  constitution, D-ledger/spines, gate law, tooling design, and issue #712 live board intent were also read.
- **Generated-file handling:** the three generated catalog/receipt JSON files were parsed in full with
  `jq empty`; every changed record/hash and diff was inspected, and the authored design SHA-256
  (`80fac97c…`) matched its receipt. Unchanged generated records were not manually reviewed line-by-line.
  `Core-Enforcement-Active-Gates.md` is a 178 KiB registry table; its changed E1–E4 rows, registry structure,
  and all sections coupled to activation/denominators were read, while unrelated unchanged gate-row prose was
  not re-reviewed.
- **Focused product and mirror tests:** `pnpm test:scoped tests/tooling/review-mirror/index.test.ts
  tests/tooling/review-mirror/cli.int.test.ts tests/server/entry/http/card-frame.test.ts
  tests/server/entry/http/auth-routes.test.ts tests/server/infra/plugin-host/membrane.test.ts` passed 5 files,
  133 tests, with no type errors. This confirms the current OIDC sid-only rejection remains 400
  (`auth-routes.ts:738-744`, test `auth-routes.test.ts:1170-1176`) and current membrane callers route through
  the safe helper; it does not refute the gate counterexamples above.
- **Active registry and planted proof:** `pnpm test:scoped tests/tooling/check-gates.int.test.ts` passed 7/7 in
  434.9 seconds with no type errors. The new fixtures are present at
  `tests/tooling/check-gates.int.test.ts:655-673`; the suite proved a nontrivial registry, scan denominators,
  no zero-file active gate, every registered gate firing, and every active gate file registered
  (`:1183-1207`, `:1231-1249`). This proves the gates are wired and non-vacuous on their planted examples; it
  does not make the unplanted counterexamples safe.
- **Live review mirror:** `pnpm review:mirror /tmp/orbweaver-712-mirror.Oa3eKJ` completed at the exact reviewed
  SHA with 7,042 tracked files, 5,944 mirrored files, 5,777 mirrored code files, 29,081,284 mirrored bytes,
  zero generation errors, zero missing code, 5 E5 focus rows, and 3 E6 focus rows. E7 measured 588 TSX files,
  67 direct controls, 27 direct-pending, 6 derived-pending, 0 epoch, 27 missing, 7 other-guard, and 34 current
  review residuals. E5/E6 paths and symbols all resolved. The manual D62 posture is preserved; no workflow or
  cron activation was added.
- **Structural census:** an `ast-grep` `ctx.dump` sweep scanned all 8 TypeScript files under plugin-host and
  found the four live dump locations (realm, two sandbox sites, membrane helper). A request-body sweep scanned
  all 14 TypeScript files under entry/http and located the live card reader. Negative conclusions did not rely
  on an empty scan.
- **Catalog/front doors:** root `review:mirror` remains the sole root-script front door (`package.json:29`),
  the old `scripts/review-mirror.mjs` was deleted, and `scripts/README.md` records the durable-tool move. The
  authored design/catalog receipts are current.
- **Not run by charge:** no full `pnpm check`/static battery was rerun; the task explicitly supplied that the
  normal 16-stage hook at this integration SHA had already passed and requested focused adversarial work only.
  No rendered UI probe was applicable to this server/tooling-only diff.

## Unconfirmed, low priority

None. Suspicions not promoted above were refuted or left out.

## Issue summary

Cold review of issue #712 at `625f9b5f7` is REFUTED with 8 confirmed findings (P1 ceiling): E1 loses local
table aliases and accepts unrelated `ownerId` text; E2's canonical blindness count is global; E3 misses raw
body readers, accepts unrelated stream caps, and rejects a real named cap; E4 mistakes a nested return for an
all-path exit; the 96 KiB card cap rejects a schema-valid 160,082-byte serialization; and E7 substring
classifiers can erase unresolved controls from review evidence. Active registry/planted wiring, current E5/E6
focus, current mirror populations, OIDC sid-only rejection, and focused product tests are clean. Full report:
`docs/history/reviews/stickler/2026-08-25-issue-712-gate-family.md`.
