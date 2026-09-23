// Policy: config-group-completeness (client-architecture-lockdown.md §8 / §16 G4 
// §3.1 + §6.8) — the config-group registry's structural walls tsc cannot see. tsc forces the door Record
// total over CONFIG_GROUP_IDS and (§6.8) types every non-collection group as a SKIMMER, so the arms the type
// system owns are not here. What is here:
//   CO-LOCATION — a `ConfigGroupDefinition` lives only in `features/*/lib/*-group.{ts,tsx}`, and a
//     `CollectionContribution` only in `features/*/lib/*-collection.{ts,tsx}`;
//   DUPLICATE ID — two group definitions claiming one id is a shadow def that rots green;
//   LIFECYCLE-IS-DATA — a collection's `create` is `{label, useRun}` and a
//     declared `importFile` is `{label, accept, useRun}`: the HOST draws both affordances in its own chrome
//     grammar, so the body declares data and never a rendered node;
//   ORPHAN BODY — a co-located `CollectionContribution` no group's `body.collection` references is dead wire
//     that reads as a shipped library, and knip-invisible because the front door re-exports it;
//   HOST-IMPORTS-NO-BODY — the config CONTENT host importing a feature's internals instead of reading bodies
//     off the registries.
//
// THREE DENOMINATORS, all declared and never summed: the group definitions, the collection bodies, and the
// config content host itself — the last one so a renamed host cannot silently retire its import arm.
//
// A collection REFERENCE is resolved, not compared by name: `body.collection` must resolve through the
// shared module-origin reader to that exact collection's exported declaration, so an unrelated local named
// the same thing does not register a library and an aliased import still does.
//
// THE ANCHOR ARM IS NOT HERE. "A file that stamps `configAnchorId(…)` must be registry-registered" has
// recurring repository PERMISSIONS for the anchor READERS rather than per-occurrence waivers, so it is
// `config-anchor-in-registry` under reviewed-grant authority — one authority per policy.
//
// FAMILY `registry-definitions` — the shared reader is `lib/registry-fact.ts` (`registryDefinitionFacts`,
// here two kinds: `config-group` and `collection`) plus `lib/registry-definition-{anchor,field,home}.ts`,
// consumed identically by all seven members.
// POPULATION PORT: byte-identical. The legacy descriptor filtered `path.includes("/packages/client/src/")`
// (58370d705^); the final population is `@client`. The HOST fence and the two specifier prefixes stay
// INSIDE the import arm, since the definition arms judge the whole client tree.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `config-group-completeness` descriptor at dd862e988959e1f2f1d216d0649c029fea8d9751, the parent of the conversion
// `58370d705` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The legacy
// descriptor had no `scanRoot`, so its effective population is its in-run path filter — run:
// `if (!path.includes(CLIENT_SRC)) continue` with CLIENT_SRC = "/packages/client/src/". Over the SAME 7,144 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it admits 1,302 and the final
// `population` admits 1,302 (the bare harness dispatch was 7,144). legacy − final = ∅. final − legacy = ∅. Controls:
// inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` rejected by both.
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { DEFINITION_SLOTS } from "../contract/registry-definition-home.ts";
import type { RegistryDefinitionFact } from "../contract/registry-fact.ts";
import { declarationHome } from "../lib/declaration-home.ts";
import { definitionAnchor, definitionName } from "../lib/registry-definition-anchor.ts";
import { definitionField, definitionObjectField, definitionStringField } from "../lib/registry-definition-field.ts";
import { isDefinitionHome } from "../lib/registry-definition-home.ts";
import { registryDefinitionFacts } from "../lib/registry-fact.ts";

/** The config CONTENT host: the surface that must read bodies off the registries, never import a feature. */
const HOST = "packages/client/src/features/config/surfaces/config-content-surface.tsx";
const HOST_POPULATION = "config content host";
const FEATURE_DOOR = "#features/";
/** Two `..` hops leave `features/config/` for a sibling feature's internals. */
const ESCAPING_RELATIVE = "../../";

const MESSAGE =
  "a config group is dishonest: a ConfigGroupDefinition or CollectionContribution not co-located at its " +
  "features/<owner>/lib/<id>-{group,collection}.{ts,tsx} home, a definition this policy cannot resolve to an authored " +
  "object literal, a duplicate group id, a collection whose `create`/`importFile` is not host-drawable DATA, a " +
  "collection body no group registers, or the config content host importing a feature's internals — " +
  "client-architecture-lockdown.md §8.";
const FIX =
  "co-locate each definition and write it as an authored object literal; declare `create: { label, useRun }` and `importFile: { label, accept, useRun }` as data; register every collection body through its group's `body.collection`; read bodies off the registries in the host instead of importing a feature. For a deliberate exception, write an adjacent `@orb-waive config-group-completeness(<position>): <why + end condition>` — the position is the DECLARED NAME of the group or collection (`xCollection`), and on the host-import arm it is the keyword `import` that opens the offending declaration.";

/** The canonical types, the content host, and one registered group/collection pair. Every proof carries it:
 *  all three denominators must be nonempty for this policy to render a verdict at all, which is the point. */
const PRELUDE = {
  "packages/client/src/state/config-group-registry.ts": "export interface ConfigGroupDefinition { readonly id: string }\n",
  "packages/client/src/lib/collection-contracts.ts": "export interface CollectionContribution { readonly create: unknown }\n",
  [HOST]: "export const ConfigContentSurface = (): null => null;\n",
  "packages/client/src/features/base/lib/base-collection.tsx":
    'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const baseCollection: CollectionContribution = { create: { label: "New base", useRun: () => () => undefined } };\n',
  "packages/client/src/features/base/lib/base-group.tsx":
    'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { baseCollection } from "./base-collection.tsx";\nexport const baseGroup: ConfigGroupDefinition = { id: "base", body: { collection: baseCollection } };\n',
} as const;

interface Claim {
  readonly name: string;
  readonly file: string;
}

interface Home {
  readonly object: ObjectLiteralExpression;
  readonly path: string;
}

/** One collection body, keyed by the exported identity a group must resolve to. */
interface CollectionBody {
  readonly definition: RegistryDefinitionFact;
  readonly name: string;
  readonly file: string;
}

function nonEmptyString(object: ObjectLiteralExpression, field: string): boolean {
  const read = definitionStringField(object, field);
  return read !== undefined && read.kind === "resolved" && read.value.length > 0;
}

/** The exported identity a group's `body.collection` names, as `<file>#<exportedName>`, or undefined. */
function referencedCollection(object: ObjectLiteralExpression): string | undefined {
  const body = definitionObjectField(object, "body");
  if (body === undefined || body.kind === "unresolved") {
    return;
  }
  const reference = definitionField(body.value, "collection");
  if (reference === undefined) {
    return;
  }
  const origin = resolveModuleMemberOrigin(reference);
  if (origin.kind === "unresolved" || origin.value.canonical.kind !== "project") {
    return;
  }
  return `${origin.value.canonical.sourceFile.getFilePath()}#${origin.value.canonical.exportedName}`;
}

export const gate = defineGate({
  id: "config-group-completeness",
  family: "registry-definitions",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [registryDefinitionFacts["config-group"], registryDefinitionFacts.collection],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const claimedIds = new Map<string, Claim>();
    const hosts = new Set<string>();
    const hostImports: MorphNode[] = [];
    const report = (node: MorphNode, detail: string): void => ctx.report.node(node, { ...definitionAnchor(node), message: `${MESSAGE} ${detail}`, fix: FIX });

    const resolveHome = (
      definition: RegistryDefinitionFact,
      name: string,
      slot: (typeof DEFINITION_SLOTS)[keyof typeof DEFINITION_SLOTS],
    ): Home | undefined => {
      const declarationPath = ctx.relativePath(definition.declaration.getSourceFile());
      if (!isDefinitionHome(declarationPath, slot)) {
        report(definition.declaration, `Not co-located: "${name}" is declared at ${declarationPath}, not at a ${slot} home.`);
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
      if (!isDefinitionHome(objectPath, slot)) {
        report(definition.declaration, `Definition outside its home: "${name}" resolves to an object literal declared at ${objectPath}.`);
        return;
      }
      return { object, path: objectPath };
    };

    const judgeLifecycle = (definition: RegistryDefinitionFact, name: string, home: Home): void => {
      const create = definitionObjectField(home.object, "create");
      if (create === undefined || create.kind === "unresolved") {
        report(definition.declaration, `Collection lifecycle is not data: "${name}" declares no host-drawable \`create: { label, useRun }\`.`);
      } else if (!(nonEmptyString(create.value, "label") && definitionField(create.value, "useRun") !== undefined)) {
        report(definition.declaration, `Collection lifecycle is not data: "${name}"'s \`create\` needs a non-empty literal \`label\` and a \`useRun\` hook.`);
      }
      if (definitionField(home.object, "importFile") === undefined) {
        return;
      }
      const door = definitionObjectField(home.object, "importFile");
      if (door === undefined || door.kind === "unresolved") {
        report(definition.declaration, `Collection lifecycle is not data: "${name}"'s \`importFile\` is not an authored data literal.`);
        return;
      }
      const complete = nonEmptyString(door.value, "label") && nonEmptyString(door.value, "accept") && definitionField(door.value, "useRun") !== undefined;
      if (!complete) {
        report(
          definition.declaration,
          `Collection lifecycle is not data: "${name}"'s \`importFile\` needs a literal \`label\`, a literal \`accept\` and a \`useRun\` hook.`,
        );
      }
    };

    const claimId = (definition: RegistryDefinitionFact, name: string, home: Home): void => {
      const id = definitionStringField(home.object, "id");
      if (id === undefined || id.kind === "unresolved") {
        report(definition.declaration, `Unreadable id: "${name}" declares no authored string id, so the duplicate-id arm cannot judge it.`);
        return;
      }
      const owner = claimedIds.get(id.value);
      if (owner === undefined) {
        claimedIds.set(id.value, { name, file: home.path });
        return;
      }
      report(definition.declaration, `Duplicate id "${id.value}": "${name}" repeats the id first claimed by "${owner.name}" (${owner.file}).`);
    };

    const judgeGroups = (definitions: readonly RegistryDefinitionFact[], referenced: Set<string>): void => {
      for (const definition of definitions) {
        const name = definitionName(definition.declaration);
        const home = resolveHome(definition, name, DEFINITION_SLOTS.group);
        if (home === undefined) {
          continue;
        }
        const reference = referencedCollection(home.object);
        if (reference !== undefined) {
          referenced.add(reference);
        }
        claimId(definition, name, home);
      }
    };

    const judgeCollections = (definitions: readonly RegistryDefinitionFact[]): readonly CollectionBody[] => {
      const bodies: CollectionBody[] = [];
      for (const definition of definitions) {
        const name = definitionName(definition.declaration);
        const home = resolveHome(definition, name, DEFINITION_SLOTS.collection);
        if (home === undefined) {
          continue;
        }
        bodies.push({ definition, name, file: definition.declaration.getSourceFile().getFilePath() });
        judgeLifecycle(definition, name, home);
      }
      return bodies;
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile: SourceFile) => {
            if (ctx.relativePath(sourceFile) !== HOST || !Node.isImportDeclaration(node)) {
              return;
            }
            const specifier = node.getModuleSpecifierValue();
            if (specifier.startsWith(FEATURE_DOOR) || specifier.startsWith(ESCAPING_RELATIVE)) {
              hostImports.push(node);
            }
          },
        },
      ],
      visitFile: (sourceFile) => {
        if (ctx.relativePath(sourceFile) === HOST) {
          hosts.add(HOST);
        }
      },
      evaluate: () => {
        const groups = ctx.fact(registryDefinitionFacts["config-group"]);
        const collections = ctx.fact(registryDefinitionFacts.collection);
        ctx.receipt({ kind: "population", source: groups.source, members: groups.definitions.length, unresolved: 0 });
        ctx.receipt({ kind: "population", source: collections.source, members: collections.definitions.length, unresolved: 0 });
        ctx.receipt({ kind: "population", source: HOST_POPULATION, members: hosts.size, unresolved: 0 });
        const referenced = new Set<string>();
        judgeGroups(groups.definitions, referenced);
        for (const body of judgeCollections(collections.definitions)) {
          if (!referenced.has(`${body.file}#${body.name}`)) {
            report(
              body.definition.declaration,
              `Orphan collection body: "${body.name}" is co-located and exported but no ConfigGroupDefinition's \`body.collection\` resolves to it.`,
            );
          }
        }
        for (const declaration of hostImports) {
          report(declaration, "The config content host imports a feature's internals instead of reading bodies off the registries.");
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { uiGroup } from "../../../../../ui/src/group-defs.ts";\nexport const xGroup: ConfigGroupDefinition = uiGroup;\n',
        "packages/ui/src/group-defs.ts": 'export const uiGroup = { id: "x" };\n',
      },
      expect: { count: 1, token: "xGroup", messageIncludes: "Definition outside its home" },
      why: "THE HOME READ IS TOTAL, and this row is the one that dies without it: `definition.object` is a RESOLUTION — the shared authored-value reader follows a cross-module const to its real declaration, which is routinely OUTSIDE this policy's `@client` population — and NOT only through a vendor `.d.ts`: an ordinary sibling-package import of a `@orb/ui` const, one hop outside `@client`, reproduces it (audit receipt, docs/reviews/gate-runtime/v-audit-wave2-2026-09-12.md D1). `ctx.relativePath` REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so asking it for a foreign object's home THREW and withheld the WHOLE policy — the exact failure that left `freeze-provenance-write-pairing` reporting nothing on every real-tree run while sitting at 0 conformance failures (2026-09-11, guide §3). The home is now read through `lib/declaration-home.ts`. AGAINST THE UNMODIFIED MODULE THIS ROW REDS AS A TOOL ERROR rather than as a missing finding, and that is not a mis-authored row: the planted out-of-population object makes `evaluate` THROW, which is the real-tree failure reproduced inside conformance. Membership in `ctx.files` is NOT the alternative — policy-pass.ts:316 intersects it with a scoped run's requested paths, so that spelling reads silently clean under every `--scope`",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/not-a-group-file.ts":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nexport const xGroup: ConfigGroupDefinition = { id: "x" };\n',
      },
      expect: { count: 1, token: "xGroup", messageIncludes: "Not co-located" },
      why: "a ConfigGroupDefinition outside a `*-group` file — the co-location arm",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/not-a-collection-file.ts":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const strayCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined } };\n',
      },
      expect: { count: 1, token: "strayCollection", messageIncludes: "Not co-located" },
      why: "a CollectionContribution outside a `*-collection` file — the body co-location arm folded in from the retired collection gate",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/a/lib/a-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nexport const aGroup: ConfigGroupDefinition = { id: "dup" };\n',
        "packages/client/src/features/b/lib/b-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nexport const bGroup: ConfigGroupDefinition = { id: "dup" };\n',
      },
      expect: { count: 1, token: "bGroup", messageIncludes: "Duplicate id" },
      why: "two co-located groups declaring the SAME id — the shadow-def duplicate-id arm, reported on the SECOND claimant so the first stays the owner of the id",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const xCollection: CollectionContribution = { create: () => null };\n',
        "packages/client/src/features/x/lib/x-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { xCollection } from "./x-collection.tsx";\nexport const xGroup: ConfigGroupDefinition = { id: "x", body: { collection: xCollection } };\n',
      },
      expect: { count: 1, token: "xCollection", messageIncludes: "lifecycle is not data" },
      why: "a RENDERED `create` — the host draws the affordance in its own chrome grammar, so a body that renders one puts a second create grammar in the LIST",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const xCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined }, importFile: { label: "Import", useRun: () => () => undefined } };\n',
        "packages/client/src/features/x/lib/x-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { xCollection } from "./x-collection.tsx";\nexport const xGroup: ConfigGroupDefinition = { id: "x", body: { collection: xCollection } };\n',
      },
      expect: { count: 1, token: "xCollection", messageIncludes: "importFile" },
      why: "a declared `importFile` with no literal `accept` — the file-picker filter is the body's own fact and the host cannot guess it (R2WI, D121-D)",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const xCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined } };\n',
      },
      expect: { count: 1, token: "xCollection", messageIncludes: "Orphan collection body" },
      why: "a co-located, exported collection no group registers — dead wire that reads as a shipped library, and knip-invisible because the front door re-exports it",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const xCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined } };\n',
        "packages/client/src/features/x/lib/decoy.ts": "export const xCollection = { create: null };\n",
        "packages/client/src/features/x/lib/x-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { xCollection } from "./decoy.ts";\nexport const xGroup: ConfigGroupDefinition = { id: "x", body: { collection: xCollection } };\n',
      },
      expect: { count: 1, token: "xCollection", messageIncludes: "Orphan collection body" },
      why: "THE COUNTERFACTUAL: the group's `body.collection` names the right WORD but resolves to a DIFFERENT module's export, so the real library is still unregistered. A name comparison called this registered",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        [HOST]: 'import { Panel } from "#features/persona";\nexport const ConfigContentSurface = (): unknown => Panel;\n',
      },
      expect: { count: 1, token: "import", messageIncludes: "imports a feature's internals" },
      why: "the config content host mounting a feature's front door instead of reading its body off the registries — the de-god's whole point",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { ...PRELUDE },
      why: "the sanctioned shape: one co-located group registering one co-located collection whose `create` is host-drawable data",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\nexport const xCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined }, importFile: { label: "Import", accept: ".json", useRun: () => () => undefined } };\n',
        "packages/client/src/features/x/lib/x-group.tsx":
          'import type { ConfigGroupDefinition } from "../../../state/config-group-registry.ts";\nimport { xCollection as library } from "./x-collection.tsx";\nexport const xGroup: ConfigGroupDefinition = { id: "x", body: { collection: library } };\n',
      },
      why: "the ALIASED registration: the group imports the collection under another local name and still registers it, because the reference is RESOLVED rather than compared as a word — and the complete importFile data passes",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        [HOST]:
          'import type { ConfigGroupRegistry } from "#state";\nimport { ConfigGroupPlaceholder } from "../components/config-group-placeholder.tsx";\nexport const ConfigContentSurface = (groups: ConfigGroupRegistry): unknown => [groups, ConfigGroupPlaceholder];\n',
        "packages/client/src/features/config/components/config-group-placeholder.tsx": "export const ConfigGroupPlaceholder = (): null => null;\n",
      },
      why: "the host reading bodies off the registry alias and mounting its OWN feature's components with one `..` hop — the live shape. Only a two-hop relative path leaves features/config for a sibling feature's internals",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-group.tsx":
          'interface ConfigGroupDefinition {\n  readonly id: string;\n}\nexport const shadowGroup: ConfigGroupDefinition = { id: "base" };\n',
      },
      why: "THE COUNTERFACTUAL: a LOCAL type sharing the ConfigGroupDefinition name is not a config group, so it neither collides with the real group's id nor enters the denominator",
    },
    {
      mode: "types",
      files: {
        ...PRELUDE,
        "packages/client/src/features/x/lib/x-collection.tsx":
          'import type { CollectionContribution } from "../../../lib/collection-contracts.ts";\n' +
          "// @orb-waive config-group-completeness(xCollection): pinned identity arm; ends when a group registers this body.\n" +
          'export const xCollection: CollectionContribution = { create: { label: "New x", useRun: () => () => undefined } };\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the `Orphan collection body` mustFlag row, which produces EXACTLY ONE finding, waived at the position this policy reports — the declared name `xCollection`, not `body.collection` where the registration is missing",
    },
  ],
});
