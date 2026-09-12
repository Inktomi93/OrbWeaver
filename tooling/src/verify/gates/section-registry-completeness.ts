// Policy: section-registry-completeness (client-architecture-lockdown.md §6 / §16 G1) — the section
// registry's structural walls tsc cannot see. tsc forces the door Record total over SECTION_IDS; this adds
// CO-LOCATION, the DECLARED-PLANNED discipline (O1), DUPLICATE ID, and the anti-god-map ban on a route
// re-forming a `sections` object-literal map.
//
// The subject is the shared `registryDefinitionFacts.section` provider, which covers BOTH sanctioned authoring
// shapes — the annotated const AND the `make<X>Section(): SectionDefinition` factory (§6b/M3, live on four
// of the ten sections) — by canonical TYPE identity, so an aliased or re-exported annotation is the same
// subject and a local type that merely shares the name is not. The definition's own object literal is
// resolved across files, so an imported initializer is not an unjudgeable blob: it is a definition whose
// HOME is checked directly.
//
// THE ROUTE IMPORT ARM IS NOT HERE. "A non-auth feature front door may be imported only by the sanctioned
// composition route" is a rule whose exceptions are recurring repository PERMISSIONS, not per-occurrence
// waivers, so it is `route-imports-no-feature` under reviewed-grant authority — one authority per policy
// (the same split the design's own `tooling-front-door` row prescribes).
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` (`registryDefinitionFacts`,
// one provider per definition kind) plus `lib/registry-definition-{anchor,field,home}.ts`, consumed
// identically by all seven members, so the co-location law and the finding anchor cannot drift apart.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (dd862e988^); the final population is `@client`. The ROUTES fence stays INSIDE the god-map arm rather
// than in the population, because the other four arms judge the whole client tree.
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionField, definitionObjectField, definitionStringField } from "../lib/registry-definition-field.ts";
import { DEFINITION_SLOTS, isDefinitionHome } from "../lib/registry-definition-home.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";

const ROUTES = "packages/client/src/routes/";
const GOD_MAP_PROP = "sections";
/** The one context kind that is NOT a real body: a section that renders no context pane. */
const CONTEXT_NONE = "none";

const MESSAGE =
  "a section is dishonest: a SectionDefinition whose declaration or resolved definition is not co-located at " +
  "packages/client/src/features/<owner>/lib/<id>-section.{ts,tsx}, a definition this policy cannot resolve to an " +
  "authored object literal, an unreadable or duplicate id, a DECLARED-PLANNED section with an empty reason or a real " +
  "body, or a route re-forming the `sections` god-map — client-architecture-lockdown.md §6.";
const FIX =
  "co-locate the definition and write it as an authored object literal, or a `make<X>Section(): SectionDefinition` factory returning one; a planned section is a non-empty reason and no body (context kind none); a route is a thin mount — sections ride the registry. For a deliberate exception, write an adjacent `@orb-waive section-registry-completeness(<position>): <why + end condition>` — the position is the DECLARED NAME of the section (`xSection`, `makeXSection`), and on the god-map arm it is the JSX attribute name `sections`.";

interface Claim {
  readonly name: string;
  readonly file: string;
}

interface Home {
  readonly object: ObjectLiteralExpression;
  readonly path: string;
}

/** Does this section wire a REAL body — a list, a header, or a context pane that is not `{ kind: "none" }`?
 *  A `context` produced by a CALL (the `defineContextTabs(…)` mint) is real: it returns a rendered shape a
 *  plain object-literal check cannot see. */
function wiresRealBody(object: ObjectLiteralExpression): boolean {
  if (object.getProperty("list") !== undefined || object.getProperty("header") !== undefined) {
    return true;
  }
  const context = definitionField(object, "context");
  if (context === undefined) {
    return false;
  }
  if (Node.isCallExpression(context)) {
    return true;
  }
  const resolved = definitionObjectField(object, "context");
  if (resolved === undefined || resolved.kind === "unresolved") {
    return false;
  }
  const kind = definitionStringField(resolved.value, "kind");
  return kind !== undefined && kind.kind === "resolved" && kind.value !== CONTEXT_NONE;
}

/** A `sections={{…}}` object-literal prop — the deleted override god-map re-formed at a route. */
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

export const gate = defineGate({
  id: "section-registry-completeness",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts.section],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const claimedIds = new Map<string, Claim>();
    const godMaps: MorphNode[] = [];
    const report = (node: MorphNode, detail: string): void => ctx.report.node(node, { ...definitionAnchor(node), message: `${MESSAGE} ${detail}`, fix: FIX });

    const resolveHome = (definition: RegistryDefinitionFact, name: string): Home | undefined => {
      const declarationPath = ctx.relativePath(definition.declaration.getSourceFile());
      if (!isDefinitionHome(declarationPath, DEFINITION_SLOTS.section)) {
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
      // THROWS there and would withhold the whole policy (guide §12.3), so the home is read totally.
      const objectPath = declarationHome(ctx, object.getSourceFile());
      if (!isDefinitionHome(objectPath, DEFINITION_SLOTS.section)) {
        report(definition.declaration, `Definition outside its home: "${name}" resolves to an object literal declared at ${objectPath}.`);
        return;
      }
      return { object, path: objectPath };
    };

    const claimId = (definition: RegistryDefinitionFact, name: string, home: Home): boolean => {
      const id = definitionStringField(home.object, "id");
      if (id === undefined || id.kind === "unresolved") {
        report(definition.declaration, `Unreadable id: "${name}" declares no authored string id, so the duplicate-id arm cannot judge it.`);
        return false;
      }
      const owner = claimedIds.get(id.value);
      if (owner === undefined) {
        claimedIds.set(id.value, { name, file: home.path });
        return true;
      }
      report(definition.declaration, `Duplicate id "${id.value}": "${name}" repeats the id first claimed by "${owner.name}" (${owner.file}).`);
      return true;
    };

    const judgePlanned = (definition: RegistryDefinitionFact, name: string, home: Home): void => {
      const content = definitionObjectField(home.object, "content");
      if (content === undefined || content.kind === "unresolved") {
        return;
      }
      const planned = definitionStringField(content.value, "planned");
      if (planned === undefined) {
        return;
      }
      if (planned.kind === "unresolved") {
        report(definition.declaration, `Unreadable planned reason: "${name}" declares a \`content.planned\` this policy cannot read as an authored string.`);
        return;
      }
      if (planned.value.length === 0) {
        report(definition.declaration, `Empty planned reason: "${name}" declares \`content: { planned: "" }\`, which states nothing.`);
      }
      if (wiresRealBody(home.object)) {
        report(definition.declaration, `Planned section wires a real body: "${name}" is DECLARED-PLANNED and still wires a list, a header, or a context pane.`);
      }
    };

    return {
      visitors: [
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
        const view = ctx.fact(registryDefinitionFacts.section);
        ctx.receipt({ kind: "population", source: view.source, members: view.definitions.length, unresolved: 0 });
        for (const definition of view.definitions) {
          const name = definitionName(definition.declaration);
          const home = resolveHome(definition, name);
          if (home !== undefined && claimId(definition, name, home)) {
            judgePlanned(definition, name, home);
          }
        }
        for (const attribute of godMaps) {
          report(attribute, "A route declares a `sections={{…}}` object-literal prop — the override god-map the registry replaced.");
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport { uiSection } from "../../../../../ui/src/section-defs.ts";\nexport const xSection: SectionDefinition = uiSection;\n',
        "packages/ui/src/section-defs.ts": 'export const uiSection = { id: "x" };\n',
      },
      expect: { count: 1, token: "xSection", messageIncludes: "Definition outside its home" },
      why: "THE HOME READ IS TOTAL, and this row is the one that dies without it: `definition.object` is a RESOLUTION — the shared authored-value reader follows a cross-module const to its real declaration, which is routinely OUTSIDE this policy's `@client` population — and NOT only through a vendor `.d.ts`: an ordinary sibling-package import of a `@orb/ui` const, one hop outside `@client`, reproduces it (audit receipt, docs/reviews/gate-runtime/v-audit-wave2-2026-09-12.md D1). `ctx.relativePath` REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so asking it for a foreign object's home THREW and withheld the WHOLE policy — the exact failure that left `freeze-provenance-write-pairing` reporting nothing on every real-tree run while sitting at 0 conformance failures (2026-09-11, guide §12.3). The home is now read through `lib/declaration-home.ts`. AGAINST THE UNMODIFIED MODULE THIS ROW REDS AS A TOOL ERROR rather than as a missing finding, and that is not a mis-authored row: the planted out-of-population object makes `evaluate` THROW, which is the real-tree failure reproduced inside conformance. Membership in `ctx.files` is NOT the alternative — policy-pass.ts:316 intersects it with a scoped run's requested paths, so that spelling reads silently clean under every `--scope`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/features/x/lib/not-a-section-file.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const xSection: SectionDefinition = { id: "x", content: () => null };\n',
      },
      expect: { count: 1, token: "xSection", messageIncludes: "Not co-located" },
      why: "a SectionDefinition outside a `*-section` file — the co-location arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const xSection: SectionDefinition = { id: "x", content: { planned: "" }, context: { kind: "none" } };\n',
      },
      expect: { count: 1, token: "xSection", messageIncludes: "Empty planned reason" },
      why: "a DECLARED-PLANNED section with an empty reason — the planned-reason arm (O1)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const xSection: SectionDefinition = { id: "x", content: { planned: "soon" }, list: () => null, context: { kind: "none" } };\n',
      },
      expect: { count: 1, token: "xSection", messageIncludes: "wires a real body" },
      why: "a planned section that also wires a list — the badge-wearing half-build arm (O1)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\ndeclare function defineContextTabs(input: unknown): { kind: "tabs" };\nexport const xSection: SectionDefinition = { id: "x", content: { planned: "soon" }, context: defineContextTabs({ tabs: [] }) };\n',
      },
      expect: { count: 1, token: "xSection", messageIncludes: "wires a real body" },
      why: "a planned section wired `context: defineContextTabs(…)` — a CALL the plain object-literal check cannot see (M3 amendment)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeASection(): SectionDefinition {\n  return { id: "dup", content: () => null, context: { kind: "none" } };\n}\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const bSection: SectionDefinition = { id: "dup", content: () => null, context: { kind: "none" } };\n',
      },
      expect: { count: 1, token: "bSection", messageIncludes: "Duplicate id" },
      why: "THE FACTORY CONTROL (§6b/M3): a `make<X>Section(): SectionDefinition` factory colliding with a const section's id. Four live sections are authored this way and a variable-declaration-only reader saw none of them",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-definition.ts": 'export const aDef = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nimport { aDef } from "./a-definition.ts";\nexport const aSection: SectionDefinition = aDef;\n',
      },
      expect: { count: 1, token: "aSection", messageIncludes: "Definition outside its home" },
      why: "THE #944 CASE, judged instead of refused: the IMPORTED initializer means the sanctioned `*-section.ts` path holds no definition",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/routes/some-route.tsx": "export const G = <AppShell sections={{ chats: 1, characters: 2 }} />;\n",
      },
      expect: { count: 1, token: "sections", messageIncludes: "god-map" },
      why: "a `sections` prop object literal in a route — the anti-god-map arm",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/refinery/lib/refinery-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const refinerySection: SectionDefinition = { id: "refinery", content: { planned: "build pending" }, context: { kind: "none" } };\n',
      },
      why: "the founding DECLARED-PLANNED section — a non-empty reason, fully placeholder — passes (O1)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/chat/lib/chats-section.tsx":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport function makeChatsSection(): SectionDefinition {\n  return { id: "chats", content: () => null, context: { kind: "none" } };\n}\n',
      },
      why: "the factory arm's FALSE branch — a co-located factory with a unique id and a real body passes, so widening the subject is not a blanket accusation",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nconst xDef = { id: "x", content: () => null, context: { kind: "none" } };\nexport const xSection: SectionDefinition = xDef;\n',
      },
      why: "SAME-FILE indirection — the resolved literal is still in the section's own home, so every arm judges the real definition",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/features/b/lib/b-section.ts":
          'interface SectionDefinition {\n  readonly id: string;\n}\nexport const bSection: SectionDefinition = { id: "a", content: () => null };\n',
      },
      why: "THE COUNTERFACTUAL: `bSection` is annotated with a LOCAL type that merely shares the name, so it is not a section and cannot collide with a section's id",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/routes/app-root.tsx": "export const G = <AppShell sections={sectionRegistry} />;\n",
      },
      why: "the god-map arm's FALSE branch: a `sections` prop that forwards the assembled registry is not an object-literal override map",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/features/x/components/panel.tsx": "export const P = <AppShell sections={{ chats: 1 }} />;\n",
      },
      why: "THE ROUTE FENCE, pinned: the god-map arm judges `packages/client/src/routes/` ONLY, because a `sections={{…}}` prop anywhere else is an ordinary component prop and not the deleted override map. Deleting the `startsWith(ROUTES)` guard flags this component and REDS this row — without it the fence is a claim the positives never visit",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/a/lib/a-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\nexport const aSection: SectionDefinition = { id: "a", content: () => null, context: { kind: "none" } };\n',
        "packages/client/src/routes/other-route.tsx": "export const G = <AppShell overrides={{ chats: 1 }} />;\n",
      },
      why: "THE ATTRIBUTE-NAME FENCE, pinned: the arm bans the `sections` override map specifically, not every object-literal prop a route passes down. Replacing the `GOD_MAP_PROP` comparison with a bare JsxAttribute test flags this route and REDS this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/state/section-registry.ts": "export interface SectionDefinition { readonly id: string }\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import type { SectionDefinition } from "../../../state/section-registry.ts";\n' +
          "// @orb-waive section-registry-completeness(xSection): pinned identity arm; ends when this section declares a real reason.\n" +
          'export const xSection: SectionDefinition = { id: "x", content: { planned: "" }, context: { kind: "none" } };\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the `Empty planned reason` mustFlag row, which produces EXACTLY ONE finding, waived by the one central marker at the position this policy actually reports — the declared name `xSection`, not the `planned` field a reader would call the offense",
    },
  ],
});
