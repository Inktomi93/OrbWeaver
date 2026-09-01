// Gate: design-audit-rule-proof — every live ui-audit rule owns a firing proof and a precision-neighbour
// silence proof. The registry is the denominator; proof comments are deliberate machine-readable evidence.
// Comment posture: comments-INTENDED (`@rule-fires` / `@rule-silent` are the contract being enforced).
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readStringValue, unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const REGISTRY = "tooling/src/ui-audit/contract/rules.ts";
const TEST_PREFIX = "tests/tooling/ui-audit/";
const WALKER_CT = "tests/tooling/design-audit-walker.ct.tsx";
const MARKER_RE = /^\s*\/\/\s*@rule-(fires|silent)\(([^)]*)\):\s*(.*?)\s*$/u;
const MARKER_START_RE = /^\s*\/\/\s*@rule-(?:fires|silent)\b/u;

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

function readMarkers(rel: string, text: string): void {
  for (const [index, line] of text.split("\n").entries()) {
    if (!MARKER_START_RE.test(line)) {
      continue;
    }
    const match = MARKER_RE.exec(line);
    const kind = match?.[1];
    const id = match?.[2];
    const reason = match?.[3];
    if ((kind !== "fires" && kind !== "silent") || id === undefined || id.trim() === "" || reason === undefined || reason.trim() === "") {
      malformedMarkers.push({ file: rel, line: index + 1, text: line.trim() });
      continue;
    }
    markers.push({ file: rel, line: index + 1, kind, id: id.trim(), reason: reason.trim() });
  }
}

export const gate: GateDescriptor = {
  name: "design-audit-rule-proof",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "the design-audit proof denominator is incomplete: every registered rule id needs a non-empty @rule-fires(id) reason and @rule-silent(id) nearest-legitimate-neighbour reason; stale ids and an empty registry are RED — tooling/src/ui-audit/contract/rules.ts",
  fix: `register the live id, then add both proof markers beside the exercised ui-audit test without weakening the detector — ${REGISTRY}`,
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
      readMarkers(rel, sf.getFullText());
    }
  },
  run: (ctx) => {
    if (!fileLoaded(ctx, REGISTRY)) {
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
        message: `malformed or empty design-audit proof marker: ${marker.text} — tooling/src/ui-audit/contract/rules.ts`,
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
            message: `missing @rule-${kind}(${id}) proof marker — tooling/src/ui-audit/contract/rules.ts`,
          });
        }
      }
    }
  },
  mustFlag: [
    {
      files: { [REGISTRY]: "export const DESIGN_AUDIT_RULES = [] as const;\n" },
      at: REGISTRY,
      expect: { count: 1 },
      why: "an empty denominator must fail loudly instead of blessing a vacuous zero-rule audit",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]: "// @rule-fires(side-tab): thick chromatic side edge fixture\n",
      },
      at: REGISTRY,
      expect: { count: 1, messageIncludes: "missing @rule-silent(side-tab)" },
      why: "a firing fixture alone does not prove precision at the nearest legitimate neighbour",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          "// @rule-fires(side-tab): fixture\n// @rule-silent(side-tab): neighbor\n// @rule-fires(border-accent-on-rounded): dynamic classifier result\n",
      },
      at: `${TEST_PREFIX}__g_proof.test.ts`,
      expect: { count: 1, messageIncludes: "stale design-audit proof id" },
      why: "a dynamically returned classifier id cannot bypass the central registry",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]: "// @rule-fires(side-tab):\n// @rule-silent(side-tab): neighbor\n",
      },
      at: `${TEST_PREFIX}__g_proof.test.ts`,
      expect: { count: 2 },
      why: "an empty reason is not evidence, and the malformed marker must not satisfy the pair",
    },
  ],
  mustPass: [
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          "// @rule-fires(side-tab): thick chromatic side edge fixture emits\n// @rule-silent(side-tab): selected ListRow is the nearest sanctioned accent edge\n",
      },
      why: "a registered id with both explained proof arms is complete",
    },
    {
      files: {
        [REGISTRY]: 'export const DESIGN_AUDIT_RULES = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n',
        [`${TEST_PREFIX}__g_proof.test.ts`]:
          'const quoted = "@rule-fires(ghost): not a comment marker";\n// @rule-fires(side-tab): fixture\n// @rule-silent(side-tab): neighbor\n',
      },
      why: "marker-like text inside a string is inert; only deliberate line-comment evidence counts",
    },
  ],
};
