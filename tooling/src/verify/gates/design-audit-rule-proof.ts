// Gate: design-audit-rule-proof — every live ui-audit rule owns a firing proof and a precision-neighbour
// silence proof. The registry is the denominator; proof evidence must be attached to an executable
// auditRuleTest registration so deleting the test deletes the proof.
import type { ArrayLiteralExpression, ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const REGISTRY = "tooling/src/ui-audit/contract/rules.ts";
const TEST_PREFIX = "tests/tooling/ui-audit/";
const WALKER_CT = "tests/tooling/design-audit-walker.ct.tsx";

interface Marker {
  readonly file: string;
  readonly line: number;
  readonly kind: "fires" | "silent";
  readonly id: string;
  readonly reason: string;
}

const registryIds = new Set<string>();
const duplicateRegistryIds: string[] = [];
const markers: Marker[] = [];
const malformedMarkers: Array<{ readonly file: string; readonly line: number; readonly text: string }> = [];

function relOf(abs: string): string | null {
  const norm = abs.replace(/\\/gu, "/");
  // `tests/tooling/**` contains the substring `/tooling/`; take the outer repo root first.
  for (const root of ["tests/", "tooling/"]) {
    if (norm.startsWith(root)) {
      return norm;
    }
    const i = norm.indexOf(`/${root}`);
    if (i !== -1) {
      return norm.slice(i + 1);
    }
  }
  return null;
}

function readRegistry(sf: Parameters<NonNullable<GateDescriptor["visitFile"]>>[0]): void {
  const declaration = sf.getVariableDeclaration("DESIGN_AUDIT_RULES");
  const initializer = declaration?.getInitializer();
  if (initializer === undefined) {
    return;
  }
  const table = unwrapExpression(initializer);
  if (!Node.isArrayLiteralExpression(table)) {
    return;
  }
  for (const element of table.getElements()) {
    const row = unwrapExpression(element);
    if (!Node.isObjectLiteralExpression(row)) {
      continue;
    }
    const idProperty = row.getProperty("id");
    if (!Node.isPropertyAssignment(idProperty)) {
      continue;
    }
    const id = readStringValue(idProperty.getInitializerOrThrow());
    if (id === undefined) {
      continue;
    }
    if (registryIds.has(id)) {
      duplicateRegistryIds.push(id);
    }
    registryIds.add(id);
  }
}

function propertyString(row: ObjectLiteralExpression, name: string): string | undefined {
  const property = row.getProperty(name);
  return Node.isPropertyAssignment(property) ? readStringValue(property.getInitializerOrThrow()) : undefined;
}

function readProofRows(proofs: ArrayLiteralExpression, rel: string): void {
  for (const element of proofs.getElements()) {
    const row = unwrapExpression(element);
    if (!Node.isObjectLiteralExpression(row)) {
      malformedMarkers.push({ file: rel, line: element.getStartLineNumber(), text: "auditRuleTest proof row must be an object literal" });
      continue;
    }
    const id = propertyString(row, "rule")?.trim();
    const kind = propertyString(row, "kind")?.trim();
    const reason = propertyString(row, "reason")?.trim();
    if (id === undefined || id === "" || (kind !== "fires" && kind !== "silent") || reason === undefined || reason === "") {
      malformedMarkers.push({ file: rel, line: row.getStartLineNumber(), text: row.getText() });
      continue;
    }
    markers.push({ file: rel, line: row.getStartLineNumber(), kind, id, reason });
  }
}

function readProofRegistrations(sf: Parameters<NonNullable<GateDescriptor["visitFile"]>>[0], rel: string): void {
  const calls = sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => Node.isIdentifier(call.getExpression()) && call.getExpression().getText() === "auditRuleTest");
  for (const call of calls) {
    const [proofsArg, , callbackArg] = call.getArguments();
    const proofs = proofsArg === undefined ? undefined : unwrapExpression(proofsArg);
    const executable = callbackArg !== undefined && (Node.isArrowFunction(callbackArg) || Node.isFunctionExpression(callbackArg));
    if (!(Node.isArrayLiteralExpression(proofs) && executable)) {
      malformedMarkers.push({ file: rel, line: call.getStartLineNumber(), text: "auditRuleTest must carry a literal proof array and executable callback" });
      continue;
    }
    readProofRows(proofs, rel);
  }
}

export const gate: GateDescriptor = {
  name: "design-audit-rule-proof",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "the design-audit proof denominator is incomplete: every registered rule id needs executable firing and nearest-legitimate-neighbour silence proofs; stale ids and a missing or empty registry are RED — tooling/src/ui-audit/contract/rules.ts",
  fix: `register the live id, then attach both proof rows to the auditRuleTest callbacks that exercise it without weakening the detector — ${REGISTRY}`,
  scanRoot: (p) => p === REGISTRY || p.startsWith(TEST_PREFIX) || p === WALKER_CT,
  begin: () => {
    registryIds.clear();
    duplicateRegistryIds.length = 0;
    markers.length = 0;
    malformedMarkers.length = 0;
  },
  visitFile: (sf) => {
    const rel = relOf(sf.getFilePath());
    if (rel === REGISTRY) {
      readRegistry(sf);
    } else if (rel !== null && (rel.startsWith(TEST_PREFIX) || rel === WALKER_CT)) {
      readProofRegistrations(sf, rel);
    }
  },
  run: (ctx) => {
    if (!fileLoaded(ctx, REGISTRY)) {
      ctx.report({
        file: REGISTRY,
        line: 0,
        column: 0,
        message: `design-audit registry is missing or unreadable — ${REGISTRY}`,
      });
      return;
    }
    if (registryIds.size === 0) {
      ctx.report({
        file: REGISTRY,
        line: 0,
        column: 0,
        message: "zero-population design-audit registry — no rule ids were readable from DESIGN_AUDIT_RULES — tooling/src/ui-audit/contract/rules.ts",
      });
      return;
    }
    for (const id of duplicateRegistryIds) {
      ctx.report({
        file: REGISTRY,
        line: 0,
        column: 0,
        message: `duplicate design-audit rule id in the registry: ${id} — tooling/src/ui-audit/contract/rules.ts`,
      });
    }
    for (const marker of malformedMarkers) {
      ctx.report({
        file: marker.file,
        line: marker.line,
        column: 0,
        message: `malformed or empty executable design-audit proof: ${marker.text} — tooling/src/ui-audit/contract/rules.ts`,
      });
    }
    const proofKinds = new Map<string, Set<Marker["kind"]>>();
    for (const marker of markers) {
      if (!registryIds.has(marker.id)) {
        ctx.report({
          file: marker.file,
          line: marker.line,
          column: 0,
          message: `stale design-audit proof id not present in the registry: ${marker.id} — tooling/src/ui-audit/contract/rules.ts`,
        });
        continue;
      }
      const kinds = proofKinds.get(marker.id) ?? new Set<Marker["kind"]>();
      kinds.add(marker.kind);
      proofKinds.set(marker.id, kinds);
    }
    for (const id of registryIds) {
      const kinds = proofKinds.get(id);
      for (const kind of ["fires", "silent"] as const) {
        if (kinds === undefined || !kinds.has(kind)) {
          ctx.report({
            file: REGISTRY,
            line: 0,
            column: 0,
            message: `missing executable ${kind} proof for design-audit rule ${id} — tooling/src/ui-audit/contract/rules.ts`,
          });
        }
      }
    }
  },
  mustFlag: [
    {
      files: { [`${TEST_PREFIX}__g_proof.test.ts`]: 'auditRuleTest([], "fixture", () => {});\n' },
      at: REGISTRY,
      expect: { count: 1, messageIncludes: "registry is missing or unreadable" },
      why: "a deleted or moved registry cannot make the proof denominator disappear cleanly",
    },
    {
      files: { [REGISTRY]: "export const DESIGN_AUDIT_RULES = [] as const;\n" },
      at: REGISTRY,
      expect: { count: 1 },
      why: "an empty denominator must fail loudly instead of blessing a vacuous zero-rule audit",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'auditRuleTest([{ rule: "side-tab", kind: "fires", reason: "thick chromatic side edge fixture" }], "fixture", () => {});\n',
      },
      at: REGISTRY,
      expect: { count: 1, messageIncludes: "missing executable silent proof" },
      why: "a firing fixture alone does not prove precision at the nearest legitimate neighbour",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'auditRuleTest([{ rule: "side-tab", kind: "silent", reason: "selected ListRow neighbour" }], "fixture", () => {});\n',
      },
      at: REGISTRY,
      expect: { count: 1, messageIncludes: "missing executable fires proof" },
      why: "a precision neighbour alone cannot launder a rule whose firing proof was deleted",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'auditRuleTest([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }, { rule: "border-accent-on-rounded", kind: "fires", reason: "dynamic classifier result" }], "fixture", () => {});\n',
      },
      at: `${TEST_PREFIX}__g_proof.test.ts`,
      expect: { count: 1, messageIncludes: "stale design-audit proof id" },
      why: "a dynamically returned classifier id cannot bypass the central registry",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'auditRuleTest([{ rule: "side-tab", kind: "fires", reason: "" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n',
      },
      at: `${TEST_PREFIX}__g_proof.test.ts`,
      expect: { count: 2 },
      why: "an empty reason is not evidence, and the malformed executable row must not satisfy the pair",
    },
  ],
  mustPass: [
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'auditRuleTest([{ rule: "side-tab", kind: "fires", reason: "thick chromatic side edge fixture emits" }, { rule: "side-tab", kind: "silent", reason: "selected ListRow is the nearest sanctioned accent edge" }], "fixture", () => {});\n',
      },
      why: "a registered id with both explained proof arms is complete",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'const quoted = "auditRuleTest([{ rule: ghost }])";\nauditRuleTest([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n',
      },
      why: "registration-like text inside a string is inert; only an executable auditRuleTest call counts",
    },
  ],
};
