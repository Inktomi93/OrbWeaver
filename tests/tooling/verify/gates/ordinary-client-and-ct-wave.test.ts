// Conformance entry for the ORDINARY CLIENT-AND-CT wave (#1584): five legacy `GateDescriptor` modules
// converted into SEVEN final policies. They are grouped here by CONVERSION WAVE and nothing else — the
// header says so plainly rather than inventing a shared theme, because §5b.4 of
// docs/design/gate-runtime-standardization.md is explicit that a theme is not a family. Three real
// families are represented:
//
//   editor-form-factory        — form-factory-for-multifield · no-form-reset-in-autosave ·
//                                no-form-reset-in-autosave-health. The family IS its shared reader,
//                                tooling/src/verify/lib/editor-form-factory.ts.
//   context-definition-shape   — context-definition-shape · context-definition-shape-health (the two
//                                COUNT arms, split out because their execution is entire-population).
//   state-files / route-trpc-lifo-order — declared singletons; each module's header records why.
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER. Every declared
// `mustFlag`/`mustPass` row already executes on the static bar (`structure:policy-conformance`). What a
// `mustPass` row structurally CANNOT assert — and what therefore lives here — is the §4.2 triple:
// `effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []`. A `mustPass` waiver row is green when
// the marker suppressed the finding AND green when the fixture never flagged at all, so on its own it
// cannot distinguish "suppressed" from "consumed nothing". Gold standard:
// ordinary-visitors-family.test.ts:187-196, the POSITIVE arm only.
//
// It also carries the §4.6 FIXTURE-LEVEL DIFFERENTIAL for `form-factory-for-multifield`, which replaced
// this file's predecessor. `tests/tooling/verify/gates/form-factory-for-multifield.int.test.ts` was the
// permanent #620 pin and drove `gate.visitFile` through a hand-rolled `GateRunCtx`; that entry point no
// longer exists, and its token assertions (`"Probe (3 fields)"`) named a spelling the central marker
// grammar's position group `[^()\r\n]+` can never parse. Every one of its #620 cases is re-pinned below
// through the PRODUCTION dispatcher instead, which is a strictly stronger driver: the old pin could not
// have caught the unwaivable-token defect it was asserting.
//
// §4.3 (reviewed grants) does not apply: all seven declare `facts: []` and `resources: []` and no policy
// here is `authority: "reviewed-grant"`. §4.5's refusal control applies to `no-form-reset-in-autosave-
// health` and `context-definition-shape-health`, whose verdicts depend on a derived population; both are
// pinned below.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as contextDefinitionShape } from "../../../../tooling/src/verify/gates/context-definition-shape.ts";
import { gate as contextDefinitionShapeHealth } from "../../../../tooling/src/verify/gates/context-definition-shape-health.ts";
import { gate as formFactoryForMultifield } from "../../../../tooling/src/verify/gates/form-factory-for-multifield.ts";
import { gate as noFormResetInAutosave } from "../../../../tooling/src/verify/gates/no-form-reset-in-autosave.ts";
import { gate as noFormResetInAutosaveHealth } from "../../../../tooling/src/verify/gates/no-form-reset-in-autosave-health.ts";
import { gate as routeTrpcLifoOrder } from "../../../../tooling/src/verify/gates/route-trpc-lifo-order.ts";
import { gate as stateFiles } from "../../../../tooling/src/verify/gates/state-files.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/ordinary-client-and-ct-wave";
const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);

const WAVE: readonly GatePolicy[] = [
  contextDefinitionShape,
  contextDefinitionShapeHealth,
  formFactoryForMultifield,
  noFormResetInAutosave,
  noFormResetInAutosaveHealth,
  routeTrpcLifoOrder,
  stateFiles,
];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

const tokensOf = (pass: ReturnType<typeof runPolicyPass>): readonly (string | undefined)[] => pass.authority.effectiveFindings.map((finding) => finding.token);

test(
  "the wave's seven policies keep their founding, near-miss, fence and identity fixtures",
  () => {
    expect(verifyPolicyProofs(WAVE)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

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

test(
  "every relative import in every proof of this wave resolves inside the proof's own file map",
  () => {
    const shared = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
    const dangling: string[] = [];
    let sequence = 0;
    for (const policy of WAVE) {
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
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// §4.2 ORDINARY MARKER IDENTITY — one POSITIVE arm per ordinary policy. Each asserts all three: the
// finding is gone, exactly one marker was CONSUMED, and no authority alarm fired. Two of the three
// assertions are invisible to the module's own `mustPass` twin, which is why they live here.
// ---------------------------------------------------------------------------------------------------
test("a waiver at `page.route` binds the route-trpc-lifo-order finding", () => {
  const waived = passOf(routeTrpcLifoOrder, {
    "tests/client/features/g/g.ct.tsx":
      'import { test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  // @orb-waive route-trpc-lifo-order(page.route): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  await page.route("**/api/trpc/**", () => undefined);\n  await routeTrpc(page, {});\n});\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver at the exported handle's NAME binds the state-files finding", () => {
  const waived = passOf(stateFiles, {
    "packages/client/src/state/leak.ts":
      "// @orb-waive state-files(useX): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver at `reset` binds the no-form-reset-in-autosave finding", () => {
  const waived = passOf(noFormResetInAutosave, {
    "packages/client/src/features/persona/x.ts":
      'import { createAutosaveEntityForm } from "#forms/editor";\n' +
      "export function f(personaForm: { reset: (v?: unknown) => void }) {\n" +
      "  // @orb-waive no-form-reset-in-autosave(reset): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      "  personaForm.reset();\n" +
      "}\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver at the first controlled field's TAG NAME binds the form-factory-for-multifield finding", () => {
  const waived = passOf(formFactoryForMultifield, {
    "packages/client/src/features/x/hand-rolled.tsx":
      "export const F = () => (\n  <div>\n    {/* @orb-waive form-factory-for-multifield(input): the proof's stand-in reason; ends when this fixture stops flagging. */}\n    <input value={a} onChange={x} />\n    <input value={b} onChange={y} />\n    <input value={c} onChange={z} />\n  </div>\n);\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver at `useResolved` binds the context-definition-shape finding", () => {
  const waived = passOf(contextDefinitionShape, {
    "packages/client/src/features/x/lib/x-section.tsx":
      "// @orb-waive context-definition-shape(useResolved): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      'const badgeMint = { kind: "tabs", useResolved: () => null };\nexport const x = badgeMint;\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// The DISCRIMINATION control, run ONCE for the wave (§4.2: "prove it discriminates once per family with a
// two-command control"). A marker naming a position the policy does not report must suppress NOTHING and
// must ALARM — otherwise every arm above is green for the wrong reason.
test("THE DISCRIMINATION CONTROL: a waiver naming a dead position suppresses nothing and alarms", () => {
  const mismatched = passOf(stateFiles, {
    "packages/client/src/state/leak.ts":
      '// @orb-waive state-files(useY): names a declaration this carrier does not bind.\nexport const useX = createGatedStore("x", () => ({ n: 0 }));\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "state-files" }]);
});

// ---------------------------------------------------------------------------------------------------
// §4.5 DERIVED-POPULATION REFUSAL — both `-health` policies' verdicts are about files they may not have
// been given. A rename or deletion of the subject is a POPULATION tool error rather than a silent pass,
// which is the blind spot the legacy descriptors had: they simply never visited the file.
// ---------------------------------------------------------------------------------------------------
test("no-form-reset-in-autosave-health REFUSES when the autosave contract file is renamed away", () => {
  // The legacy descriptor simply never visited a renamed file and passed in SILENCE — the exact blind
  // spot a rename opened. The population algebra now makes it a tool error, and an incomplete owner
  // reports NO findings, so asserting "zero findings" here would be the false clean. Assert the refusal.
  const renamed = passOf(noFormResetInAutosaveHealth, {
    "packages/client/src/forms/editor/autosave-session.ts": 'export type AutosaveForm<T extends object> = Omit<T, "reset">;\n',
  });

  expect(renamed.toolErrors).toMatchObject([{ policyId: "no-form-reset-in-autosave-health", phase: "population" }]);
  expect(renamed.toolErrors[0]?.message).toMatch(/admitted zero paths/u);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});

test("context-definition-shape-health REFUSES when the client population is empty", () => {
  const empty = passOf(contextDefinitionShapeHealth, { "packages/server/src/domain/x/verbs/x.ts": "export const x = 1;\n" });

  expect(empty.toolErrors).toMatchObject([{ policyId: "context-definition-shape-health", phase: "population" }]);
  expect(empty.toolErrors[0]?.message).toMatch(/admitted zero paths/u);
});

// ---------------------------------------------------------------------------------------------------
// #620 — THE EXCLUSIVE-ARM FIELD COUNT, re-pinned through the production dispatcher.
//
// Issue #620: the gate counted every controlled input a component WRITES, so a component that dispatches
// exactly ONE control out of an exhaustive `switch` was reported as an N-field hand-rolled form: B2's
// `KnobField` rendered one control from a 4-arm switch and the gate said "KnobField (4 fields)". The gate
// has no allowlist, so its only exits were "import a form factory" or "drop below 3 controls" — pressure
// toward an abstraction that did not fit (a knob set built DYNAMICALLY from server descriptors, against
// entity-form factories that want a fixed `defaultValues` shape).
//
// The rule is MAX over mutually-exclusive branches, SUM over everything else — and the half that keeps
// this honest is the TRUE-POSITIVE side: `&&` guards and SIBLING conditionals still sum, because they all
// render together. Both directions are planted here.
// ---------------------------------------------------------------------------------------------------
const AT = "packages/client/src/features/x/probe.tsx";
const NUMBER_FIELD = "<NumberField value={v} onValueChange={set} />";
const SWITCH_CTL = "<Switch checked={v} onCheckedChange={set} />";
const SELECT_CTL = "<Select value={v} onValueChange={set} />";
const INPUT_CTL = "<Input value={v} onChange={set} />";

/** Wrap `body` as a component body and drive the real policy over it. */
function probe(body: string): ReturnType<typeof runPolicyPass> {
  return passOf(formFactoryForMultifield, { [AT]: `export function Probe({ kind, a, b, c, flag }) {\n${body}\n}\n` });
}

const messagesOf = (pass: ReturnType<typeof runPolicyPass>): readonly (string | undefined)[] =>
  pass.authority.effectiveFindings.map((finding) => finding.message);

test("#620: the founding false positive — ONE control from a 4-arm exhaustive switch is NOT a 4-field form", () => {
  const src = `  switch (kind) {\n    case "number":\n      return ${NUMBER_FIELD};\n    case "toggle":\n      return ${SWITCH_CTL};\n    case "choice":\n      return ${SELECT_CTL};\n    default:\n      return ${INPUT_CTL};\n  }`;
  expect(probe(src).authority.effectiveFindings).toEqual([]);
});

test("#620: an if/else pair is the same either/or — 4 written, at most 2 concurrent", () => {
  const src = `  if (flag) {\n    return (<div>${NUMBER_FIELD}${SWITCH_CTL}</div>);\n  }\n  return (<div>${SELECT_CTL}${INPUT_CTL}</div>);`;
  expect(probe(src).authority.effectiveFindings).toEqual([]);
});

test("#620: ONE conditional expression's two arms collapse — 4 written, at most 2 concurrent", () => {
  const src = `  return (<div>{flag ? <>${NUMBER_FIELD}${SWITCH_CTL}</> : <>${SELECT_CTL}${INPUT_CTL}</>}</div>);`;
  expect(probe(src).authority.effectiveFindings).toEqual([]);
});

test("#620: `&&` guards SUM — three guarded fields all render together, so it is still a hand-rolled form", () => {
  const pass = probe(`  return (<div>{a && ${NUMBER_FIELD}}{b && ${SWITCH_CTL}}{c && ${SELECT_CTL}}</div>);`);
  expect(tokensOf(pass)).toEqual(["NumberField"]);
  expect(messagesOf(pass)[0]).toContain("`Probe` renders 3 concurrent");
});

test("#620: SIBLING conditionals SUM — they are not arms of one switch", () => {
  const pass = probe(`  return (<div>{a ? ${NUMBER_FIELD} : null}{b ? ${SWITCH_CTL} : null}{c ? ${SELECT_CTL} : null}</div>);`);
  expect(messagesOf(pass)[0]).toContain("`Probe` renders 3 concurrent");
});

test("#620: collapsing arms does not EXEMPT a component — one fat arm carrying 3 fields still fires", () => {
  const src = `  switch (kind) {\n    case "a":\n      return ${NUMBER_FIELD};\n    default:\n      return (<div>${SWITCH_CTL}${SELECT_CTL}${INPUT_CTL}</div>);\n  }`;
  expect(messagesOf(probe(src))[0]).toContain("`Probe` renders 3 concurrent");
});

test("#620: an exclusive branch's MAX ADDS to the fields rendered beside it", () => {
  const pass = probe(`  return (<div>{flag ? ${NUMBER_FIELD} : ${SWITCH_CTL}}${SELECT_CTL}${INPUT_CTL}</div>);`);
  expect(messagesOf(pass)[0]).toContain("`Probe` renders 3 concurrent");
});

test("#620: a nested render callback is its OWN scope — its fields do not join the parent's count", () => {
  const pass = probe(`  return (<div>{items.map((item) => (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>))}${INPUT_CTL}</div>);`);
  // The callback itself carries 3 concurrent fields and fires; the outer Probe carries 1 and does not.
  expect(messagesOf(pass)[0]).toContain("`<anonymous>` renders 3 concurrent");
  expect(pass.authority.effectiveFindings).toHaveLength(1);
});

test("#620: the reported POSITION is a paren-free authored token, which the legacy spelling was not", () => {
  // The regression this pin exists for AFTER the conversion: the legacy token `Probe (3 fields)` carried
  // parentheses, and the marker grammar's position group is `[^()\r\n]+` — every waiver against it parsed
  // as malformed, so the policy had no working door. The count and the component name moved to the
  // message; the position is the first controlled field's tag name.
  const pass = probe(`  return (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>);`);
  expect(tokensOf(pass)).toEqual(["NumberField"]);
  for (const token of tokensOf(pass)) {
    expect(token).not.toMatch(/[()]/u);
  }
});
