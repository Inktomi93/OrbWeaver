// castId brands an existing id; it never turns a randomness generator into an id mint.
//
// THE THIRD ANSWER (#944, closed #2041). This is a `hard` ban, and until 2026-09-11 its generator reader
// answered an unresolved argument callee with `false` — so a subject the checker COULD NOT READ was
// silently ACQUITTED by the one policy whose whole job is to forbid the shape. It now routes the refusal
// through the shared `classifyOriginRefusal`: a callee that PROVABLY binds a non-module declaration (a
// string method, a hono `c.req.param`, an injected op) is a different identity and passes, while a door
// with no readable target is reported with the disjoint UNREADABLE text. Fail-closure's mandatory
// companion is the CALL prefilter — only the first argument of a canonical `castId(` is ever asked.
// Measured on the live tree before the flip: 20 `castId<T>(<call>)` sites in `@packages` (ast-grep, both
// languages, scanned 2589 ts + 806 tsx), 5 resolved, 15 refusing as case (a), 0 unreadable — the flip
// costs zero live findings, which is why it is a fix and not a burn-down.
//
// THE RESULT-METHOD WALK, AND THE MINT IT DELIBERATELY DOES NOT FLAG (#2042). The row that opened this
// asked for `randomBytes` in `MODULE_GENERATORS` so the session-token mint would be caught. BOTH HALVES OF
// THAT WERE WRONG AND THE MEASUREMENT SAYS SO. (1) `castId<T extends string>(raw: string)` cannot take a
// `Buffer`, so a `randomBytes` row would be unreachable on any type-correct tree. (2) The real site —
// `packages/server/src/domain/sessions/tokens/tokens.ts` `mintSessionToken`, `castId<SessionToken>(
// randomBytes(32).toString("base64url"))` — is CORRECT and must stay silent: entropy is not an id mint,
// and this policy's own prescribed remedies (`mintTypeId`/`newId`) both produce a UUIDv7 carrying a
// millisecond timestamp and ~74 random bits, so "fixing" a 256-bit opaque bearer secret to obey the ban
// would WEAKEN it. The `crypto.getRandomValues(…).toString()` mustPass row is that refusal, stated
// positively and cut-proved. WHAT WAS ACTUALLY BLIND was the position, not the vocabulary: the reader asked
// only the argument call's OWN callee, so a method on a mint's RESULT evaded the policy's EXISTING
// vocabulary — measured at tip, `castId(crypto.randomUUID().replace("-", "").slice(0, 12))` produced ZERO
// findings from a `hard` ban. Closing it makes the policy flag MORE and changes no live verdict: the only
// `castId(<call>)` site on the tree whose argument has a call RECEIVER is the session mint, whose receiver
// (`randomBytes`) is not in the vocabulary, so the walk answers `false` and hands the verdict back
// unchanged. The BRACKET spelling (`gen()["slice"](…)`) is not a hole and needs no arm — measured, its
// direct callee binds nothing, so the fail-closed third answer already reports it.
//
// FAMILY (`id-brand-flow`): shared readers, no private door. The cast SEAM is `lib/id-brand.ts`
// (`createKitIdCallMatcher`, shared with `no-fake-disabled-id`); the argument's callee identity is
// `lib/reference-fact-call.ts` (`resolveCallableOrigin`, shared with `no-raw-id`'s Zod door); the refusal is
// `lib/origin-verdict.ts` (`classifyOriginRefusal`, shared with both). `MODULE_GENERATORS` below is the one
// table, and it is a generator VOCABULARY — the set of library mints this policy names — not an exemption
// list: adding a row makes the policy flag MORE.
//
// POPULATION PORT: an intentional NARROWING, and this is the one to re-open if a finding is ever missed.
// The legacy descriptor (`1ee6bb982^:tooling/src/verify/gates/no-mint-via-cast.ts:156`) subtracted rather
// than selected — `scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/")
// || TEST_FILE_REGEX.test(p))` — so it also judged `tooling/src`, which `@packages` does not. That is the
// deliberate reading of the law (`castId` is a product-code mint seam and `@packages` is the six-root set
// every sibling was authored against), not an oversight, and the `tests are outside this production mint
// policy` mustPass row is the surviving half of the legacy subtraction stated positively.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the text above kept: "an intentional NARROWING" states one
// direction of a port that moves in BOTH. Measured over the harness candidates at `1ee6bb982^`: legacy − final = 986
// `tooling/src` paths plus `packages/showcase-plugins/src/index.ts` (the narrowing stated), and final − legacy = 13
// production server files the legacy SUBSTRING subtraction wrongly excluded — `domain/regex/verbs/scripts/*` (10,
// matched `scripts/`) and `domain/rpg/tools/*` (3, matched `tools/`). That widening was unrecorded; it repairs a
// legacy blind spot.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-mint-via-cast` descriptor at d10462449bb3b00307033eece47312f45455ca74, the parent of the conversion `1ee6bb982`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,132 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 4,324
// and final `population` admits 3,350. legacy − final = 987 — `tooling/src/**` (986) plus the showcase file; the
// recorded narrowing. final − legacy = 13 production server files the legacy `includes("scripts/"|"tools/")`
// subtraction wrongly excluded — `domain/regex/verbs/scripts/*` (10) and `domain/rpg/tools/*` (3); an UNRECORDED
// widening that repairs a legacy blind spot. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected
// by both.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ModuleMemberOrigin, ReferenceOrigin } from "../contract/reference-fact.ts";
import { createKitIdCallMatcher, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "castId wraps a fresh-id generator — use `mintTypeId(ID_PREFIX.x)` for TypeIDs or `newId<T>()` for deliberately prefixless brands.";
/** THE FAIL-CLOSED THIRD ANSWER, kept DISJOINT from `MESSAGE` on purpose: the unreadable arm emits the
 *  same finding COUNT as the ordinary verdict and differs only here, so a shared prefix would leave both
 *  arms unpinnable in either direction (guide §6.1). No fragment of either text occurs in the other. */
const UNREADABLE =
  "a cast seam or its argument enters through a door the shared readers cannot place, so whether this launders a fresh-id generator into a brand CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const MODULE_GENERATORS: Readonly<Record<string, ReadonlySet<string>>> = {
  "node:crypto": new Set(["randomUUID"]),
  crypto: new Set(["randomUUID"]),
  nanoid: new Set(["nanoid"]),
  uuid: new Set(["v4"]),
  "@paralleldrive/cuid2": new Set(["createId"]),
};

function moduleName(target: ModuleMemberOrigin): string {
  return target.canonical.kind === "external-door" ? target.canonical.moduleSpecifier : target.moduleSpecifier;
}

/** PURE: is this resolved callee one of the library mints {@link MODULE_GENERATORS} names, or the ambient
 *  `crypto.randomUUID`? The vocabulary and the two global clauses live HERE and nowhere else, so the direct
 *  argument position and the receiver walk can never drift into disagreeing about what a generator is. */
function isGenerator(target: ReferenceOrigin): boolean {
  if (target.kind === "global") {
    return target.globalName === "crypto" && target.memberPath.join(".") === "randomUUID";
  }
  return target.memberPath.length === 0 && MODULE_GENERATORS[moduleName(target)]?.has(target.exportedName) === true;
}

/** The RECEIVER a method call hangs off, when that receiver is itself a call — `gen().slice(…)`'s `gen()`.
 *  `undefined` ends the walk, which is what makes the walk total on any expression shape.
 *
 *  THE `isCallExpression` TEST IS A TYPE OBLIGATION, NOT AN UNPINNED FENCE (guide §6.1's unreachable-clause
 *  class): `resolveCallableOrigin` takes a `CallExpression`, so cutting the test does not widen the policy,
 *  it fails to compile. No row is owed for it and none is written. */
function receiverCall(call: CallExpression): CallExpression | undefined {
  const callee = call.getExpression();
  const receiver = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : undefined;
  return receiver !== undefined && Node.isCallExpression(receiver) ? receiver : undefined;
}

/** THE RESULT-METHOD WALK (#2042). `castId(gen().slice(0, 8))` is the same offence as `castId(gen())` — the
 *  brand still comes into existence from a fresh library mint — but the DIRECT reader answers about
 *  `String#slice`, which is a real declaration and therefore a different identity. So the generator question
 *  is asked again of each receiver call up the chain.
 *
 *  IT RETURNS A BOOLEAN, AND THAT IS THE CONTAINMENT. A receiver the shared readers cannot place is simply
 *  `false` here — the walk can only ever ADD a generator verdict, never manufacture an accusation out of an
 *  unreadable node. The fail-closed third answer stays exactly where it was, keyed on the DIRECT position's
 *  own refusal, so this widening cannot enlarge the unreadable arm's population. */
function launderedThroughResult(call: CallExpression): boolean {
  for (let receiver = receiverCall(call); receiver !== undefined; receiver = receiverCall(receiver)) {
    const origin = resolveCallableOrigin(receiver);
    if (origin.kind !== "unresolved" && isGenerator(origin.value.target)) {
      return true;
    }
  }
  return false;
}

/** The three answers a cast argument can give. `other` is the ONLY silence: the argument is not a call at
 *  all, or its callee provably binds a declaration that is not a module import (a string method, a request
 *  accessor, an injected op) and no generator is laundered through its receiver chain.
 *
 *  THE GENERATOR QUESTION IS ASKED BEFORE THE REFUSAL, deliberately, and the ORDER IS THE WHOLE FENCE
 *  (#2042, cut-measured 2026-09-12: moving the refusal ahead of the walk kills BOTH hop `mustFlag` rows).
 *  `classifyOriginRefusal` answers an unresolved callee with EITHER `other` — case (a), a provable
 *  non-module declaration — or `unreadable`, and every laundering chain arrives here unresolved at its
 *  DIRECT position because the direct callee is the method, not the mint. So asking the refusal first does
 *  not merely re-message the finding: it returns `other` for the case-(a) chains and silences them outright,
 *  which is the blindness this walk exists to end. Ask what the subject IS before recording what could not
 *  be read about it. */
function argumentVerdict(cast: CallExpression): "generator" | "other" | "unreadable" {
  const node = cast.getArguments()[0];
  if (node === undefined || !Node.isCallExpression(node)) {
    return "other";
  }
  const origin = resolveCallableOrigin(node);
  if (origin.kind !== "unresolved" && isGenerator(origin.value.target)) {
    return "generator";
  }
  if (launderedThroughResult(node)) {
    return "generator";
  }
  return origin.kind === "unresolved" ? classifyOriginRefusal(origin.reason, node.getExpression()) : "other";
}

export const gate = defineGate({
  id: "no-mint-via-cast",
  family: "id-brand-flow",
  authority: "hard",
  severity: "error",
  population: "@packages",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "replace generator laundering with the canonical kit mint for the intended id class.",
  create: (ctx) => {
    const isCastId = createKitIdCallMatcher("castId");
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const seam = isCastId(node);
            if (seam === "other") {
              return;
            }
            // A seam the checker could not place is itself the third answer: the argument question is
            // unanswerable when it is not even established that this IS the canonical cast.
            const verdict = seam === "unreadable" ? "unreadable" : argumentVerdict(node);
            if (verdict === "generator") {
              ctx.report.node(node.getExpression());
              return;
            }
            if (verdict === "unreadable") {
              ctx.report.node(node.getExpression(), { message: UNREADABLE });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { randomUUID as uuid } from "node:crypto";\nimport { castId as brand } from "../../kit/src/ids/index";\nexport const x = brand(uuid());\n',
      },
      expect: { count: 1, token: "brand" },
      why: "aliases cannot hide the canonical cast seam or Node randomUUID. THE TOKEN IS THE CLAIM (#1968): the `why` says ALIASES, and `brand` — the local import alias, not `castId` — is what the report anchors on, so a bare `{ count: 1 }` would pass just as happily if the policy had anchored on the canonical name and the alias claim were untested",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.randomUUID());\n',
      },
      expect: { count: 1, token: "castId" },
      why: 'THE GLOBAL ARM (`target.kind === "global"`), reached by no row before #2047 — a `throw` planted in it left every row green. The ambient `crypto` needs no plant: the proof workspace loads TypeScript\'s own lib files, which `isAmbientGlobalDeclaration` trusts, so the browser/worker spelling `crypto.randomUUID()` resolves to the global rather than to a `node:crypto` import and takes the branch the two `mustFlag` rows above cannot. Its twin is the `local same-named function` mustPass row, which uses the SAME global expression through a non-canonical seam',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { nanoid } from "nanoid";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(nanoid());\n',
      },
      expect: { count: 1 },
      why: "nanoid output must use the canonical prefixless mint instead of cast laundering",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\ndeclare function opaque(): any;\nexport const x = castId(opaque().newId());\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), and until #2041 this policy FAILED OPEN here: the argument is a call off an OPAQUE `any`-typed receiver, so its callee binds no declaration at all and `classifyOriginRefusal` answers case (b). A HARD ban that acquits a subject it cannot read is the fail-open shape, so it is now REPORTED. The `messageIncludes` is the whole row — the unreadable arm emits the SAME single finding the generator verdict does and differs only in message, so a bare `{ count: 1 }` would pass unchanged if the arm were failed open again",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { randomUUID } from "node:crypto";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(randomUUID().replace("-", ""));\n',
      },
      expect: { count: 1, token: "castId", messageIncludes: "castId wraps a fresh-id generator" },
      why: "THE RESULT-METHOD HOP (#2042), MODULE ARM. A method call on a generator's RESULT was the laundering spelling this policy could not see: `argumentVerdict` asks only the argument call's OWN callee, which here is `String#replace` — a real declaration, so the pre-hop verdict was case (a) `other` and a HARD ban said nothing about a fresh uuid being branded. The gap was not hypothetical and was not new: the `crypto.getRandomValues` mustPass row's own `why` already recorded that a draft wrapping the call in `.toString()` \"passed for a reason unrelated to this fence\". THE VOCABULARY IS UNCHANGED — only the POSITION the policy is willing to look at moved, which is why the cut direction is FLAGS MORE. THE `messageIncludes` IS LOAD-BEARING AND WAS PAID FOR: a first draft used an UNTYPED generator (`nanoid()`, no @types in the proof workspace, so its result is `any`), which made the method callee bind nothing and the row PASSED AT TIP through the fail-closed UNREADABLE arm — a bare `{ count: 1, token }` cannot tell the hop from the third answer, because both emit exactly one finding on the same node",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.randomUUID().replace("-", "").slice(0, 12));\n',
      },
      expect: { count: 1, token: "castId", messageIncludes: "castId wraps a fresh-id generator" },
      why: "THE HOP IS A WALK, NOT ONE STEP, and this row is what dies if it is cut back to a single step: the generator sits TWO receivers deep behind `.replace(…).slice(…)`, which is the realistic short-id laundering rather than a contrived depth. It also carries the walk over the GLOBAL arm (`crypto.randomUUID`), whose one-step twin reaches the same predicate through the DIRECT position — so the walk and the global generator test are falsified together here and separately above. Same `messageIncludes` reason as the row above",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\ndeclare const row: { id: string };\nexport const x = castId(row.id);\n',
      },
      why: "branding an id read from an untyped seam is the helper's intended use",
    },
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "function castId(value: string): string { return value; }\nexport const x = castId(crypto.randomUUID());\n" },
      why: "a local same-named function is not the kit cast seam",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.getRandomValues(new Uint8Array(1)));\n',
      },
      why: '§4.1 NARROWING (THE GLOBAL ARM\'S MEMBER): `target.memberPath.join(".") === "randomUUID"`. The SAME ambient global, a DIFFERENT member — `crypto.getRandomValues` is entropy, not an id mint. THE ARGUMENT MUST BE THE GLOBAL CALL ITSELF: `argumentVerdict` resolves the origin of the argument call\'s OWN callee, so a first draft of this row wrapping it in `.toString()` asked about `Uint8Array#toString`, passed for a reason unrelated to this fence, and SURVIVED the cut — which is how it was caught. Its twin below plants a different global carrying the same member name, so the arm\'s two clauses are falsified separately',
    },
    {
      mode: "types",
      files: {
        "node_modules/@types/crypto-lookalike/index.d.ts": "declare var lookalikeCrypto: { randomUUID(): string };\n",
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts": 'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(lookalikeCrypto.randomUUID());\n',
      },
      why: "§4.1 NARROWING (THE GLOBAL ARM'S NAME): `target.globalName === \"crypto\"`. Nothing but the resolved global NAME separates this row from the `crypto.randomUUID()` mustFlag row — same member, same shape, same call. The lookalike is planted under `node_modules/@types/` because `isAmbientGlobalDeclaration` trusts only TypeScript's own lib files and `@types` packages; a bare script-global would be refused before the comparison and the row would pass for the wrong reason (`_proof/node-types.ts` records that asymmetry). Widening the trust rule to make a fixture resolve would weaken a real identity fence, so the fixture moves instead",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/slug.ts": 'export function makeSlug(): string { return "s"; }\n',
        "packages/server/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\nimport { makeSlug } from "./slug";\nexport const x = castId(makeSlug());\n',
      },
      why: "§4.1 NARROWING (THE GENERATOR VOCABULARY): `MODULE_GENERATORS`. A project function returning a string, called through the CANONICAL cast seam, passes — `castId(<call>)` is not the offence, `castId(<a library mint>)` is. Before #2047 the table was unpinned: replacing the lookup with `true` left every row green, so the policy would have banned branding the result of ANY call and nothing said otherwise",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { nanoid } from "nanoid";\nimport { castId } from "../../kit/src/ids/index";\nexport const x = castId(nanoid.customAlphabet());\n',
      },
      why: '§4.1 NARROWING (THE EXPORT ITSELF, NOT A MEMBER OF IT): `target.memberPath.length === 0`. A MEMBER call hanging off a named generator export is a different function from the generator — `nanoid.customAlphabet()` builds a generator, it does not mint. Note which fixture does NOT discriminate here and why: `castId(ids.nanoid())` through `import * as ids from "nanoid"` still FLAGS at tip, because the shared reader canonicalises a namespace member down to the module\'s own export and hands back an EMPTY member path. The distinction the fence draws is about the resolved origin, not about the authored dots',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "tests/server/x.test.ts":
          'import { nanoid } from "nanoid";\nimport { castId } from "../../packages/kit/src/ids/index";\nexport const x = castId(nanoid());\n',
      },
      why: "tests are outside this production mint policy",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\nexport const x = castId(crypto.getRandomValues(new Uint8Array(32)).toString());\n',
      },
      why: 'ENTROPY IS NOT AN ID MINT, AND NOW THROUGH THE WALK (#2042) — this is the shape of the SESSION-TOKEN MINT, `packages/server/src/domain/sessions/tokens/tokens.ts` `mintSessionToken`, which brands `randomBytes(32).toString("base64url")` and MUST stay silent. `randomBytes`/`getRandomValues` are CSPRNG BYTE SOURCES — raw bytes, no identity semantics, no uniqueness contract, no format — whereas every member of `MODULE_GENERATORS` returns a finished IDENTIFIER this codebase has a canonical mint for. A session token is not an id at all: it is a 256-bit opaque BEARER SECRET, looked up by peppered HMAC digest, and `castId` sits inside that one function precisely so no other module can conjure one. THIS ROW EXISTS TO STOP A FUTURE LANE \'FIXING\' THAT SITE: the two remedies this policy\'s own message prescribes both mint a TypeID — a UUIDv7 carrying an embedded millisecond timestamp and roughly 74 random bits — so obeying the ban there would trade an opaque 256-bit secret for a timestamped, materially lower-entropy one, and a gate whose remedy WEAKENS the thing it polices is worse than no gate. That is why the vocabulary is NOT widened to `randomBytes` and why this is a `mustPass` rather than a waiver on correct code. IT IS THE GLOBAL ARM\'S MEMBER CLAUSE THROUGH THE WALK (`memberPath === "randomUUID"`), the `.toString()` draft the sibling `getRandomValues` row above records as having "passed for a reason unrelated to this fence" — before the walk it did; now it reaches the fence and is pinned there. THE FIXTURE IS THE AMBIENT GLOBAL, NOT `node:crypto`, AND THAT IS A MEASURED WORKSPACE LIMIT, NOT A WEAKER CLAIM: the isolated proof workspace cannot type an `@types/node` RETURN value, so `randomBytes(32).toString(…)` binds no method declaration there and the row would go red through the UNREADABLE arm for a reason that has nothing to do with this fence (measured 2026-09-12; `crypto.getRandomValues` returns a `Uint8Array` from TypeScript\'s OWN lib, which does resolve). The live site is unaffected either way, because the walk answers `false` at `randomBytes` and hands the verdict back unchanged',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idCastProofModule(),
        "packages/server/src/slug.ts": 'export function makeSlug(): string { return "s"; }\n',
        "packages/server/src/x.ts":
          'import { castId } from "../../kit/src/ids/index";\nimport { makeSlug } from "./slug";\nexport const x = castId(makeSlug().toUpperCase());\n',
      },
      why: "§4.1 NARROWING (THE VOCABULARY, THROUGH THE WALK): the receiver walk asks the SAME `isGenerator` question the direct position asks, so a project function called through a result method is not the offence. Replace the walk's vocabulary test with `true` and this row reddens while every hop `mustFlag` row stays green — which is the whole claim, since a walk that flagged any call-on-a-call would ban `castId(row.load().trim())` across the tree. IT IS THE MODULE HALF OF `isGenerator`, AND ITS TWIN ABOVE IS THE GLOBAL HALF — cut-measured 2026-09-12, the two are NOT redundant: opening the global member clause (`memberPath === \"randomUUID\"` → any `crypto` member) reddens the session-mint row and the direct `getRandomValues` row and leaves THIS one green, while cutting the walk's vocabulary test reddens both of these and leaves the direct row green",
    },
  ],
});
