// Gate: collection-registry-completeness (docs/design/config-rail-spec.md §3 · the F-8 stickler review §7.2) — the
// COLLECTION seam's structural walls tsc cannot see. Like home-tiles there is no total door `Record` to lean
// on: a collection is an open contribution, so EVERY wall here is this gate's. Five arms:
// (1) CO-LOCATION — a `CollectionContribution` lives only in `features/<owner>/lib/<name>-collection.tsx`;
// (2) DUPLICATE ID — two co-located collections claiming one kind (the runtime throw's static twin, and it
//     names both owners); (3) CREATE-IS-DATA — `create` is `{label, useRun}`, never a rendered node: the
//     HOST draws the affordance, the contribution only declares it; (4) ANTI-GOD-MAP — a second
//     `"config-collections"` assembly outside the door; (5) ORPHAN-DEF (review F-B, the arm the home-tile
//     gate lacks) — a co-located, exported collection ABSENT from the door array, which would otherwise ship
//     gate-green and knip-invisible.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located collection definition file: `features/<owner>/lib/<name>-collection.{ts,tsx}`. */
const COLLECTION_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-collection\.tsx?$/;
/** The ONE sanctioned assembly home (the composition root, G8). */
const DOOR_RE = /\/packages\/client\/src\/(?:main\.tsx|compose\/)/;
const DOOR_REL = "packages/client/src/main.tsx";
const REGISTRY_NAME = "config-collections";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

type Seen = { readonly name: string; readonly file: string };
/** Where a co-located definition is declared — the ORPHAN arm's anchor. */
type DefSite = { readonly file: string; readonly line: number };

type CollectionDef = {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly init: ObjectLiteralExpression;
};

/** The uniqueness arm: records `id` against its first owner, reporting the SECOND claimant. */
function checkUniqueId(def: CollectionDef, out: Violation[], seenIds: Map<string, Seen>): void {
  const idNode = objProp(def.init, "id");
  const id = idNode === undefined ? undefined : readStringValue(idNode);
  if (id === undefined) {
    return;
  }
  const firstOwner = seenIds.get(id);
  if (firstOwner === undefined) {
    seenIds.set(id, { name: def.name, file: rel(def.path) });
    return;
  }
  out.push({
    file: rel(def.path),
    line: def.line,
    message:
      `collection "${def.name}" declares kind "${id}", already claimed by "${firstOwner.name}" (${firstOwner.file}) — ` +
      "two collections for one kind is a shadow contribution the selection store cannot route — docs/design/config-rail-spec.md §3.",
  });
}

/** The create-is-DATA arm: the host renders the affordance, so the contribution declares `{label, useRun}`
 *  and never a node. A rendered `create` would put a second create grammar in the roster. */
function checkCreateIsData(def: CollectionDef, out: Violation[]): void {
  const create = objProp(def.init, "create");
  if (create === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}" declares no \`create\` — a library you cannot add to is not a library, and the host renders the verb from this data — docs/design/config-rail-spec.md §3.`,
    });
    return;
  }
  const unwrapped = unwrapExpression(create);
  if (!Node.isObjectLiteralExpression(unwrapped)) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create\` is not a data literal — the HOST draws the create affordance in its own chrome grammar; a contribution declares \`{label, useRun}\` — docs/design/config-rail-spec.md §3.`,
    });
    return;
  }
  const labelNode = objProp(unwrapped, "label");
  const label = labelNode === undefined ? undefined : readStringValue(labelNode);
  if (label === undefined || label.length === 0) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create.label\` is not a non-empty string literal — it IS the affordance's accessible name ("New tag"), so it cannot be computed at the host — docs/design/config-rail-spec.md §3.`,
    });
  }
  if (objProp(unwrapped, "useRun") === undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message: `collection "${def.name}"'s \`create\` has no \`useRun\` — the runner is a HOOK (a definition is a module value; a bare function can never reach the owner's mutation) — docs/design/config-rail-spec.md §3.`,
    });
  }
}

function checkCollectionDefs(sf: SourceFile, out: Violation[], seenIds: Map<string, Seen>, defSites: Map<string, DefSite>): void {
  const path = sf.getFilePath();
  const coLocated = COLLECTION_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("CollectionContribution")) {
      continue;
    }
    const line = decl.getStartLineNumber();
    if (!coLocated) {
      out.push({
        file: rel(path),
        line,
        message:
          `CollectionContribution "${decl.getName()}" is not co-located — a collection lives only in its OWNING feature's ` +
          "lib collection file (features/*/lib/*-collection.tsx; the gate keys on location, never on name) — docs/design/config-rail-spec.md §3.",
      });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    const def: CollectionDef = { name: decl.getName(), path, line, init };
    defSites.set(def.name, { file: rel(path), line });
    checkUniqueId(def, out, seenIds);
    checkCreateIsData(def, out);
  }
}

/** Every `createContributorRegistry("config-collections", […])` call — the door's, and any impostor's. */
function forEachAssembly(sf: SourceFile, visit: (call: Node, args: readonly Node[]) => void): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "createContributorRegistry") {
      continue;
    }
    const args = call.getArguments();
    const [nameArg] = args;
    if (nameArg !== undefined && readStringValue(nameArg) === REGISTRY_NAME) {
      visit(call, args);
    }
  }
}

/** The anti-god-map arm: a `config-collections` assembly outside the composition root. */
function checkAssembly(sf: SourceFile, out: Violation[]): void {
  const path = sf.getFilePath();
  if (DOOR_RE.test(path)) {
    return;
  }
  forEachAssembly(sf, (call) => {
    out.push({
      file: rel(path),
      line: call.getStartLineNumber(),
      message:
        `a second "${REGISTRY_NAME}" assembly outside the composition root — collections are assembled ONCE at the main.tsx door ` +
        "(G8), so the config host consumes them blind and a feature can never register by importing the host — docs/design/config-rail-spec.md §3.",
    });
  });
}

/** The identifiers the door's array registers (its own array members, by name). */
function doorRegistered(sf: SourceFile): Set<string> {
  const names = new Set<string>();
  forEachAssembly(sf, (_call, args) => {
    const list = args[1] === undefined ? undefined : unwrapExpression(args[1]);
    if (list === undefined || !Node.isArrayLiteralExpression(list)) {
      return;
    }
    for (const element of list.getElements()) {
      const member = unwrapExpression(element);
      if (Node.isIdentifier(member)) {
        names.add(member.getText());
      }
    }
  });
  return names;
}

/** The ORPHAN arm: a co-located, exported collection the door never registers. It runs only against the
 *  REAL door (a synthetic mini-project has no main.tsx, and a `scope.kind` guard would fire inside the
 *  gate's own conformance run — GATE-AUTHORING §4 rule 5). */
function checkOrphans(ctx: GateRunCtx, defSites: ReadonlyMap<string, DefSite>, out: Violation[]): void {
  const door = ctx.project.getSourceFile(`${ctx.root}/${DOOR_REL}`);
  if (!fileLoaded(ctx, DOOR_REL) || door === undefined) {
    return;
  }
  const registered = doorRegistered(door);
  for (const [name, site] of defSites) {
    if (!registered.has(name)) {
      out.push({
        file: site.file,
        line: site.line,
        message:
          `collection "${name}" is co-located and exported but ABSENT from the "${REGISTRY_NAME}" door array — an unregistered ` +
          "collection is dead wire that reads as a shipped library. Register it at main.tsx, or delete it — docs/design/config-rail-spec.md §3.",
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "collection-registry-completeness",
  docRow: "docs/design/config-rail-spec.md §3",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a config collection is dishonest: a CollectionContribution not co-located in its feature's lib collection file, a duplicate collection kind, a `create` that is not `{label, useRun}` data, a second `config-collections` assembly outside the door, or a co-located collection nobody registers — docs/design/config-rail-spec.md §3.",
  fix: "co-locate the collection at features/<owner>/lib/<name>-collection.tsx; declare `create: { label: \"New …\", useRun }`; assemble collections ONCE at main.tsx and register the def there (an unregistered collection is dead wire).",
  run: (ctx) => {
    const out: Violation[] = [];
    const seenIds = new Map<string, Seen>();
    const defSites = new Map<string, DefSite>();
    for (const sf of ctx.project.getSourceFiles()) {
      if (sf.getFilePath().includes(CLIENT_SRC)) {
        checkCollectionDefs(sf, out, seenIds, defSites);
        checkAssembly(sf, out);
      }
    }
    checkOrphans(ctx, defSites, out);
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: "export const strayCollection: CollectionContribution = { id: 'x', create: { label: 'New x', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/not-a-collection-file.ts",
      expect: { messageIncludes: "not co-located" },
      why: "a CollectionContribution outside a `*-collection` file — the co-location arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-collection.tsx": "export const aCollection: CollectionContribution = { id: 'dup', create: { label: 'New a', useRun: () => () => undefined } };\n",
        "packages/client/src/features/b/lib/b-collection.tsx": "export const bCollection: CollectionContribution = { id: 'dup', create: { label: 'New b', useRun: () => () => undefined } };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located collections claiming one KIND — the shadow-contribution arm",
    },
    {
      files: "export const xCollection: CollectionContribution = { id: 'x' };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "declares no `create`" },
      why: "a library with no create verb — the create-is-data arm's absence half",
    },
    {
      files: "export const xCollection: CollectionContribution = { id: 'x', create: <NewXButton /> };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "not a data literal" },
      why: "a create affordance RENDERED by the contribution — the host owns that chrome",
    },
    {
      files: "export const xCollection: CollectionContribution = { id: 'x', create: { label: '', useRun: () => () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "create.label" },
      why: "an empty accessible name for the create affordance",
    },
    {
      files: "export const xCollection: CollectionContribution = { id: 'x', create: { label: 'New x', run: () => undefined } };\n",
      at: "packages/client/src/features/x/lib/x-collection.tsx",
      expect: { messageIncludes: "no `useRun`" },
      why: "a bare `run` that can never reach the owner's mutation — the hook-runner arm",
    },
    {
      files: "export const collections = createContributorRegistry('config-collections', []);\n",
      at: "packages/client/src/features/config/lib/compose-collections.ts",
      expect: { messageIncludes: "second" },
      why: "a config-collections assembly outside the composition root — the anti-god-map arm",
    },
  ],
  mustPass: [
    {
      files: "export const tagCollection: CollectionContribution = { id: 'tags', create: { label: 'New tag', useRun: useCreateTagMember } };\n",
      at: "packages/client/src/features/tag/lib/tag-collection.tsx",
      why: "a FULL co-located collection with a data create verb — passes (the ORPHAN arm needs the real door, absent here)",
    },
    {
      files: "export const collections = createContributorRegistry('config-collections', [tagCollection]);\n",
      at: "packages/client/src/main.tsx",
      why: "the ONE assembly, at the composition root — passes",
    },
  ],
};
