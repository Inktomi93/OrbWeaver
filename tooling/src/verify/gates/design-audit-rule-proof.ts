// Policy: design-audit-rule-proof — every live ui-audit rule owns a firing proof and a precision-neighbour
// silence proof. The registry is the denominator; proof evidence must be attached to an executable
// `auditRuleTest` registration so deleting the test deletes the proof.
//
// FAMILY `design-audit-rule-proof` — a declared SINGLETON. Its subject is ONE registry
// (`tooling/src/ui-audit/contract/rules.ts`) and the one proof vocabulary attached to it; no sibling policy
// judges either, and no `lib/` computation is shared with one. The shared readers it consumes —
// `lib/static-authored-value.ts` (`resolveAuthoredComposite` / `readStaticAuthoredScalar`) and
// `lib/absent-subject-anchor.ts` (`subjectAnchor`) — are contract primitives eleven and three policies use
// respectively, exactly as `readyResourceValue` is: a shared primitive groups nothing (guide §2).
//
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot` was
// `p === REGISTRY || p.startsWith("tests/tooling/ui-audit/") || p === WALKER_CT` (pre-conversion SHA
// 250c9eb60); the final population names the same three shapes through `under`.
//
// AUTHORITY `hard`, verified rather than inherited. Every arm is an ABSENCE or IDENTITY verdict about the
// registry denominator — a missing registry, a missing proof class, a stale id — and the legacy descriptor
// carried no marker grammar, no exemption table and no baseline. The registry-anchored arms are file
// findings with no authored position token, which have no ordinary waiver door at all
// (`lib/ordinary-waiver.ts` `locateFinding`, guide §2.1's authored-coordinate rule), so `hard` is the only honest authority.
//
// ANCHOR MOVE, recorded (guide §6.4's ANCHOR MOVE classification). The legacy module reported every registry-level verdict at
// `REGISTRY:0:0` — including the verdict that the registry is GONE, which the final report sink refuses
// (`lib/policy-pass-context.ts:314`). Two changes follow: an absence verdict anchors through
// `subjectAnchor`, and every verdict that HAS an authored node now reports at that node (the registry row's
// own `id`, the proof row's own `rule`) instead of at line 0 of the registry. A hard policy has no marker
// to orphan, so the move costs nothing and the diagnostics gain a real coordinate.
//
// TWO DELIBERATE CATCH DELTAS, both from retiring `lib/ast-read.ts`'s `unwrapExpression`/`readStringValue`
// for the shared authored-value reader (the program exists to delete that module; `shared-semantic-readers.md`
// calls its capped readers "not the new fact boundary"):
//   WIDENED ACQUITTAL — a proof array or registry row reached through an immutable local or imported
//   binding now RESOLVES (`mustPass[2]`), where the legacy direct-literal reader called it malformed. This
//   is the #947 rule: a member behind a composition edge is still a member.
//   WIDENED ACCUSATION — a registry row whose `id` is not statically readable was a silent `continue` in
//   the legacy reader, so it left the denominator without a word. It is now the fail-closed third answer
//   (#944) with its own message and its own row (`mustFlag[9]`, pinned by `messageIncludes`).
//
// THE SHARED READER ONCE REFUSED THE REAL REGISTRY, AND THIS MODULE HAD NO ROW THAT COULD SEE IT (#1950
// D2, refuted at `ac0085c91` by a real-tree run). `resolveAuthoredComposite` → `explicitCompositeRefusal`
// → `invokedMemberThroughAliases` answered `dynamic` for `DESIGN_AUDIT_RULES` because the module declares
// `DESIGN_AUDIT_RULE_IDS = DESIGN_AUDIT_RULES.map((rule) => rule.id)` three lines below the array. That is
// a refusal about the binding's DOWNSTREAM USE, and a `.map()` cannot change what the literal IS — so
// `registry.size` was 0 against a 62-row registry and the gate's single real-tree finding was its own
// zero-population tripwire. The fix is in the shared reader, not here: the collector now names the
// read-only `Array.prototype` members and fails closed on every other member
// (`_shared/reference-fact-writes.ts` READ_ONLY_MEMBERS, both directions pinned in
// `tests/tooling/verify/lib/static-authored-value.test.ts`). Every fixture below resolved through the
// refusal because none of them declared a consumer beside the array — which is why `mustPass[3]` now does.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `design-audit-rule-proof` descriptor at c19da53c3baa600b50c3a569830b77d2037b45fb, the parent of the conversion
// `ac0085c91` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `250c9eb60`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,476 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 43 and final `population` admits 43.
// legacy − final = ∅. final − legacy = ∅. Controls: inside: no virtual sibling fits the exact-path population, so the
// real shared member `tests/tooling/design-audit-walker.ct.tsx` is the control, admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { readStaticAuthoredScalar, resolveAuthoredComposite } from "../lib/static-authored-value.ts";

const REGISTRY = "tooling/src/ui-audit/contract/rules.ts";
const TEST_PREFIX = "tests/tooling/ui-audit/";
const WALKER_CT = "tests/tooling/design-audit-walker.ct.tsx";
const REGISTRY_CONST = "DESIGN_AUDIT_RULES";
const HELPER = "auditRuleTest";
const PROOF_KINDS = ["fires", "silent"] as const;
type ProofKind = (typeof PROOF_KINDS)[number];

const MESSAGE =
  "the design-audit proof denominator is incomplete: every registered rule id needs executable firing and nearest-legitimate-neighbour silence proofs; stale ids and a missing or empty registry are RED — tooling/src/ui-audit/contract/rules.ts";
const FIX = `register the live id, then attach both proof rows to the ${HELPER} callbacks that exercise it without weakening the detector — ${REGISTRY}`;

const BOUND_HELPER_FIXTURE = `import { test } from "../../support/tool-fixtures.ts";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; test(title, fn); }\n`;
const ONE_RULE = `export const ${REGISTRY_CONST} = [{ id: "side-tab", family: "decor", severity: ["P3"] }] as const;\n`;
const BOTH_PROOFS = `${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`;
const PROOF_FILE = `${TEST_PREFIX}__g_proof.test.ts`;

interface Marker {
  readonly kind: ProofKind;
  readonly id: string;
  readonly node: MorphNode;
}

/** Read one authored STRING field of a row, field by field — never the whole row. A row legitimately
 *  carries fields this policy does not judge, and a value-level refusal inherited as a row-level refusal is
 *  the defect that reported zero live definitions for four registry kinds (#1584 registry family). */
function stringField(row: ObjectLiteralExpression, name: string): { readonly value?: string; readonly node: MorphNode } | undefined {
  const property = row.getProperty(name);
  if (!Node.isPropertyAssignment(property)) {
    return;
  }
  const initializer = property.getInitializer();
  if (initializer === undefined) {
    return { node: property };
  }
  const fact = readStaticAuthoredScalar(initializer);
  return fact.kind === "resolved" && typeof fact.value === "string" ? { value: fact.value, node: initializer } : { node: initializer };
}

/** The authored object literal an element resolves to, following immutable bindings (#947). */
function authoredObject(node: MorphNode): ObjectLiteralExpression | undefined {
  const composite = resolveAuthoredComposite(node);
  return composite.kind === "resolved" && Node.isObjectLiteralExpression(composite.value) ? composite.value : undefined;
}

/** `test` imported EXACTLY ONCE from the shared tool fixtures, unaliased — the registration this policy
 *  will accept as executable. */
function hasBoundTestImport(sf: SourceFile): boolean {
  const bindings = sf
    .getImportDeclarations()
    .flatMap((declaration) =>
      declaration.getNamedImports().map((named) => ({
        alias: named.getAliasNode()?.getText(),
        module: declaration.getModuleSpecifierValue(),
        name: named.getName(),
      })),
    )
    .filter((binding) => (binding.alias ?? binding.name) === "test");
  return (
    bindings.length === 1 &&
    bindings.every((binding) => binding.module.endsWith("support/tool-fixtures.ts") && binding.name === "test" && binding.alias === undefined)
  );
}

/** The file-level half of the helper contract: exactly one `auditRuleTest` function declaration, unshadowed
 *  by an import or a variable, with the exact parameter list, in a file whose `test` is the real one. */
function helperDeclaration(sf: SourceFile): MorphNode | undefined {
  const functions = sf.getFunctions().filter((declaration) => declaration.getName() === HELPER);
  const shadowed =
    sf
      .getImportDeclarations()
      .some((declaration) => declaration.getNamedImports().some((named) => (named.getAliasNode()?.getText() ?? named.getName()) === HELPER)) ||
    sf.getVariableDeclarations().some((declaration) => declaration.getName() === HELPER);
  const helper = functions[0];
  if (functions.length !== 1 || shadowed || helper === undefined || !hasBoundTestImport(sf)) {
    return;
  }
  if (
    helper
      .getParameters()
      .map((parameter) => parameter.getName())
      .join(",") !== "proofs,title,fn"
  ) {
    return;
  }
  const fileShadowsTest =
    sf.getFunctions().some((declaration) => declaration.getName() === "test") ||
    sf.getVariableStatements().some((statement) => statement.getDeclarations().some((declaration) => declaration.getName() === "test"));
  return fileShadowsTest || helper.getParameters().some((parameter) => parameter.getName() === "test") ? undefined : helper;
}

/** The declared name of a binding node. NOT `Node.isNamed`: a `VariableDeclaration` is a BindingNamed node
 *  (its name may be a destructuring pattern), so `isNamed` returns FALSE for it and a shadow check written
 *  that way silently never fires — measured on this module's own `mustFlag[2]`. */
function declaredName(node: MorphNode): string | undefined {
  const named = Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node);
  return named ? node.getName() : undefined;
}

/** Is this node inside the file's `auditRuleTest` helper body? */
function insideHelper(node: MorphNode, helper: MorphNode | undefined): boolean {
  return helper !== undefined && node.getFirstAncestor((ancestor) => ancestor === helper) !== undefined;
}

/** A `test(title, fn)` call that FORWARDS the helper's own parameters — directly, or through a wrapper
 *  arrow that calls `fn`. Anything else is a helper that swallows its callback. */
function delegatesToTest(call: MorphNode): boolean {
  if (!(Node.isCallExpression(call) && Node.isIdentifier(call.getExpression()) && call.getExpression().getText() === "test")) {
    return false;
  }
  const [title, fn] = call.getArguments();
  if (!(title !== undefined && Node.isIdentifier(title) && title.getText() === "title") || fn === undefined) {
    return false;
  }
  if (Node.isIdentifier(fn)) {
    return fn.getText() === "fn";
  }
  return (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) && referencesFn(fn);
}

/** Does this wrapper body reference the helper's `fn` parameter at all? Walked by child recursion rather
 *  than by a banned descendant query. */
function referencesFn(node: MorphNode): boolean {
  return node.forEachChildAsArray().some((child) => (Node.isIdentifier(child) && child.getText() === "fn") || referencesFn(child));
}

export const gate = defineGate({
  id: "design-audit-rule-proof",
  family: "design-audit-rule-proof",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling", "@tests"], under: [REGISTRY, `${TEST_PREFIX}**`, WALKER_CT] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const registry = new Map<string, MorphNode>();
    const duplicates: { readonly id: string; readonly node: MorphNode }[] = [];
    const unreadableIds: MorphNode[] = [];
    const markers: Marker[] = [];
    const malformed: { readonly node: MorphNode; readonly detail: string }[] = [];
    const registrations: { readonly path: string; readonly call: MorphNode; readonly proofs: MorphNode | undefined }[] = [];
    const helpers = new Map<string, MorphNode | undefined>();
    const delegates = new Set<string>();
    const helperShadowsTest = new Set<string>();

    const helperOf = (path: string, sf: SourceFile): MorphNode | undefined => {
      if (!helpers.has(path)) {
        helpers.set(path, helperDeclaration(sf));
      }
      return helpers.get(path);
    };
    const isProofFile = (path: string): boolean => path.startsWith(TEST_PREFIX) || path === WALKER_CT;

    /** One registry row: its own `id`, read field by field. */
    const readRegistryRow = (element: MorphNode): void => {
      const row = authoredObject(element);
      if (row === undefined) {
        unreadableIds.push(element);
        return;
      }
      const id = stringField(row, "id");
      if (id === undefined) {
        unreadableIds.push(element);
        return;
      }
      if (id.value === undefined) {
        unreadableIds.push(id.node);
        return;
      }
      if (registry.has(id.value)) {
        duplicates.push({ id: id.value, node: id.node });
        return;
      }
      registry.set(id.value, id.node);
    };

    /** One `auditRuleTest` proof row: `rule`/`kind`/`reason`, all three required and all three non-empty. */
    const readProofRow = (element: MorphNode): void => {
      const row = authoredObject(element);
      if (row === undefined) {
        malformed.push({ node: element, detail: `${HELPER} proof row must be an object literal` });
        return;
      }
      const rule = stringField(row, "rule");
      const id = rule?.value?.trim();
      const kind = stringField(row, "kind")?.value?.trim();
      const reason = stringField(row, "reason")?.value?.trim();
      const known = PROOF_KINDS.find((candidate) => candidate === kind);
      if (rule === undefined || id === undefined || id === "" || known === undefined || reason === undefined || reason === "") {
        malformed.push({ node: element, detail: row.getText() });
        return;
      }
      markers.push({ kind: known, id, node: rule.node });
    };

    const readRegistration = (entry: { readonly call: MorphNode; readonly proofs: MorphNode | undefined }): void => {
      const composite = entry.proofs === undefined ? undefined : resolveAuthoredComposite(entry.proofs);
      const table = composite?.kind === "resolved" && Node.isArrayLiteralExpression(composite.value) ? composite.value : undefined;
      if (table === undefined) {
        malformed.push({ node: entry.call, detail: `${HELPER} must carry a literal proof array and executable callback` });
        return;
      }
      for (const element of table.getElements()) {
        readProofRow(element);
      }
    };

    type Report = (node: MorphNode, detail: string) => void;

    /** Every top-level registration: an unbound helper contributes NO rows, a bound one contributes all of
     *  its. Unexecutable evidence must not satisfy the pair it claims to prove. */
    const judgeRegistrations = (report: Report): void => {
      for (const entry of registrations) {
        if (helpers.get(entry.path) === undefined || !delegates.has(entry.path) || helperShadowsTest.has(entry.path)) {
          report(entry.call, `${HELPER} is not bound to the imported test(title, fn) registration`);
          continue;
        }
        readRegistration(entry);
      }
      for (const entry of malformed) {
        report(entry.node, `malformed or empty executable design-audit proof: ${entry.detail}`);
      }
    };

    /** The two-sided denominator: no proof may name an unregistered id, and no registered id may go
     *  unproven in either class. */
    const judgeCoverage = (report: Report): void => {
      const proven = new Map<string, Set<ProofKind>>();
      for (const marker of markers) {
        if (!registry.has(marker.id)) {
          report(marker.node, `stale design-audit proof id not present in the registry: ${marker.id}`);
          continue;
        }
        proven.set(marker.id, (proven.get(marker.id) ?? new Set<ProofKind>()).add(marker.kind));
      }
      for (const [id, node] of registry) {
        for (const kind of PROOF_KINDS) {
          if (proven.get(id)?.has(kind) !== true) {
            report(node, `missing executable ${kind} proof for design-audit rule ${id}`);
          }
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile: SourceFile) => {
            if (ctx.relativePath(sourceFile) !== REGISTRY || !Node.isVariableDeclaration(node) || node.getName() !== REGISTRY_CONST) {
              return;
            }
            const initializer = node.getInitializer();
            const composite = initializer === undefined ? undefined : resolveAuthoredComposite(initializer);
            if (composite?.kind !== "resolved" || !Node.isArrayLiteralExpression(composite.value)) {
              return;
            }
            for (const element of composite.value.getElements()) {
              readRegistryRow(element);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            if (!isProofFile(path)) {
              return;
            }
            const helper = helperOf(path, sourceFile);
            if (delegatesToTest(node) && insideHelper(node, helper)) {
              delegates.add(path);
            }
            if (!(Node.isCallExpression(node) && Node.isIdentifier(node.getExpression()) && node.getExpression().getText() === HELPER)) {
              return;
            }
            const statement = node.getParent();
            if (!(Node.isExpressionStatement(statement) && Node.isSourceFile(statement.getParent()))) {
              return;
            }
            const [proofs, , callback] = node.getArguments();
            const executable = callback !== undefined && (Node.isArrowFunction(callback) || Node.isFunctionExpression(callback));
            registrations.push({ path, call: node, proofs: executable ? proofs : undefined });
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.VariableDeclaration, SyntaxKind.Parameter],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            if (!isProofFile(path)) {
              return;
            }
            if (declaredName(node) !== "test") {
              return;
            }
            if (insideHelper(node, helperOf(path, sourceFile))) {
              helperShadowsTest.add(path);
            }
          },
        },
      ],
      evaluate: () => {
        const present = new Set(ctx.files.map((file) => ctx.relativePath(file)));
        ctx.receipt({ kind: "population", source: "design-audit-proof-corpus", members: ctx.files.length, unresolved: 0 });
        const anchor = subjectAnchor(present, [REGISTRY, WALKER_CT]);
        const report = (node: MorphNode, detail: string): void => ctx.report.node(node, { message: `${MESSAGE} ${detail}`, fix: FIX });

        if (!present.has(REGISTRY)) {
          ctx.report.file(anchor(REGISTRY), {
            line: 1,
            column: 1,
            message: `${MESSAGE} design-audit registry is missing or unreadable — ${REGISTRY}`,
            fix: FIX,
          });
          return;
        }
        if (registry.size === 0) {
          ctx.report.file(REGISTRY, {
            line: 1,
            column: 1,
            message: `${MESSAGE} zero-population design-audit registry — no rule ids were readable from ${REGISTRY_CONST} — ${REGISTRY}`,
            fix: FIX,
          });
          return;
        }
        for (const duplicate of duplicates) {
          report(duplicate.node, `duplicate design-audit rule id in the registry: ${duplicate.id}`);
        }
        for (const node of unreadableIds) {
          report(
            node,
            "unreadable design-audit rule id — the registry row states no authored string id, so it is a denominator member this policy cannot judge",
          );
        }
        judgeRegistrations(report);
        judgeCoverage(report);
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { [REGISTRY]: ONE_RULE, [PROOF_FILE]: BOTH_PROOFS },
      expect: { count: 3, messageIncludes: "not bound" },
      why: "a same-name call with no helper binding is not executable proof — and the unbound registration contributes NO rows, so the rule it claimed to prove is still owed both classes (1 + 2)",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `import { test } from "../../support/tool-fixtures.ts";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; void title; void fn; }\n${BOTH_PROOFS}`,
      },
      expect: { count: 3, messageIncludes: "not bound" },
      why: "a same-name no-op helper cannot turn detached literals into Vitest registrations",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `import { test } from "../../support/tool-fixtures.ts";\nfunction ${HELPER}(proofs: unknown, title: string, fn: () => void): void { void proofs; const test = (_title: string, _fn: () => void): void => {}; test(title, fn); }\n${BOTH_PROOFS}`,
      },
      expect: { count: 3, messageIncludes: "not bound" },
      why: "a helper-local `test` shadow cannot impersonate the imported executable registration",
    },
    {
      mode: "source",
      files: { [PROOF_FILE]: BOUND_HELPER_FIXTURE },
      expect: { count: 1, messageIncludes: "registry is missing or unreadable" },
      why: "a deleted or moved registry cannot make the proof denominator disappear cleanly. THE ANCHOR MOVE IS THIS ROW: the verdict is about a file that does not exist, so it reports at the first present named subject and names the missing path in its message — the legacy `REGISTRY:0:0` anchor now THROWS through the report sink",
    },
    {
      mode: "source",
      files: { [REGISTRY]: `export const ${REGISTRY_CONST} = [] as const;\n` },
      expect: { count: 1, messageIncludes: "zero-population" },
      why: "an empty denominator must fail loudly instead of blessing a vacuous zero-rule audit",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "fires", reason: "thick chromatic side edge fixture" }], "fixture", () => {});\n`,
      },
      expect: { count: 1, messageIncludes: "missing executable silent proof" },
      why: "a firing fixture alone does not prove precision at the nearest legitimate neighbour",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "silent", reason: "selected ListRow neighbour" }], "fixture", () => {});\n`,
      },
      expect: { count: 1, messageIncludes: "missing executable fires proof" },
      why: "a precision neighbour alone cannot launder a rule whose firing proof was deleted",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }, { rule: "border-accent-on-rounded", kind: "fires", reason: "dynamic classifier result" }], "fixture", () => {});\n`,
      },
      expect: { count: 1, token: '"border-accent-on-rounded"', messageIncludes: "stale design-audit proof id" },
      why: "a dynamically returned classifier id cannot bypass the central registry — and the finding now anchors on the proof row's own `rule` value rather than at registry line 0, so the token IS the stale id",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "fires", reason: "" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`,
      },
      expect: { count: 2, messageIncludes: "malformed or empty executable design-audit proof" },
      why: "an empty reason is not evidence, and the malformed executable row must not satisfy the pair (1 malformed + 1 still-owed firing proof)",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: `declare function mint(): string;\nexport const ${REGISTRY_CONST} = [{ id: "side-tab", family: "decor", severity: ["P3"] }, { id: mint(), family: "decor", severity: ["P3"] }] as const;\n`,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${BOTH_PROOFS}`,
      },
      expect: { count: 1, messageIncludes: "unreadable design-audit rule id" },
      why: "THE #944 THIRD ANSWER, and it is a deliberate catch WIDENING: the legacy reader silently `continue`d past a row whose id it could not read, so a computed id left the denominator without a word. Pinned by `messageIncludes` because the fail-closed arm produces the same COUNT as an ordinary verdict and a bare count row would pass whether it fires or is unreachable (guide §6.1)",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = [{ id: "side-tab", family: "decor", severity: ["P3"] }, { id: "side-tab", family: "quality", severity: ["P1"] }] as const;\n`,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${BOTH_PROOFS}`,
      },
      expect: { count: 1, messageIncludes: "duplicate design-audit rule id" },
      why: "THE DUPLICATE ARM, unpinned by the legacy suite: two registry rows claiming one id mean one of them can never be proven independently, and a proof pair attached to the id satisfies BOTH — the shape that lets a second rule ship with no evidence at all",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "maybe", reason: "hedged" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n`,
      },
      expect: { count: 2, messageIncludes: "malformed or empty executable design-audit proof" },
      why: "THE KIND VOCABULARY, pinned: `fires` and `silent` are the only two proof classes, so a third word is malformed rather than a silently-ignored row. Widening the `kind` test to any nonempty string greens the malformed finding and REDS this row",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}declare function buildProofs(): unknown;\n${HELPER}(buildProofs(), "fixture", () => {});\n`,
      },
      expect: { count: 3, messageIncludes: "must carry a literal proof array" },
      why: "a COMPUTED proof array is unreadable evidence, and the registration that carries it proves nothing — so the rule is still owed both classes (1 + 2)",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}function body(): void {}\n${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", body);\n`,
      },
      expect: { count: 3, messageIncludes: "must carry a literal proof array and executable callback" },
      why: "THE EXECUTABLE-CALLBACK FENCE, unpinned by the legacy suite: a named function reference is not the inline callback the runner registers here, so the rows it carries are not attached to anything a deletion would take with it",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}describe("audit", () => {\n  ${HELPER}([{ rule: "side-tab", kind: "fires", reason: "fixture" }, { rule: "side-tab", kind: "silent", reason: "neighbor" }], "fixture", () => {});\n});\n`,
      },
      expect: { count: 2, messageIncludes: "missing executable" },
      why: "THE TOP-LEVEL FENCE, pinned: a registration nested inside a `describe` callback is not a top-level statement, so its rows do not enter the denominator. Dropping the `Node.isSourceFile(statement.getParent())` clause counts these rows and REDS this row",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${HELPER}([{ rule: "side-tab", kind: "fires", reason: "thick chromatic side edge fixture emits" }, { rule: "side-tab", kind: "silent", reason: "selected ListRow is the nearest sanctioned accent edge" }], "fixture", () => {});\n`,
      },
      why: "a registered id with both explained proof arms is complete",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}const quoted = "${HELPER}([{ rule: ghost }])";\nvoid quoted;\n${BOTH_PROOFS}`,
      },
      why: "registration-like text inside a string is inert; only an executable auditRuleTest call counts",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: ONE_RULE,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}const PROOFS = [{ rule: "side-tab", kind: "fires", reason: "fixture emits" }, { rule: "side-tab", kind: "silent", reason: "nearest sanctioned neighbour" }] as const;\n${HELPER}(PROOFS, "fixture", () => {});\n`,
      },
      why: "THE WIDENED ACQUITTAL, and the row that holds it: the legacy direct-literal reader called a const-bound proof array 'malformed' and then reported the rule unproven (3 findings). The shared authored-value reader follows the immutable binding, so a member behind a composition edge is still a member (#947). Reverting to a bare `unwrapExpression` on the argument REDS this row",
    },
    {
      mode: "source",
      files: {
        [REGISTRY]: `${ONE_RULE}export const ${REGISTRY_CONST}_IDS: readonly string[] = ${REGISTRY_CONST}.map((rule) => rule.id);\n`,
        [PROOF_FILE]: `${BOUND_HELPER_FIXTURE}${BOTH_PROOFS}`,
      },
      why: "THE REAL TREE'S OWN SHAPE, and the row this policy shipped BLIND without (#1950 D2): the registry declares a sibling `.map(...)` projection three lines below itself. `resolveAuthoredComposite` refused that with `dynamic` — a refusal about the BINDING'S DOWNSTREAM USE, which says nothing about the literal in place — so `registry.size` was 0 against a 62-row registry and the only finding on the real tree was this module's own zero-population tripwire, while every fixture here resolved because none declared a consumer. The reader now names the read-only `Array.prototype` members and fails closed on everything else (`_shared/reference-fact-writes.ts` READ_ONLY_MEMBERS); restoring the blanket refusal REDS this row with `zero-population`",
    },
  ],
});
