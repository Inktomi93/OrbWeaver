// Policy: modal-body-not-placeholder (client-architecture-lockdown.md §6d / §16 G13) — a ModalDefinition
// whose FUNCTION-arm `body` renders `<SectionPlaceholder>` is RED. An unbuilt modal uses the
// DECLARED-PLANNED arm (`body: { planned: "<reason>" }`); a placeholder-rendering function body is the
// silent-sparkle anti-pattern, and it is unspellable.
//
// Both identities are semantic rather than textual. The modal population is the shared
// `registryDefinitionFacts.modal`, so an aliased or re-exported `ModalDefinition` annotation is the same subject
// and a local type that merely shares the name is not. The placeholder component is resolved to its
// canonical module export, so `import { SectionPlaceholder as Empty }` is caught and an unrelated local
// component named `SectionPlaceholder` is not. The import-name set is a CANDIDATE filter only.
//
// FAMILY: `registry-definitions` — the shared `lib/` subject reader is `lib/registry-fact.ts`
// `registryDefinitionFacts` (this policy declares the `.modal` provider), with `lib/registry-definition-anchor.ts`
// `definitionAnchor`/`definitionName` and `lib/registry-definition-field.ts` `definitionField` supplying the
// shared anchor and field readers every sibling in the family uses. Not a singleton, not a topic.
//
// THE REPORTED POSITION is the definition's DECLARED NAME (`themeModal`), supplied by `definitionAnchor` —
// never derived, because the runtime's deriver would return the `export` keyword and every finding in the
// family would then share one position (that module's own header states why). `fix` states the spelling.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `modal-body-not-placeholder` descriptor at f5b222e10d2ffc5d8a364eaf0694e31fdc5b8823, the parent of the conversion
// `577d03d63` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,141 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 11 and final `population` admits 1,302. legacy − final = ∅. final − legacy = 1,291 `@client` sources outside
// `*-modal.{ts,tsx}` files — the subject is now the canonical `ModalDefinition` type from the shared registry fact,
// not a filename. Controls: inside `packages/client/src/features/app-shell/lib/__cbbhr_in_you-modal.tsx` (virtual)
// admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionField } from "../lib/registry-definition-field.ts";
import { readJsxTagFact, registryDefinitionFacts } from "../lib/registry-fact.ts";
import { resolveAuthoredComposite } from "../lib/static-authored-value.ts";

const PLACEHOLDER = "SectionPlaceholder";

const MESSAGE =
  "a ModalDefinition is unreadable or dishonest: a definition this policy cannot resolve to an authored object literal " +
  "(§6d gives the definition ONE home, so the placeholder law cannot be established through it), or a function `body` " +
  'that renders <SectionPlaceholder> — an unbuilt modal is the DECLARED-PLANNED arm (`body: { planned: "<reason>" }`), ' +
  "never a placeholder-rendering function body (client-architecture-lockdown.md §6d).";
const FIX =
  'use `body: { planned: "<reason>" }` for an unbuilt modal, or render a real body. A deliberate exception is ' +
  "waived with `// @orb-waive modal-body-not-placeholder(<position>): <reason>` on a line above the " +
  "definition, where <position> is the definition's DECLARED NAME (`themeModal`) — not the tag, not the " +
  "`body` field and not the `export` keyword the runtime would otherwise derive.";

/** The local names an import binds to the canonical placeholder — a candidate filter, never a verdict. */
function notePlaceholderImport(node: MorphNode, names: Set<string>): void {
  if (Node.isImportSpecifier(node) && node.getName() === PLACEHOLDER) {
    names.add(node.getAliasNode()?.getText() ?? node.getName());
  }
}

function tagNameText(node: MorphNode): string | undefined {
  if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
    return;
  }
  const tagName = node.getTagNameNode();
  return Node.isPropertyAccessExpression(tagName) ? tagName.getName() : tagName.getText();
}

/** Is this element the canonical placeholder component, proven through its module origin? */
function isCanonicalPlaceholder(node: MorphNode): boolean {
  const fact = readJsxTagFact(node);
  return fact.kind === "resolved" && fact.value.origin.canonical.exportedName === PLACEHOLDER;
}

/** The FUNCTION arm of a modal body, resolved through stable aliases; the `{ planned }` arm is not one. */
function functionBody(definition: RegistryDefinitionFact): MorphNode | undefined {
  if (definition.object.kind === "unresolved") {
    return;
  }
  const body = definitionField(definition.object.value, "body");
  if (body === undefined) {
    return;
  }
  const resolved = resolveAuthoredComposite(body);
  if (resolved.kind === "unresolved") {
    return;
  }
  return Node.isArrowFunction(resolved.value) || Node.isFunctionExpression(resolved.value) ? resolved.value : undefined;
}

function contains(outer: MorphNode, inner: MorphNode): boolean {
  return outer.getSourceFile().compilerNode === inner.getSourceFile().compilerNode && outer.getStart() <= inner.getStart() && inner.getEnd() <= outer.getEnd();
}

export const gate = defineGate({
  id: "modal-body-not-placeholder",
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
    const placeholderNames = new Set<string>([PLACEHOLDER]);
    const candidates: MorphNode[] = [];
    const report = (definition: RegistryDefinitionFact, detail: string): void =>
      ctx.report.node(definition.declaration, { ...definitionAnchor(definition.declaration), message: `${MESSAGE} ${detail}`, fix: FIX });

    return {
      visitors: [
        { kinds: [SyntaxKind.ImportSpecifier], visit: (node) => notePlaceholderImport(node, placeholderNames) },
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node) => {
            const name = tagNameText(node);
            if (name !== undefined && placeholderNames.has(name)) {
              candidates.push(node);
            }
          },
        },
      ],
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts.modal);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        const placeholders = candidates.filter(isCanonicalPlaceholder);
        for (const definition of view.definitions) {
          const name = definitionName(definition.declaration);
          if (definition.object.kind === "unresolved") {
            report(definition, `Unreadable definition: "${name}" — ${definition.object.reason}: ${definition.object.detail}.`);
            continue;
          }
          const body = functionBody(definition);
          if (body !== undefined && placeholders.some((element) => contains(body, element))) {
            report(definition, `Placeholder body: "${name}" renders <${PLACEHOLDER}> from its function \`body\`.`);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <SectionPlaceholder /> };\n',
      },
      expect: { count: 1, token: "themeModal", messageIncludes: "Placeholder body" },
      why: "a ModalDefinition function body rendering <SectionPlaceholder> — the silent-sparkle anti-pattern",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { SectionPlaceholder as Empty } from "../../app-shell/components/section-placeholder.tsx";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <Empty /> };\n',
      },
      expect: { count: 1, token: "themeModal", messageIncludes: "Placeholder body" },
      why: "THE ALIAS RED: the placeholder imported under another local name is the same component. A tag-text match leaves the whole class unspelled",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const xModal: ModalDefinition = buildModal();\ndeclare function buildModal(): ModalDefinition;\n',
      },
      expect: { count: 1, token: "xModal", messageIncludes: "Unreadable definition" },
      why: "a BUILDER definition fails closed — the placeholder law cannot be established through an initializer this policy cannot resolve",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/draft-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const draftModal: ModalDefinition = { id: "draft", body: { planned: "build pending" } };\n',
      },
      why: "the DECLARED-PLANNED arm (an object literal, not a function) — the sanctioned unbuilt state",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <ThemePanel /> };\ndeclare function ThemePanel(): null;\n',
      },
      why: "a function body rendering a REAL body — the false branch",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nfunction SectionPlaceholder(): null {\n  return null;\n}\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <SectionPlaceholder /> };\n',
      },
      why: "THE SHADOW CONTROL: a LOCAL component that merely shares the name is not the canonical placeholder, so the tag-text match's false positive is unspellable here",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
        "packages/client/src/features/settings/lib/theme-panel.tsx":
          'import { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nexport const ThemePanel = (): null => <SectionPlaceholder />;\n',
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { ThemePanel } from "./theme-panel.tsx";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <ThemePanel /> };\n',
      },
      why: "THE DECLARED LIMIT, written down: the rule is about the body's OWN render. A placeholder rendered deeper inside a real component the body mounts is that component's business, not a dishonest modal body",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nconst themeModalDef = { id: "theme", body: () => <ThemePanel /> };\nexport const themeModal: ModalDefinition = themeModalDef;\ndeclare function ThemePanel(): null;\n',
      },
      why: "SAME-FILE indirection resolves, so the real body is judged",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => null };\n',
        "packages/client/src/features/settings/lib/impostor-modal.tsx":
          'import { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\ninterface ModalDefinition {\n  readonly id: string;\n}\nexport const fake: ModalDefinition = { id: "fake", body: () => <SectionPlaceholder /> };\n',
      },
      why: "THE COUNTERFACTUAL for the SUBJECT's identity: `fake` renders the real placeholder from a real function body, but it is annotated with a LOCAL type that merely shares the ModalDefinition name — it is not a modal, so it is not this policy's subject",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/modal-registry.ts": "export interface ModalDefinition { readonly id: string }\n",
        "packages/client/src/features/app-shell/components/section-placeholder.tsx": "export function SectionPlaceholder(): null {\n  return null;\n}\n",
        "packages/client/src/features/settings/lib/theme-modal.tsx":
          'import type { ModalDefinition } from "../../../state/modal-registry.ts";\nimport { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\n// @orb-waive modal-body-not-placeholder(themeModal): a stand-in reason and its end condition.\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <SectionPlaceholder /> };\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position — the definition's declared NAME, which `definitionAnchor` anchors on precisely so a waiver is stable and legible — suppresses the twin of mustFlag[0]. One definition, one finding, one marker, zero effective findings and zero authority alarms; a wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
