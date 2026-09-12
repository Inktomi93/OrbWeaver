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
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ModuleMemberOrigin } from "../contract/reference-fact.ts";
import { createKitIdCallMatcher, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { idCastProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "castId wraps a fresh-id generator — use `mintTypeId(ID_PREFIX.x)` for TypeIDs or `newId<T>()` for deliberately prefixless brands.";
/** THE FAIL-CLOSED THIRD ANSWER, kept DISJOINT from `MESSAGE` on purpose: the unreadable arm emits the
 *  same finding COUNT as the ordinary verdict and differs only here, so a shared prefix would leave both
 *  arms unpinnable in either direction (guide §4.1). No fragment of either text occurs in the other. */
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

/** The three answers a cast argument can give. `other` is the ONLY silence: the argument is not a call at
 *  all, or its callee provably binds a declaration that is not a module import (a string method, a request
 *  accessor, an injected op) and is therefore a different identity. */
function argumentVerdict(cast: CallExpression): "generator" | "other" | "unreadable" {
  const node = cast.getArguments()[0];
  if (node === undefined || !Node.isCallExpression(node)) {
    return "other";
  }
  const origin = resolveCallableOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node.getExpression());
  }
  const target = origin.value.target;
  if (target.kind === "global") {
    return target.globalName === "crypto" && target.memberPath.join(".") === "randomUUID" ? "generator" : "other";
  }
  return target.memberPath.length === 0 && MODULE_GENERATORS[moduleName(target)]?.has(target.exportedName) === true ? "generator" : "other";
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
  ],
});
