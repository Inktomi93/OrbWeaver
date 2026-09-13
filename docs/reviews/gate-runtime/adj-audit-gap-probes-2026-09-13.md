---
kind: review
status: active
updated: 2026-09-13
---

# Audit-gap probes

## Verdict

Three candidate groups were examined. One contains a confirmed defect, one is cleared for the stated
contract, and one was stopped and routed as authorization/security work.

The probe driver is `/tmp/codex-gap-probes.ts`. It imports the production policies and conformance runtime,
adds only in-memory proof rows, and leaves the repository unchanged. Current `git status --short` shows only
the root-owned ledger edit and new accounting report already present outside this task.

## 1. `fk-ondelete-stated` spread options — no defect confirmed

Load-bearing source:

- `tooling/src/verify/gates/fk-ondelete-stated.ts:31-42` consumes the shared `drizzleSchemaFact` and reports
  only `foreignKey.onDelete.kind === "unspecified"`.
- Its existing rows at `:47-95` cover absent/empty options and ordinary explicit options, but not spread
  syntax directly.
- `tests/tooling/verify/gates/schema-fact-wave-1.test.ts` dispatches this policy through the shared fact;
  `schema-fact-parity.test.ts:704-763` independently carries legacy/final parity shapes.

Focused in-memory controls through `verifyPolicyProofs`:

1. `const opts = { onDelete: "cascade" } as const; ... { ...opts }` was accepted.
2. `const opts = { onUpdate: "cascade" } as const; ... { ...opts }` produced exactly one finding at
   `chatId`.
3. `const opts = options(); ... { ...opts }`, where the spread depends on a runtime call, did not render a
   clean pass. A deliberately false `mustPass` control returned:

   `PASS TOOL ERROR [evaluate] drizzle schema fact unresolved: ... references config: CallExpression depends on runtime evaluation`

This answers the wave-3 omission: authored spread objects preserve explicit/missing `onDelete`, and an
unreadable dynamic spread refuses. The candidate does not justify a defect or new ledger row.

## 2. `two-class-role-authority` zero-instance claim — stopped for security routing

This arm is authorization/security work. The policy's subject is an inline participant-role comparison in an
enforcement position that gates a throw (`tooling/src/verify/gates/two-class-role-authority.ts:59-66,
107-117`). Its three declared limits are:

- switch/case enforcement (`:285-294`),
- guard inversion with a following throw (`:345-354`),
- a comparison hoisted into a boolean const (`:355-364`).

The current header claims all three have zero live instances (`:25-29`). Existing rows prove how the policy
treats synthetic examples; they do not prove the current-tree census. Per the assignment, I did not drive,
modify, or adjudicate this authorization policy. A `security-executor` should perform the exact current-tree
census and plant one positive control for each recognizer. Until then this remains an unverified header claim,
not a confirmed defect.

## 3. ID-brand alias and cast chains — one confirmed defect

### Cleared controls

`no-fake-disabled-id` uses `readStaticAuthoredScalar` at
`tooling/src/verify/gates/no-fake-disabled-id.ts:64-72`. The reader resolves immutable aliases and transparent
`as`/`satisfies` wrappers through `resolveStableExpression` (`lib/static-authored-value.ts:222-243,
274-288`). Focused controls showed:

- three immutable alias hops ending in `as string` still report the empty sentinel exactly once;
- an otherwise identical nonempty alias chain passes.

`no-loose-id-cast` also correctly handled:

- `(value as unknown as UserId) satisfies UserId` — one finding at `value as unknown`;
- `(value as UserId) satisfies UserId` — passes, preserving the sanctioned single-cast boundary;
- `"" as const as unknown as UserId` — reports.

These shapes do not justify a defect.

### Confirmed defect: a legal parenthesized const-asserted operand withholds the policy

The legal laundering shape

```ts
export const x = ("" as const) as unknown as UserId;
```

does not produce the required finding. The production conformance path returns:

`PASS TOOL ERROR [visit] node finding token "(\"\" as const) as unknown" cannot be named by an @orb-waive marker: the position grammar admits no parenthesis ...`

The adjacent unparenthesized control, `"" as const as unknown as UserId`, reports successfully. This isolates
the failure to node/coordinate association rather than brand resolution or `as const` recognition.

Cause: `castAnchor` at `tooling/src/verify/gates/no-loose-id-cast.ts:45-51` unwraps only when its immediate
node is `ParenthesizedExpression`. For the outer branded cast, `node.getExpression()` is the inner
`AsExpression` (`("" as const) as unknown`), whose authored text starts with `(`. The helper never descends
through that transparent `as unknown` wrapper to unwrap the parenthesized operand. `waivableCoordinate(raw)
?? raw` at `:79-84` therefore hands a paren-leading raw string to the report door, which refuses and withholds
the whole policy.

Consequence: a valid TypeScript double cast into a canonical brand produces no violation verdict; it turns the
policy run into a tool error. This is fail-loud rather than false-clean, but it is still a reachable inability
to judge a shape the policy exists to reject. It is the same coordinate-family boundary described in the
module's #2197 comment, one transparent cast layer deeper.

Recommended bounded repair scope: `no-loose-id-cast.ts` and `id-brand-flow.test.ts`. Preserve the current
single-cast and `satisfies` behavior. Add the parenthesized const-asserted double-cast regression plus the
unparenthesized twin; make anchor selection descend through only the exact transparent cast wrappers needed to
reach the authored carrier, without broadening what counts as a brand-laundering pair. This should receive its
own defect/owner before implementation.

## Execution receipt and limits

Command:

`pnpm exec tsx /tmp/codex-gap-probes.ts`

The final run completed in about 2.2 seconds. Seven expected positive/negative controls were green; the
deliberately false dynamic-spread `mustPass` exposed the expected fail-closed tool error; the parenthesized
const-asserted double-cast control exposed the unexpected visit-phase tool error. No broad suite, structure
run, tracked edit, lifecycle action, or security-policy probe was performed.

## Integration disposition

Root independently repeated the production probe at `83215b816` and reproduced the parenthesized
const-asserted cast tool error. The defect is filed as #2325; the FK and other brand-shape controls
remain cleared for their measured scope. The authorization census is separately assigned to the
security reviewer. This report does not claim that the #2325 repair has landed.

## LEDGER ROWS (1 row)

| subject | found by | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-loose-id-cast` | Codex gap probes · `tooling/src/verify/gates/no-loose-id-cast.ts:45-51,79-84` | A legal parenthesized const-asserted operand in `("" as const) as unknown as UserId` causes a visit-phase unwaivable-coordinate tool error rather than a finding. The immediate operand is an AsExpression, so the parenthesis-only anchor unwrap never reaches its nameable carrier. | coordinate refusal on a supported cast shape | **CLOSED (board #2325; `1769f8ac9`; independent corrective ACCEPT, [repair and full review](x-cast-anchor-2026-09-13.md))** | Independent in-memory production-conformance probe and root replay at `83215b816` reproduce the error; the unparenthesized const assertion reports, single casts pass, and satisfies wrappers retain their existing behavior. Repair and permanent regression controls are assigned; no fix receipt is claimed. |

## Authorization census follow-up

The separately routed security review completed the previously omitted measurement. Across the real policy population of 1,148 files at `83215b816`, all three header-defined omitted shapes have zero instances. Each recognizer detected its planted positive control. The named production gate reported three raw findings, all three granted, with no effective findings, alarms, tool errors, or withheld policies. This clears the census question within those exact shapes; it does not claim every possible enforcement encoding is measured. The [full census report](adj-role-authority-census-2026-09-13.md) preserves the source scope, controls, production artifact and limits.
