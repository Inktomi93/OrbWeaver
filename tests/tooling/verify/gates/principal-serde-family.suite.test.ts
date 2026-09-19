// Family test for the three Principal/serde gates landed in 287a706c0 (#2381-#2383): none had a family
// test under `tests/tooling/**` (#2433, `git grep` over `tests/tooling/` found nothing but the proof rows
// and the ledger row). All three are declared SINGLETONS (each gate's header states `family: a declared
// SINGLETON under its own id — no shared reader exists`), so this file owns the family's shared drivers:
// the production-dispatched proof triple (`verifyPolicyProofs`) plus the controls a `mustFlag`/`mustPass`
// row cannot express on its own — running `runPolicyPass` directly so a near-miss/positive/limit claim is
// driven independently of the gate's own declared rows, per the standing law's "use the proof owner that
// can express the claim".
//
// `one-principal-mint-population` and `entry-synthetic-role-is-user` are the #2381/#2382 PAIR (one
// watches the mint SITE, the other the mint SHAPE); `serde-core-definition-uniqueness` (#2383) is
// unrelated in subject but ships in the same conversion commit, so it is proven here rather than in a
// fourth near-singleton file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as entrySyntheticRoleIsUser } from "../../../../tooling/src/verify/gates/entry-synthetic-role-is-user.ts";
import { gate as onePrincipalMintPopulation } from "../../../../tooling/src/verify/gates/one-principal-mint-population.ts";
import { gate as serdeCoreDefinitionUniqueness } from "../../../../tooling/src/verify/gates/serde-core-definition-uniqueness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/principal-serde-family";
const GATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../tooling/src/verify/gates");

const FAMILY: readonly GatePolicy[] = [onePrincipalMintPopulation, entrySyntheticRoleIsUser, serdeCoreDefinitionUniqueness];

test("the #2381-#2383 Principal/serde policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([...FAMILY])).toEqual([]);
});

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

// ---------------------------------------------------------------------------------------------------
// one-principal-mint-population (#2381) — the SITE seal.
// ---------------------------------------------------------------------------------------------------

test("a `satisfies Principal` mint outside entry/ is flagged — the annotation-free escape the landed patterns reported zero times", () => {
  const result = passOf(onePrincipalMintPopulation, {
    "packages/server/src/domain/chat/verbs/sat.ts":
      'export function mint(id: string) {\n  return { userId: id, role: "user", handle: id, externalId: null, via: "fallback" } satisfies Principal;\n}\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "one-principal-mint-population", file: "packages/server/src/domain/chat/verbs/sat.ts" },
  ]);
});

test("an `as Principal` mint outside entry/ is flagged — the strongest fabrication surface, since the assertion silences tsc entirely", () => {
  const result = passOf(onePrincipalMintPopulation, {
    "packages/server/src/domain/chat/verbs/asr.ts": "export function mint(row: unknown) {\n  return row as Principal;\n}\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "one-principal-mint-population", file: "packages/server/src/domain/chat/verbs/asr.ts" },
  ]);
});

test("a Principal-typed PARAMETER or field never constructs one — mentions are not mints", () => {
  const result = passOf(onePrincipalMintPopulation, {
    "packages/server/src/domain/chat/verbs/consume.ts":
      "export function use(caller: Principal, other: Principal | null): string {\n  return caller.userId + String(other);\n}\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// entry-synthetic-role-is-user (#2382) — the SHAPE seal. `authority: "hard"` — no waiver door, so a
// false positive here is unwaivable, which is exactly why the #2382 review moved the discriminator off
// file-level word co-occurrence onto the object-literal shape.
// ---------------------------------------------------------------------------------------------------

test('THE NEAR-MISS the 287a706c0 fix was about: a chat message literal `role: "user"` in a file that genuinely imports Principal is NOT flagged', () => {
  const result = passOf(entrySyntheticRoleIsUser, {
    "packages/server/src/domain/chat/verbs/message.ts":
      'import type { Principal } from "@orb/contracts/identity";\nexport function turn(caller: Principal, text: string) {\n  return { role: "user", content: text, by: caller.userId };\n}\n',
  });

  // The landed file-level "does this file mention Principal AND role: \"user\"" discriminator flagged
  // this under hard authority (no waiver door). The rewrite reads the OBJECT LITERAL's own shape — a
  // chat message carries neither `externalId`/`via` nor a Principal annotation — so it must stay clean.
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a Principal-shaped literal (own body carries externalId+via) outside entry/ is flagged — the POSITIVE this gate exists to catch", () => {
  const result = passOf(entrySyntheticRoleIsUser, {
    "packages/server/src/domain/chat/verbs/sneaky.ts":
      'import type { Principal } from "@orb/contracts/identity";\nconst p: Principal = { userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" };\nexport const x = p;\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "entry-synthetic-role-is-user", file: "packages/server/src/domain/chat/verbs/sneaky.ts" },
  ]);
});

test("a `satisfies Principal` mint outside entry/ with a hardcoded role is flagged too — the annotation-free positive", () => {
  const result = passOf(entrySyntheticRoleIsUser, {
    "packages/server/src/domain/chat/verbs/sat.ts":
      'export function mint(id: string) {\n  return { userId: id, role: "user", handle: id, externalId: null, via: "fallback" } satisfies Principal;\n}\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "entry-synthetic-role-is-user", file: "packages/server/src/domain/chat/verbs/sat.ts" },
  ]);
});

test("an `as Principal` mint outside entry/ with a hardcoded role is flagged too", () => {
  const result = passOf(entrySyntheticRoleIsUser, {
    "packages/server/src/domain/chat/verbs/asr.ts":
      'export function mint(id: string) {\n  return { userId: id, role: "user", handle: id, externalId: null, via: "fallback" } as Principal;\n}\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "entry-synthetic-role-is-user", file: "packages/server/src/domain/chat/verbs/asr.ts" },
  ]);
});

test("THE DECLARED LIMIT: an UNANNOTATED spread-built literal outside entry/ is not identified — a real blind spot, not a claimed catch", () => {
  // No annotation anywhere on the chain (no variable type, no return type, no as/satisfies), and the
  // literal's own body no longer spells externalId/via because they came from the spread. Neither
  // discriminator (a) nor (b) can see it. This test does NOT pretend the gate catches this shape — it
  // pins the miss so the gate's declared limit stays honest if the walk is later widened by accident.
  const result = passOf(entrySyntheticRoleIsUser, {
    "packages/server/src/domain/chat/verbs/spread.ts":
      'function elevate(base) {\n  const out = { ...base, role: "user" };\n  return out;\n}\nexport const x = elevate;\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("the gate's own header states the spread-built/no-annotation limit — the claim in the test above is documented, not assumed", () => {
  const source = readFileSync(join(GATES_DIR, "entry-synthetic-role-is-user.ts"), "utf8");
  expect(source).toContain("DECLARED LIMIT: a spread-built literal with NO annotation anywhere on the chain is not identified");
});

// ---------------------------------------------------------------------------------------------------
// serde-core-definition-uniqueness (#2383) — one canonical home for the three serde-core mapper symbols.
// ---------------------------------------------------------------------------------------------------

test("a second `cardFromJson` declaration in @server outside the canonical home is flagged", () => {
  const result = passOf(serdeCoreDefinitionUniqueness, {
    "packages/server/src/domain/import/substrate/dup.ts": "export function cardFromJson(raw: unknown): unknown { return raw; }\n",
    "packages/server/src/kit/serde/card/index.ts":
      "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "serde-core-definition-uniqueness", file: "packages/server/src/domain/import/substrate/dup.ts" },
  ]);
});

test("a same-named `cardFromJson` declared in packages/kit is OUT OF POPULATION — the policy is scoped to @server and never reads it", () => {
  // This is not a clean pass because the second declaration is fine; it is a clean pass because this
  // policy's declared population is `@server` and the kit file is never admitted for it to read.
  // `serde-core-seal` (a different gate) is what would judge a kit-side fork, not this one.
  const result = passOf(serdeCoreDefinitionUniqueness, {
    "packages/server/src/kit/serde/card/index.ts":
      "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
    "packages/kit/src/serde/card.ts": "export function cardFromJson(raw: unknown): unknown { return raw; }\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
