// Policy: modal-registry-completeness (client-architecture-lockdown.md §6d / §16 G13) — the modal
// registry's structural walls tsc cannot see. tsc forces the door Record total over MODAL_SLOT_IDS; this
// adds CO-LOCATION, DUPLICATE ID, the DECLARED-PLANNED honesty rule, the mobile-tab SINGLETON placement,
// the `surface` REACHABILITY rule (§E-7), and the anti-god-map ban on a route re-forming a `modals` map.
//
// Definition identity is the shared `registryDefinitionFacts.modal` provider: a modal is whatever the checker says is
// annotated with the canonical exported `ModalDefinition`, so an alias, a namespace qualification, or a
// re-export is the same subject and a local shadow type is not. The definition's own object literal is
// resolved across files, which is STRICTLY STRONGER than the legacy same-file read: an imported
// initializer is no longer an unjudgeable blob, it is a definition whose HOME is checked directly.
//
// The `surface` reachability arm resolves its openers semantically (`resolveCallableOrigin`), so a local
// function that happens to be named `openModal` no longer satisfies the rule and an aliased import does.
// The import-name prefilter is a CANDIDATE filter only; every candidate is confirmed through the shared
// reader before it counts as an opener — measured 2026-09-11: removing the prefilter changes no proof row,
// which is exactly what "candidate filter, not a narrowing" has to mean.
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` (`registryDefinitionFacts`)
// plus `lib/registry-definition-{anchor,field,home}.ts`, consumed identically by all seven members.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (577d03d63^); the final population is `@client`, with the ROUTES fence kept inside the god-map arm.
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DEFINITION_SLOTS } from "../contract/registry-definition-home.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionField, definitionObjectField, definitionStringField } from "../lib/registry-definition-field.ts";
import { isDefinitionHome } from "../lib/registry-definition-home.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";
import { readStaticAuthoredScalar } from "../lib/static-authored-value.ts";

const OPENER = "openModal";
const ROUTES = "packages/client/src/routes/";
const GOD_MAP_PROP = "modals";
/** The one placement the mobile-bar derivation renders as EXACTLY ONE affordance (the You sheet). */
const SINGLETON_PLACEMENT = "mobile-tab";
/** The placement whose modals are reached ONLY by an explicit `openModal(id)` opener. */
const SURFACE_PLACEMENT = "surface";

const MESSAGE =
  "a modal is dishonest: a ModalDefinition whose declaration or resolved definition is not co-located at " +
  "packages/client/src/features/<owner>/lib/<id>-modal.{ts,tsx}, a definition this policy cannot resolve to an authored " +
  "object literal, an unreadable or duplicate id, a DECLARED-PLANNED modal with an empty reason, two modals claiming the " +
  "mobile-tab singleton placement, a `surface` modal with no openModal(id) opener, or a route re-forming the `modals` " +
  "override god-map — client-architecture-lockdown.md §6d.";
const FIX =
  'co-locate the definition and write it as an authored object literal; a planned modal is a non-empty reason; one modal per mobile-tab; give a `surface` modal at least one openModal("<id>") call site; a route is a thin mount — modals ride the registry. For a deliberate exception, write an adjacent `@orb-waive modal-registry-completeness(<position>): <why + end condition>` — the position is the DECLARED NAME of the modal (`xModal`), and on the god-map arm it is the JSX attribute name `modals`.';

interface Opener {
  readonly call: MorphNode;
}

interface Claim {
  readonly name: string;
  readonly file: string;
}

/** One definition's own authored literal and the repo-relative path that literal is declared at. */
interface Home {
  readonly object: ObjectLiteralExpression;
  readonly path: string;
}

/** The modal's declared `trigger.placement`, or undefined when it is absent or not an authored string. */
function triggerPlacement(object: ObjectLiteralExpression): string | undefined {
  const trigger = definitionObjectField(object, "trigger");
  if (trigger === undefined || trigger.kind === "unresolved") {
    return;
  }
  const placement = definitionStringField(trigger.value, "placement");
  return placement !== undefined && placement.kind === "resolved" ? placement.value : undefined;
}

/** The imported local names that could denote the canonical opener — a candidate filter, never a verdict. */
function noteOpenerImport(node: MorphNode, names: Set<string>): void {
  if (Node.isImportSpecifier(node) && node.getName() === OPENER) {
    names.add(node.getAliasNode()?.getText() ?? node.getName());
  }
}

function calleeName(call: MorphNode): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  return Node.isPropertyAccessExpression(expression) ? expression.getName() : undefined;
}

/** Confirm one candidate call through the shared callable reader and read its authored slot id. */
function openedSlotId(call: MorphNode): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "unresolved" || origin.value.target.kind !== "module" || origin.value.target.canonical.exportedName !== OPENER) {
    return;
  }
  const [argument] = call.getArguments();
  if (argument === undefined) {
    return;
  }
  const scalar = readStaticAuthoredScalar(argument);
  return scalar.kind === "resolved" && typeof scalar.value === "string" ? scalar.value : undefined;
}

/** A `modals={{…}}` object-literal prop — the deleted override god-map re-formed at a route. */
function isGodMapAttribute(node: MorphNode): boolean {
  if (!(Node.isJsxAttribute(node) && node.getNameNode().getText() === GOD_MAP_PROP)) {
    return false;
  }
  const initializer = node.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return false;
  }
  const expression = initializer.getExpression();
  return expression !== undefined && Node.isObjectLiteralExpression(expression);
}

/** The `{ planned }` reason of a modal body, or undefined when the body is not the declared-planned arm. */
function plannedReason(object: ObjectLiteralExpression): { readonly resolved: boolean; readonly empty: boolean } | undefined {
  const body = definitionObjectField(object, "body");
  if (body === undefined || body.kind === "unresolved") {
    return;
  }
  const planned = definitionStringField(body.value, "planned");
  if (planned === undefined) {
    return definitionField(body.value, "planned") === undefined ? undefined : { resolved: false, empty: false };
  }
  return planned.kind === "resolved" ? { resolved: true, empty: planned.value.length === 0 } : { resolved: false, empty: false };
}

export const gate = defineGate({
  id: "modal-registry-completeness",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts.modal],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const openerNames = new Set<string>([OPENER]);
    const openerCandidates: Opener[] = [];
    const godMaps: MorphNode[] = [];
    const claimedIds = new Map<string, Claim>();
    const claimedSingletons = new Map<string, Claim>();
    const openedIds = new Set<string>();
    const surfaceModals: { readonly definition: RegistryDefinitionFact; readonly id: string }[] = [];

    const report = (node: MorphNode, detail: string): void => ctx.report.node(node, { ...definitionAnchor(node), message: `${MESSAGE} ${detail}`, fix: FIX });

    /** The definition's own authored literal plus its home path, or the co-location/readability finding. */
    const resolveHome = (definition: RegistryDefinitionFact, name: string): Home | undefined => {
      const declarationPath = ctx.relativePath(definition.declaration.getSourceFile());
      if (!isDefinitionHome(declarationPath, DEFINITION_SLOTS.modal)) {
        report(definition.declaration, `Not co-located: "${name}" is declared at ${declarationPath}.`);
        return;
      }
      if (definition.object.kind === "unresolved") {
        report(definition.declaration, `Unreadable definition: "${name}" — ${definition.object.reason}: ${definition.object.detail}.`);
        return;
      }
      const object = definition.object.value;
      // The authored object is a RESOLUTION — the shared reader follows a cross-module const to its real
      // declaration, which is routinely outside this policy's `@client` population. `ctx.relativePath`
      // THROWS there and would withhold the whole policy (guide §3), so the home is read totally.
      const objectPath = declarationHome(ctx, object.getSourceFile());
      if (!isDefinitionHome(objectPath, DEFINITION_SLOTS.modal)) {
        report(definition.declaration, `Definition outside its home: "${name}" resolves to an object literal declared at ${objectPath}.`);
        return;
      }
      return { object, path: objectPath };
    };

    const claimId = (definition: RegistryDefinitionFact, name: string, home: Home): string | undefined => {
      const id = definitionStringField(home.object, "id");
      if (id === undefined || id.kind === "unresolved") {
        report(definition.declaration, `Unreadable id: "${name}" declares no authored string id, so the duplicate-id arm cannot judge it.`);
        return;
      }
      const owner = claimedIds.get(id.value);
      if (owner === undefined) {
        claimedIds.set(id.value, { name, file: home.path });
        return id.value;
      }
      report(definition.declaration, `Duplicate id "${id.value}": "${name}" repeats the id first claimed by "${owner.name}" (${owner.file}).`);
      return id.value;
    };

    const claimSingleton = (definition: RegistryDefinitionFact, name: string, home: Home, placement: string | undefined): void => {
      if (placement !== SINGLETON_PLACEMENT) {
        return;
      }
      const owner = claimedSingletons.get(placement);
      if (owner === undefined) {
        claimedSingletons.set(placement, { name, file: home.path });
        return;
      }
      report(
        definition.declaration,
        `Duplicate singleton placement "${placement}": "${name}" repeats the placement first claimed by "${owner.name}" (${owner.file}).`,
      );
    };

    const judgePlanned = (definition: RegistryDefinitionFact, name: string, home: Home): "planned" | "real" | "refused" => {
      const planned = plannedReason(home.object);
      if (planned === undefined) {
        return "real";
      }
      if (!planned.resolved) {
        report(definition.declaration, `Unreadable planned reason: "${name}" declares a \`body.planned\` this policy cannot read as an authored string.`);
        return "refused";
      }
      if (planned.empty) {
        report(definition.declaration, `Empty planned reason: "${name}" declares \`body: { planned: "" }\`, which states nothing.`);
        return "refused";
      }
      return "planned";
    };

    const judge = (definition: RegistryDefinitionFact): void => {
      const name = definitionName(definition.declaration);
      const home = resolveHome(definition, name);
      if (home === undefined) {
        return;
      }
      const id = claimId(definition, name, home);
      if (id === undefined) {
        return;
      }
      const placement = triggerPlacement(home.object);
      claimSingleton(definition, name, home, placement);
      if (judgePlanned(definition, name, home) === "real" && placement === SURFACE_PLACEMENT) {
        surfaceModals.push({ definition, id });
      }
    };

    return {
      visitors: [
        { kinds: [SyntaxKind.ImportSpecifier], visit: (node) => noteOpenerImport(node, openerNames) },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            const name = calleeName(node);
            if (name !== undefined && openerNames.has(name)) {
              openerCandidates.push({ call: node });
            }
          },
        },
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile: SourceFile) => {
            if (ctx.relativePath(sourceFile).startsWith(ROUTES) && isGodMapAttribute(node)) {
              godMaps.push(node);
            }
          },
        },
      ],
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts.modal);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        for (const candidate of openerCandidates) {
          const slot = openedSlotId(candidate.call);
          if (slot !== undefined) {
            openedIds.add(slot);
          }
        }
        for (const definition of view.definitions) {
          judge(definition);
        }
        for (const surface of surfaceModals) {
          if (!openedIds.has(surface.id)) {
            report(
              surface.definition.declaration,
              `Unreachable surface modal "${surface.id}": a \`surface\` modal with a real body has no explicit ${OPENER}("${surface.id}") call site, so nothing can open it.`,
            );
          }
        }
        for (const attribute of godMaps) {
          report(attribute, "A route declares a `modals={{…}}` object-literal prop — the override god-map the registry replaced.");
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { uiModal } from "../../../../../ui/src/modal-defs.ts";\nexport const xModal: ModalDefinition = uiModal;\n',
        "packages/ui/src/modal-defs.ts": 'export const uiModal = { id: "x" };\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Definition outside its home" },
      why: "THE HOME READ IS TOTAL, and this row is the one that dies without it: `definition.object` is a RESOLUTION — the shared authored-value reader follows a cross-module const to its real declaration, which is routinely OUTSIDE this policy's `@client` population — and NOT only through a vendor `.d.ts`: an ordinary sibling-package import of a `@orb/ui` const, one hop outside `@client`, reproduces it (audit receipt, docs/reviews/gate-runtime/v-audit-wave2-2026-09-12.md D1). `ctx.relativePath` REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so asking it for a foreign object's home THREW and withheld the WHOLE policy — the exact failure that left `freeze-provenance-write-pairing` reporting nothing on every real-tree run while sitting at 0 conformance failures (2026-09-11, guide §3). The home is now read through `lib/declaration-home.ts`. AGAINST THE UNMODIFIED MODULE THIS ROW REDS AS A TOOL ERROR rather than as a missing finding, and that is not a mis-authored row: the planted out-of-population object makes `evaluate` THROW, which is the real-tree failure reproduced inside conformance. Membership in `ctx.files` is NOT the alternative — policy-pass.ts:316 intersects it with a scoped run's requested paths, so that spelling reads silently clean under every `--scope`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/features/x/lib/not-a-modal-file.ts":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = { id: "x" };\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Not co-located" },
      why: "a ModalDefinition outside a `*-modal` file — the co-location arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-definition.ts": 'export const xDef = { id: "x", trigger: { placement: "surface" }, body: () => null };\n',
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { xDef } from "./x-definition.ts";\nexport const xModal: ModalDefinition = xDef;\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Definition outside its home" },
      why: "THE #944 CASE, judged instead of refused: the initializer is IMPORTED, so the file at the sanctioned path holds no definition. The legacy reader could not read it at all; the shared fact resolves it and checks the object's OWN home",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = buildModal();\ndeclare function buildModal(): ModalDefinition;\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Unreadable definition" },
      why: "a BUILDER initializer stays fail-closed — §6d sanctions no builder, so the co-location law cannot be established through it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = { id: "x", trigger: { placement: "surface" }, body: { planned: "" } };\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Empty planned reason" },
      why: "a DECLARED-PLANNED modal with an empty reason — the planned-reason arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "x", trigger: { placement: "mobile-tab" }, body: () => null };\n',
        "packages/client/src/features/b/lib/b-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const bModal: ModalDefinition = { id: "y", trigger: { placement: "mobile-tab" }, body: () => null };\n',
      },
      expect: { count: 1, token: "bModal", messageIncludes: "Duplicate singleton placement" },
      why: "two modals claiming the `mobile-tab` singleton placement — the singleton-placement arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "dup" as never, trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/features/b/lib/b-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const bModal: ModalDefinition = { id: "dup" as never, trigger: { placement: "rail.end" }, body: () => null };\n',
      },
      expect: { count: 1, token: "bModal", messageIncludes: "Duplicate id" },
      why: "duplicate ids written `'dup' as never` — the wrapped-literal shape a plain StringLiteral reader passes silently",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = { id: "x", trigger: { placement: "surface" }, body: () => null };\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Unreachable surface modal" },
      why: "a `surface` modal with a real body and NO openModal(id) opener — the surface-reachability arm (§E-7)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/state/shell-store.ts": "export function openModal(id: string): void { void id; }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = { id: "x", trigger: { placement: "surface" }, body: () => null };\n',
        "packages/client/src/features/x/components/opener.tsx":
          'function openModal(id: string): void { void id; }\nexport const open = (): void => openModal("x");\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Unreachable surface modal" },
      why: "THE SEMANTIC UPGRADE: a LOCAL function named `openModal` is not the canonical shell opener, so the modal is still unreachable. The legacy text match counted it and reported a clean modal",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/routes/some-route.tsx": "export const G = <AppShell modals={{ theme: 1, settings: 2 }} />;\n",
      },
      expect: { count: 1, token: "modals", messageIncludes: "god-map" },
      why: "a `modals` prop object literal in a route — the anti-god-map arm",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const themeModal: ModalDefinition = { id: "theme", trigger: { placement: "rail.end" }, body: () => null };\n',
      },
      why: "a FULL co-located modal (function body, repeatable rail.end placement) — passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/draft-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const draftModal: ModalDefinition = { id: "draft", trigger: { placement: "surface" }, body: { planned: "build pending" } };\n',
      },
      why: "a DECLARED-PLANNED surface modal — planned bodies are exempt from the opener requirement — passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/state/shell-store.ts": "export function openModal(id: string): void { void id; }\n",
        "packages/client/src/state/index.ts": 'export { openModal } from "./shell-store.ts";\n',
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = { id: "x", trigger: { placement: "surface" }, body: () => null };\n',
        "packages/client/src/features/x/components/opener.tsx":
          'import { openModal as open } from "../../../state/index.ts";\nexport const Opener = (): void => open("x");\n',
      },
      why: "THE ALIAS + RE-EXPORT CONTROL: the opener is imported under a different local name through a barrel, and still proves reachability — resolving origin widens what the arm SEES, never what it accuses",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nconst themeModalDef = { id: "theme", trigger: { placement: "rail.end" }, body: () => null };\nexport const themeModal: ModalDefinition = themeModalDef;\n',
      },
      why: "SAME-FILE indirection — the resolved object literal is still in the modal's own home, so every arm judges the real definition",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const themeModal: ModalDefinition = { id: "theme", trigger: { placement: "rail.end" }, body: () => null } satisfies ModalDefinition;\n',
      },
      why: "a WHOLE-literal `satisfies` wrapper — the shape a plain ObjectLiteral check treats as unreadable and silently skips",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/state/shadow.ts":
          'interface ModalDefinition { readonly id: string }\nexport const notAModal: ModalDefinition = { id: "shadow" };\n',
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
      },
      why: "THE SHADOW CONTROL: a LOCAL type that merely shares the name is not the canonical ModalDefinition, so an uncolocated declaration annotated with it is not this policy's subject",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/routes/some-route.tsx": "export const G = <AppShell modals={modalRegistry} />;\n",
      },
      why: "the god-map arm's FALSE branch: a `modals` prop that forwards the assembled registry is not an object-literal override map",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/features/x/components/panel.tsx": "export const P = <AppShell modals={{ theme: 1 }} />;\n",
      },
      why: "THE ROUTE FENCE, pinned: the god-map arm judges `packages/client/src/routes/` ONLY, because a `modals={{…}}` prop anywhere else is an ordinary component prop. Deleting the `startsWith(ROUTES)` guard flags this component and REDS this row — without it the fence is a claim no positive row visits",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const aModal: ModalDefinition = { id: "a", trigger: { placement: "rail.end" }, body: () => null };\n',
        "packages/client/src/routes/other-route.tsx": "export const G = <AppShell overrides={{ theme: 1 }} />;\n",
      },
      why: "THE ATTRIBUTE-NAME FENCE, pinned: the arm bans the `modals` override map specifically, not every object-literal prop a route passes down. Replacing the `GOD_MAP_PROP` comparison with a bare JsxAttribute test flags this route and REDS this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\n' +
          "// @orb-waive modal-registry-completeness(xModal): pinned identity arm; ends when this modal declares a real reason.\n" +
          'export const xModal: ModalDefinition = { id: "x", trigger: { placement: "surface" }, body: { planned: "" } };\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the `Empty planned reason` mustFlag row, which produces EXACTLY ONE finding (the empty reason RETURNS `refused`, so the surface-reachability arm never adds a second), waived at the position this policy reports — the declared name `xModal`",
    },
  ],
});
