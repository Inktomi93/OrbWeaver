// The standing family floor for seven ORDINARY policies that each declare a SINGLETON `family:` — their own
// id — and which, before this file, had no family test anywhere in `tests/tooling/verify/gates/` (#1994,
// re-derived 2026-09-12 by grepping each id across that directory with a `no-inline-types` positive
// control). They are grouped here by that fact and nothing else; the header says so plainly rather than
// inventing a shared theme, because §7 item 4 of docs/design/gate-runtime-standardization.md is explicit that a
// theme is not a family.
//
//   baseui-render-prop-composition  — `asChild` (Radix's idiom) in @client/@ui JSX or a props signature.
//   bus-on-data-no-store-write      — a raw `.setState(` inside a bus onData/onConnectionStateChange body.
//   membership-fan-guard            — the `emitUserEvent` identifier under domain/chat/**.
//   no-caller-user-id               — the `callerUserId` identifier anywhere but this gate tree.
//   no-external-media-without-gate  — raw <img>/<video>/<audio>/<source> in a client feature.
//   test-factory-contract           — the make*/seed* pure-vs-persisted split under tests/support/factories.
//   no-array-literal-querykey       — an inline array-literal `queryKey:` property in @client.
//
// THE SEVENTH JOINED 2026-09-12 (lane p-parity-tier2bc), and it is #1994's last one. That row read "nine
// modules have NO family test"; eight landed at `e64c274ef` and the row said to RE-DERIVE the remainder.
// Re-derived by grepping each of the nine ids as a STRING across `tests/tooling/verify/` — the rule that a
// family test often lives under the WAVE's name rather than the gate's — exactly one still had none:
// `no-array-literal-querykey`. Its two hits were a suppression-grammar fixture in
// `verify/lib/suppression-directive.test.ts` and this lane's own Tier-3 roster test, neither of which
// drives the policy. It lands HERE rather than in a new file because it is the same fact that grouped the
// other six: an ORDINARY policy with a singleton `family:` and nowhere for its §4.2 arm to live.
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER: every one of these modules'
// declared `mustFlag`/`mustPass` rows already executes on the static bar (`structure:policy-conformance`),
// and five of the six already carry an in-module `mustPass` waiver row — the other valid §4.2 shape. What a
// `mustPass` row structurally does NOT assert, and what therefore lives here, is `waivedFindings === 1` and
// `authorityAlarms === []`: a row is green when the marker suppressed the finding AND green when the
// fixture's finding was never produced in the first place, and it cannot distinguish "suppressed" from
// "consumed nothing". The §4.2 triple — `effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []` —
// is the arm (gold standard: ordinary-visitors-family.test.ts:187-196, the POSITIVE arm only). §4.8's
// fixture-specifier resolution control is the other standing piece of every family floor.
//
// §4.3 (reviewed grants) and §4.5 (refusal/receipt) do not apply to any of the seven: all declare `facts: []`
// and `resources: []`, resolve no home and derive no population, so there is no receipt to forge and
// nothing to refuse about. §4.6 (the conversion differential): its "landing-commit evidence, not standing
// law" clause was RETIRED by #2000 deliverable 3 (`2084c403e`) — evidence may no longer vanish. Three of
// the seven (`baseui-render-prop-composition`, `no-external-media-without-gate`,
// `no-array-literal-querykey`) are on the Tier-3 CLOSE-BY-RULE roster, whose membership test, receipts and
// stated limits live in `tier3-close-by-rule.test.ts`; the other four are not, and their differentials are
// open #2000 work rather than something this file claims.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as baseuiRenderPropComposition } from "../../../../tooling/src/verify/gates/baseui-render-prop-composition.ts";
import { gate as busOnDataNoStoreWrite } from "../../../../tooling/src/verify/gates/bus-on-data-no-store-write.ts";
import { gate as membershipFanGuard } from "../../../../tooling/src/verify/gates/membership-fan-guard.ts";
import { gate as noArrayLiteralQueryKey } from "../../../../tooling/src/verify/gates/no-array-literal-querykey.ts";
import { gate as noCallerUserId } from "../../../../tooling/src/verify/gates/no-caller-user-id.ts";
import { gate as noExternalMediaWithoutGate } from "../../../../tooling/src/verify/gates/no-external-media-without-gate.ts";
import { gate as testFactoryContract } from "../../../../tooling/src/verify/gates/test-factory-contract.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/singleton-ordinary-policies";

const FAMILY: readonly GatePolicy[] = [
  baseuiRenderPropComposition,
  busOnDataNoStoreWrite,
  membershipFanGuard,
  noCallerUserId,
  noExternalMediaWithoutGate,
  testFactoryContract,
  noArrayLiteralQueryKey,
];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test("the seven singleton-family ordinary policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). A proof row's relative import that resolves to NOTHING
// makes every identity row pass by FAIL-CLOSURE while conformance still reports green.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test("every relative import in every proof of these seven resolves inside the proof's own file map", () => {
  const shared = new Project({ useInMemoryFileSystem: true });
  const dangling: string[] = [];
  let sequence = 0;
  for (const policy of FAMILY) {
    for (const { proof } of policyProofRows(policy)) {
      sequence += 1;
      const root = `${ROOT}-proof-${sequence}`;
      const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
      dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
      for (const file of files) {
        shared.removeSourceFile(file);
      }
    }
  }
  expect(dangling).toEqual([]);
  // AND THE SWEEP ACTUALLY RAN: "zero dangling" and "no row was visited" look identical, so the expected
  // count is DERIVED from the descriptors rather than hand-carried.
  const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
  expect(sequence).toBe(declared);
  expect(sequence).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY (§4.2), one positive arm per policy: the correct `@orb-waive <id>(<position>)`
// at the position the policy reports suppresses its ONE finding, consumes exactly one waiver, and raises no
// authority alarm. Every fixture produces exactly one finding, because one marker consumes one occurrence.
// The assertions are written out in each test rather than behind a shared helper — a helper hides them from
// the `useExpect` lint, and an arm that silently asserts nothing is precisely the defect class this file
// exists to close.
//
// The position each policy reports is NOT uniformly "the thing the message names", which is why each needs
// its own arm:
//   baseui-render-prop-composition  the ATTRIBUTE NAME, not the tag or the whole attribute
//   bus-on-data-no-store-write      the bare `setState` identifier — the marker grammar forbids parens
//   membership-fan-guard            each banned identifier OCCURRENCE
//   no-caller-user-id               each banned identifier OCCURRENCE
//   no-external-media-without-gate  DERIVED (the report passes no token) -> the tag name `img`
//   test-factory-contract           the FACTORY'S OWN NAME, not the `db` parameter the message names
//   no-array-literal-querykey       the PROPERTY NAME `queryKey`, not the array literal or its first element
// ---------------------------------------------------------------------------------------------------
const REASON = "the proof's stand-in reason; ends when this fixture stops flagging.";

test("baseui-render-prop-composition: a waiver naming the ATTRIBUTE binds to its own finding", () => {
  const waived = passOf(baseuiRenderPropComposition, {
    "packages/ui/src/primitives/menu/waived.tsx": `// @orb-waive baseui-render-prop-composition(asChild): ${REASON}\nexport const G = <Menu.Trigger asChild />;\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("bus-on-data-no-store-write: a waiver naming the bare setState identifier binds to its own finding", () => {
  const waived = passOf(busOnDataNoStoreWrite, {
    "packages/client/src/data/bus/waived.ts": `export const sub = {\n  onData: () => {\n    // @orb-waive bus-on-data-no-store-write(setState): ${REASON}\n    useX.setState({ a: 1 });\n  },\n};\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("membership-fan-guard: a waiver naming the banned identifier binds to its single occurrence", () => {
  const waived = passOf(membershipFanGuard, {
    "packages/server/src/domain/chat/verbs/waived.ts": `// @orb-waive membership-fan-guard(emitUserEvent): ${REASON}\nexport const forward = emitUserEvent;\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("no-caller-user-id: a waiver naming the banned identifier binds to its single occurrence", () => {
  const waived = passOf(noCallerUserId, {
    "packages/server/src/domain/chat/waived.ts": `// @orb-waive no-caller-user-id(callerUserId): ${REASON}\nexport const forward = (callerUserId: string): void => undefined;\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("no-external-media-without-gate: a waiver naming the DERIVED tag-name position binds to its finding", () => {
  const waived = passOf(noExternalMediaWithoutGate, {
    "packages/client/src/features/x/waived.tsx": `// @orb-waive no-external-media-without-gate(img): ${REASON}\nexport const G = <img src="bad" />;\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("test-factory-contract: a waiver naming the FACTORY, not its db parameter, binds to its finding", () => {
  const waived = passOf(testFactoryContract, {
    "tests/support/factories/waived.ts": `// @orb-waive test-factory-contract(makeUser): ${REASON}\nexport function makeUser(db: unknown) {\n  return db;\n}\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// AND THE ARMS DISCRIMINATE. Written once over the whole set rather than six times: for each policy, the
// SAME fixture with the marker's position replaced by a name the carrier does not declare must leave the
// finding EFFECTIVE and raise an alarm naming that policy. Without this, every arm above would be equally
// green against a policy that reported an unspellable position and a waiver engine that silently matched
// nothing — the #1954 `.setState(` defect, which shut `bus-on-data-no-store-write`'s door completely while
// every one of its proof rows stayed green.
// ---------------------------------------------------------------------------------------------------
const DEAD = "names a position this carrier does not declare.";

test("a waiver naming a DEAD position suppresses nothing and alarms, for every one of the seven", () => {
  const arms: readonly (readonly [GatePolicy, Readonly<Record<string, string>>])[] = [
    [
      baseuiRenderPropComposition,
      {
        "packages/ui/src/primitives/menu/dead.tsx": `// @orb-waive baseui-render-prop-composition(asChildElement): ${DEAD}\nexport const G = <Menu.Trigger asChild />;\n`,
      },
    ],
    [
      busOnDataNoStoreWrite,
      {
        "packages/client/src/data/bus/dead.ts": `export const sub = {\n  onData: () => {\n    // @orb-waive bus-on-data-no-store-write(setStateX): ${DEAD}\n    useX.setState({ a: 1 });\n  },\n};\n`,
      },
    ],
    [
      membershipFanGuard,
      {
        "packages/server/src/domain/chat/verbs/dead.ts": `// @orb-waive membership-fan-guard(emitChatChanged): ${DEAD}\nexport const forward = emitUserEvent;\n`,
      },
    ],
    [
      noCallerUserId,
      {
        "packages/server/src/domain/chat/dead.ts": `// @orb-waive no-caller-user-id(triggeredBy): ${DEAD}\nexport const forward = (callerUserId: string): void => undefined;\n`,
      },
    ],
    [
      noExternalMediaWithoutGate,
      { "packages/client/src/features/x/dead.tsx": `// @orb-waive no-external-media-without-gate(src): ${DEAD}\nexport const G = <img src="bad" />;\n` },
    ],
    [
      testFactoryContract,
      { "tests/support/factories/dead.ts": `// @orb-waive test-factory-contract(db): ${DEAD}\nexport function makeUser(db: unknown) {\n  return db;\n}\n` },
    ],
    [
      noArrayLiteralQueryKey,
      { "packages/client/src/features/a/dead.ts": `// @orb-waive no-array-literal-querykey(users): ${DEAD}\nexport const q = { queryKey: ["users", 1] };\n` },
    ],
  ];

  const unbound = arms
    .map(([policy, files]) => {
      const result = passOf(policy, files);
      const alarmed = result.authority.authorityAlarms.some((alarm) => alarm.policyId === policy.id);
      return result.authority.effectiveFindings.length === 1 && alarmed ? null : policy.id;
    })
    .filter((id) => id !== null);

  expect(unbound).toEqual([]);
  // The sweep covers the WHOLE family, never a subset that silently shrank.
  expect(arms).toHaveLength(FAMILY.length);
});

test("no-array-literal-querykey: a waiver naming the PROPERTY NAME binds to its own finding", () => {
  const waived = passOf(noArrayLiteralQueryKey, {
    "packages/client/src/features/a/waived.ts": `// @orb-waive no-array-literal-querykey(queryKey): ${REASON}\nexport const q = { queryKey: ["users", 1] };\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});
