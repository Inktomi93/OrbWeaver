---
kind: law
status: active
updated: 2026-10-19
---

# caught-failure-ownership waiver rejudgment playbook

How to judge one `caught-failure-ownership` waiver and record the verdict. A worker takes a shard of waivers and emits one record per waiver. A verifier audits the records.

## What the gate reports

The gate is `tooling/src/verify/gates/caught-failure-ownership.ts`. Its reader is `tooling/src/verify/lib/caught-failure.ts` with its helpers `caught-failure-scope.ts`, `caught-failure-outcome.ts` and `caught-failure-handler.ts` in the same folder. The gate reports UNPROVEN OWNERSHIP, never "bug". It reports three site kinds:

| Kind | Where | Meaning |
| - | - | - |
| `promise` | `promiseAbsorberSite`, `tooling/src/verify/lib/caught-failure.ts:193` | a `.catch(h)` or `.then(_, h)` whose handler discards the rejection |
| `default` | `silentDefault`, `tooling/src/verify/lib/caught-failure-handler.ts:24` | a catch whose only escape is a constant fallback |
| `empty` | `unownedCatch`, `tooling/src/verify/lib/caught-failure-handler.ts:14` | a catch, with its finally, that names no owner |

`catchClauseSite` (`tooling/src/verify/lib/caught-failure.ts:327`) decides a catch. It checks the sole-operation owner first, then `default`, then `empty`.

### What counts as an owner

The reader's own header lists every owner (`tooling/src/verify/lib/caught-failure.ts:32`, "WHAT PASSES"). Each owner is checked for provenance: the reader resolves the declaration and refuses a lookalike.

- Propagation: a rethrow of the caught binding, a `{ cause: err }` wrapper, a call typed `never` or `Promise<never>`, or the native `Promise.reject(err)`.
- Operator surfaces: a structured `getLog` or pino line, `securityEvent`, `withRequestSpan`, the `notify` or toast door with failure copy.
- Observable state: a React `useState` setter fed a failure value, a TanStack query or form, and `createEntityMutation` with failure-copy `errorToast`.
- Error as data: a returned object that a consumer reads, such as `{ ok: false, reason }`. A success discriminator such as `status: 'ok'` refuses ownership even beside the error.

The newest owners and their provenance rules:

| Owner | Rule | Code |
| - | - | - |
| imported mutation hook | the hook is a `const` initialized by `createEntityMutation` with failure copy, even through a re-export | `originatesFromOwnedEntityMutation`, `tooling/src/verify/lib/caught-failure-scope.ts:61` |
| sole-operation try | the try holds exactly one call, it is a governed framework operation, and it holds no `new` | `hasFrameworkOwner`, `tooling/src/verify/lib/caught-failure-scope.ts:108` |
| guarded rethrow | an `if` whose condition reads the caught binding, or a `const` derived from it in the same block, and whose branch ends by rethrowing the binding | `guardedRethrow`, `tooling/src/verify/lib/caught-failure-scope.ts:311` |
| typed refusal | a call whose type has a failure literal in every member of `kind`, `status`, `step` or `verdict`, or a single-return factory whose body is a failure outcome without its parameter | `typeIsFailureOutcome` and `factoryReturnsFailure`, `tooling/src/verify/lib/caught-failure-outcome.ts:200` and `:176` |

A factory body that is failure-valued only through its parameter, such as `(v) => ({ error: v })`, owns only when the call's first argument references the caught binding (`governedFailureFactoryCall`, `tooling/src/verify/lib/caught-failure-outcome.ts:193`). The failure literals are `FAILURE_DISCRIMINATOR_RE` and the `failureKinds` set in the same file.

### Declared limits

The gate header lists them at `tooling/src/verify/gates/caught-failure-ownership.ts:82`, each with a proof row. Read that list before you call a finding a false positive. A limit is known behavior, not a defect to fix in a shard.

- A dynamically keyed `.catch` link is not read.
- zod's `.catch()` is schema construction.
- Files outside `packages/<name>/src` and `tooling/src` are outside the population.
- An owner behind an opaque helper is invisible.
- A mutation owner behind a wrapper hook, an injected save or a local wrapper is not expanded.
- A function-valued `errorToast` is not expanded.
- An `ok: false` member is proven only from a literal or a single-return factory body, never from a type.
- A guarded rethrow's guard must read the binding, but its narrowness is not judged.

### The marker

The one waiver form is a line comment directly above the guarded `try` or promise statement:

```ts
// @orb-waive caught-failure-ownership(<exact token>): <owner or why safe, and the end condition>
```

The token is the exact source slice the gate reports. For a catch it is the binding name (`err`, `error`) or `catch` for a bindingless clause. For a promise it is the callee text of the guarded work, such as `save` or `a.save`. A nested catch inside a guarded try needs its own binding name. The gate's `FIX` text states the rule (`tooling/src/verify/gates/caught-failure-ownership.ts:132`).

### The waiver alarms

The waiver engine raises two alarms for this gate:

- A stale waiver: "no live caught-failure-ownership finding is bound to its comment carrier". The site no longer reports, so the reader now proves an owner. Delete the marker.
- A dead position: the marker's token matches no finding at that carrier. Fix the token, or judge the site again.

## Dispositions

Every record takes exactly one disposition. Gather its evidence for this site only. Never reuse another site's evidence.

| Disposition | When | Evidence the record needs |
| - | - | - |
| KEEP | a real owner exists that the reader cannot see | the owner at `path:line`, the code line quoted, and a reason rewritten to name that owner and its end condition |
| GATE FALSE POSITIVE | the reader should prove the owner and does not | the owner at `path:line`, the reader function that misses it, and a proposed mustPass row; escalate it |
| REAL DEFECT | nothing owns the failure, and a user or operator loses it | the swallow quoted, the failure a user would miss, a red-first behavioral test, and the fix diff |
| REDUNDANT CATCH | nothing in the try can throw, or the outer layer owns it | the proof at `path:line` (a total function, or the outer owner) and the removal diff |
| UNSURE | any doubt about the other five | the question and what you checked; escalate it |

Rules for each:

1. KEEP: cite the owner, never the waiver text. A reason that only restates the marker is not evidence.
2. GATE FALSE POSITIVE: never edit product code to satisfy the reader. Never edit the reader in a shard. Escalate to an Opus lane, which fixes the checker with a mustPass row and a red-first run.
3. REAL DEFECT: write the test first and show it fail on the unfixed code. Then fix the swallow. Then delete the marker.
4. REDUNDANT CATCH: a "cannot throw" claim needs the callee's body, not its name. Run the in-memory probe after the removal.
5. UNSURE: escalate freely. An escalation costs one question. A wrong KEEP costs the shard.

## Worked examples

### Good: a guarded rethrow that the reader now proves

`packages/server/src/domain/credentials/verbs/add.ts:33` catches a unique-constraint collision and rethrows every other error (`if (isConstraintViolation(err)?.kind !== "unique") { throw err; }`). Its marker drew a stale-waiver alarm, so the disposition is removal. The record deletes the marker and the row `…/add.ts::insertInFreeSlot::err::1`, and lowers `sites`, `deliberate-absorb` and `byGrammar.empty` by one. The same shape removed the markers in `seed.ts`, `subscriptions.ts` (a guard on `const mapped = classifyDomainError(err)`), `process-priority.ts` and `heap-devtools.ts`.

### Good: a typed refusal from a single-return factory

`packages/server/src/primitives/serde/lib/index.ts:122` and `:128` return `refuse("invalid-encoding")` and `refuse("not-json")`. `refuse` at `:109` returns `{ ok: false, reason }`, which is a failure outcome without its parameter. The reader proves both sites, so both markers are removed with their rows.

### Good: a KEEP that names a real owner the reader cannot read

`packages/client/src/features/chat/components/gallery-upload-zone.tsx:77` returns `{ step: "notUploaded", reason }`. `notUploaded` is not a failure literal, and `Shortfall` is a local type. The owner is the dropzone error line: `setShortfall({ notUploaded, notAdded })` at `:111` renders the refusal. KEEP, with the reason naming that setter and "ends if that line stops rendering".

The same disposition fits `revoked` (`CredentialHealth.status`, `packages/contracts/src/credentials/index.ts:45`), `down` (`Reachability`, `packages/inference/src/contract/runtime.ts:60`) and `listed: false` (`ModelListing`, `packages/contracts/src/inference/catalog.ts:58`). Each is a failure member of an exported union, but the reader's failure literals do not include it. Membership in a union is not the proof, because the success members are members too. Escalate a vocabulary change. Never claim one in a shard.

### Good: an unwaived finding judged at its code

`packages/server/src/domain/share/certificate/controller.ts:53` is `void run().then(operation.resolve, operation.reject)`. The handler forwards the rejection into the deferred, and `track` returns `operation.promise` at `:58`. That is propagation the reader does not see: GATE FALSE POSITIVE, escalate. `:54` attaches a settle-only handler for `pending` bookkeeping. The caller of `track` owns the rejection through the returned promise: KEEP, naming `:58`.

### Bad: an identity factory launders a success value

```ts
function pass<T>(value: T): T { return value; }
try { return JSON.parse(text); } catch { return pass([]); }
```

`pass([])` is a success value. A factory only owns when its body is failure-valued without its parameter. The gate row `parameter-factories` flags this shape. A KEEP that cites `pass` is refuted.

### Bad: an optional or open discriminant

`{ status?: 'failed'; data?: string }`, `{ status: 'error' } | { status: number; body: string }` and `{ kind: 'error' } | { kind: string & {}; body: string }` all admit a success member. A typed refusal needs a failure literal in every member. The gate row `nonliteral-discriminants` flags them.

### Bad: other work beside the governed operation

`try { await mutation.mutateAsync(new Payload(raw)); } catch { return []; }`: the constructor can throw before the mutation runs, and the mutation's toast never fires for it. The gate row `sole-new` flags it.

### Bad: owners the reader credits wrongly

The reader credits two shapes that own nothing. The tool's silence is not evidence for either. Judge them at the code and escalate each as a reader false negative.

- `{ ok: false, ...last }`: a later spread can overwrite `ok` with `true`.
- `return wrap(void err)` with `wrap(v) { return { error: v }; }`: the argument references `err` but carries `undefined`. The reader checks that the argument references the binding, not that it carries it.

## Checking a claimed owner

Use the cheapest check that answers the question. Never edit the tree while any check runs on it. The native inventory refuses a run whose source changed mid-run with "native inventory worker implementation changed during staging", and the run gives no verdict.

### The per-gate conformance runner

Run it after any change to the gate rows or the reader. Save it as a scratch file, then run `pnpm exec node <file> <worktree>`.

```ts
const root = process.argv[2];
const { gate } = await import(`${root}/tooling/src/verify/gates/caught-failure-ownership.ts`);
const { verifyPolicyProofs } = await import(`${root}/tooling/src/verify/ops/policy-conformance.ts`);
const failures = verifyPolicyProofs([gate]);
console.log(`${gate.mustFlag.length} mustFlag, ${gate.mustPass.length} mustPass, ${failures.length} failure(s)`);
for (const failure of failures) console.log(`${failure.arm}[${failure.exampleIndex}] ${failure.detail}`);
process.exitCode = failures.length > 0 ? 2 : 0;
```

To test a shape, copy the gate with your own rows: `defineGate({ ...gate, mustFlag: [row], mustPass: [] })` from `tooling/src/verify/contract/policy.ts`. A row is `{ mode: "types", files: { "<population path>": "<source>" }, expect: { count: 1 }, why: "<name>" }`.

### The in-memory single-file probe

It runs the gate over one committed file in memory and prints each finding with its waiver and site kind. Types from other files do not resolve, so trust it only for same-file owners. Run `pnpm exec node <file> <worktree> <repo path>…`.

```ts
import { execFileSync } from "node:child_process";
const root = process.argv[2];
const { Project } = await import(`${root}/node_modules/ts-morph/dist/ts-morph.js`);
const { gate } = await import(`${root}/tooling/src/verify/gates/caught-failure-ownership.ts`);
const { runPolicyPass } = await import(`${root}/tooling/src/verify/lib/policy-pass.ts`);
const { isolatedTypeFacts } = await import(`${root}/tooling/src/verify/ops/policy-conformance.ts`);
const project = new Project({ useInMemoryFileSystem: true });
for (const path of process.argv.slice(3)) project.createSourceFile(`/probe/${path}`, execFileSync("git", ["-C", root, "show", `HEAD:${path}`], { encoding: "utf8" }));
const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: "/probe", project, nativeTypeFacts: () => isolatedTypeFacts(project), reviewedGrants: [], failOnWarnings: false });
for (const entry of [...result.authority.effectiveFindings, ...result.authority.waivedFindings]) {
  const finding = entry.finding ?? entry;
  console.log(`${entry.waiverId ?? "UNWAIVED"}\t${finding.file}:${finding.line}\t${finding.token}\t${finding.message.slice(-70)}`);
}
for (const alarm of result.authority.authorityAlarms) console.log(`alarm\t${alarm.message}`);
```

### A focused structure run

Run one when the owner depends on a type from another file. Ask the orchestrator first; it names the lock and the concurrency.

1. Start the run in its own session: `setsid pnpm check:structure --check caught-failure-ownership --file <path>`.
2. Start a new run only while `MemAvailable` in `/proc/meminfo` exceeds 24 GB.
3. Stop the run at 900 s with `kill -TERM -- -<pgid>` for every process group in its tree.
4. After any stop, kill only `semantic-inventory` workers that were reparented to init or systemd and whose `/proc/<pid>/cwd` is under your worktree. Report any other orphan.
5. Read the verdict from the `final policies:` line. A tool error, a withheld owner, or a stop is no verdict.

A run of one file takes minutes on a quiet box. A batch of client files can exhaust the inventory worker's heap, so run client files one at a time.

## The record

Emit one record per waiver, with these fields:

| Field | Content |
| - | - |
| `site` | the marker's `path:line` and its token |
| `claimedOwner` | the owner the marker's reason names, quoted |
| `verifiedOwner` | the owner's `path:line` and the code line, or `none` |
| `toolOutput` | the quoted output of the check you ran: a conformance line, a probe line, or a `final policies:` line |
| `disposition` | `KEEP`, `GATE FALSE POSITIVE`, `REAL DEFECT`, `REDUNDANT CATCH` or `UNSURE` |
| `diff` | the hunk you applied, or `none` |

## Waivers outside a shard

Never change these waivers. Each has its own owner.

- The `owner-scoped-reads` and `owner-scoped-writes` waivers: the security executor rejudges them.
- The `no-vanity-alias` waivers: [work item 1044](../work/1044-remove-the-vanity-aliases-the-baselined-waivers-hide.md) owns them.
- Any waiver in `packages/contracts/src/import/index.ts` or `packages/contracts/src/portability/index.ts`.
