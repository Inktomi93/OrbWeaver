// Gate: home-tile-registry-completeness (docs/history/design/home-section-spec.md §7) — the HOME-TILE seam's structural walls
// tsc can't see. Unlike the section/settings registries there is no total door `Record` to lean on: a tile
// is an open-ended contribution, so EVERY wall here is this gate's. Four arms, mirroring G1's PLANNED set
// one level down:
// (1) CO-LOCATION — a `HomeTileContribution` lives only in `features/<owner>/lib/<name>-tile.{ts,tsx}`;
//     a tile authored anywhere else is a contribution no owner is accountable for;
// (2) DUPLICATE ID — two co-located tiles declaring the same `id`. The registry's own dupe-id throw is a
//     RUNTIME catch at door construction; this is the static one (and it names both owners);
// (3) DORMANT HONESTY (the H7 arm) — a `body: { dormant }` needs a non-empty `reason` AND a non-empty
//     `teaser` (the bus-coverage DEFERRED discipline: a doorway that names nothing is an IOU), and it must
//     NOT also declare an `action` — a doorway has no controls, so a tile carrying both is a fake feature
//     wearing a Dormant badge;
// (4) ANTI-GOD-MAP — a `createContributorRegistry("home-tiles", …)` assembly outside the door. G8 already
//     bans the CALL; this arm catches the shape G8's file allowlist would miss if home ever grew a
//     "compose the tiles here" helper of its own.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const CLIENT_SRC = "/packages/client/src/";
/** A co-located home-tile definition file: `features/<owner>/lib/<name>-tile.{ts,tsx}`. */
const TILE_FILE_RE = /\/features\/[^/]+\/lib\/[^/]+-tile\.tsx?$/;
/** The ONE sanctioned assembly home (the composition root, G8). */
const DOOR_RE = /\/packages\/client\/src\/(?:main\.tsx|compose\/)/;
const HOME_TILE_REGISTRY_NAME = "home-tiles";

function rel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function objProp(obj: ObjectLiteralExpression, name: string): Node | undefined {
  const prop = obj.getProperty(name);
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A tile's declared `id` string literal (through any as/satisfies/paren wrapper), or undefined. */
function tileId(tile: ObjectLiteralExpression): string | undefined {
  const id = objProp(tile, "id");
  return id === undefined ? undefined : readStringValue(id);
}

/** The `body: { dormant: {…} }` doorway literal when the body is the DORMANT arm, else undefined. */
function dormantDoorway(tile: ObjectLiteralExpression): ObjectLiteralExpression | undefined {
  const body = objProp(tile, "body");
  if (body === undefined || !Node.isObjectLiteralExpression(body)) {
    return;
  }
  const dormant = objProp(body, "dormant");
  return dormant !== undefined && Node.isObjectLiteralExpression(dormant) ? dormant : undefined;
}

/** The string value of a doorway field — `""` when present but not a readable literal, undefined when absent. */
function doorwayField(doorway: ObjectLiteralExpression, name: string): string | undefined {
  const value = objProp(doorway, name);
  return value === undefined ? undefined : (readStringValue(value) ?? "");
}

type Seen = { readonly name: string; readonly file: string };

type TileDef = {
  readonly name: string;
  readonly path: string;
  readonly init: ObjectLiteralExpression;
};

// Node-anchored: every arm reports a NODE directly (`ctx.report(node, {token, offset})`), never an
// explicit `Finding` — that overload bypasses `hasGateIgnore` (GATE-AUTHORING.md §1). The per-arm prose
// that used to ride the Finding's `message` field is folded into the gate's ONE `message` below; the
// dynamic identity (field/name/id/prior claimant) moves into `token`.
function checkDormantArm(def: TileDef, doorway: ObjectLiteralExpression, ctx: GateRunCtx): void {
  for (const field of ["reason", "teaser"] as const) {
    const value = doorwayField(doorway, field);
    if (value === undefined || value.length === 0) {
      ctx.report(doorway, { token: `dormant empty ${field} (${def.name})`, offset: 0 });
    }
  }
  if (objProp(def.init, "action") !== undefined) {
    ctx.report(def.init, { token: `dormant with action (${def.name})`, offset: 0 });
  }
}

/** The uniqueness arm: records `id` against its first owner, reporting the SECOND claimant. */
function checkUniqueId(def: TileDef, ctx: GateRunCtx, seenIds: Map<string, Seen>): void {
  const id = tileId(def.init);
  if (id === undefined) {
    return;
  }
  const firstOwner = seenIds.get(id);
  if (firstOwner === undefined) {
    seenIds.set(id, { name: def.name, file: rel(def.path) });
    return;
  }
  ctx.report(def.init, {
    token: `duplicate id "${id}" (${def.name}) — first claimed by "${firstOwner.name}" (${firstOwner.file})`,
    offset: 0,
  });
}

function checkTileDefs(sf: SourceFile, ctx: GateRunCtx, seenIds: Map<string, Seen>): void {
  const path = sf.getFilePath();
  const coLocated = TILE_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("HomeTileContribution")) {
      continue;
    }
    if (!coLocated) {
      ctx.report(decl, { token: `not co-located: ${decl.getName()}`, offset: 0 });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    const def: TileDef = { name: decl.getName(), path, init };
    checkUniqueId(def, ctx, seenIds);
    const doorway = dormantDoorway(init);
    if (doorway !== undefined) {
      checkDormantArm(def, doorway, ctx);
    }
  }
}

/** The anti-god-map arm: a `home-tiles` assembly outside the composition root. */
function checkAssembly(sf: SourceFile, ctx: GateRunCtx): void {
  const path = sf.getFilePath();
  if (DOOR_RE.test(path)) {
    return;
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "createContributorRegistry") {
      continue;
    }
    const [nameArg] = call.getArguments();
    if (nameArg !== undefined && readStringValue(nameArg) === HOME_TILE_REGISTRY_NAME) {
      ctx.report(call, { token: "second home-tiles assembly", offset: 0 });
    }
  }
}

export const gate: GateDescriptor = {
  name: "home-tile-registry-completeness",
  docRow: "docs/history/design/home-section-spec.md §7",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a home tile is dishonest: a HomeTileContribution not co-located in its feature's lib tile file, a duplicate tile id, a DORMANT doorway with an empty reason/teaser or one that also declares an action, or a second `home-tiles` assembly outside the door — docs/history/design/home-section-spec.md §7.",
  fix: "co-locate the tile in features/<owner>/lib/<name>-tile.tsx; give a dormant doorway a real reason AND teaser and no action (a doorway has no controls); assemble tiles ONCE at main.tsx.",
  run: (ctx) => {
    const seenIds = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      if (!sf.getFilePath().includes(CLIENT_SRC)) {
        continue;
      }
      checkTileDefs(sf, ctx, seenIds);
      checkAssembly(sf, ctx);
    }
  },
  mustFlag: [
    {
      files: "export const strayTile: HomeTileContribution = { id: 'x', body: () => null };\n",
      at: "packages/client/src/features/x/lib/not-a-tile-file.ts",
      expect: { token: "not co-located: strayTile" },
      why: "a HomeTileContribution outside a `*-tile` file — the co-location arm",
    },
    {
      files: "export const xTile: HomeTileContribution = { id: 'x', body: { dormant: { reason: '', teaser: 'Soon.' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { token: "dormant empty reason (xTile)" },
      why: "a dormant doorway that names nothing that must land first — the tracked-citation arm",
    },
    {
      files: "export const xTile: HomeTileContribution = { id: 'x', body: { dormant: { reason: 'domain/x is absent' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { token: "dormant empty teaser (xTile)" },
      why: "a dormant doorway with no user-facing promise — the teaser arm",
    },
    {
      files:
        "export const xTile: HomeTileContribution = { id: 'x', action: null, body: { dormant: { reason: 'domain/x is absent', teaser: 'Soon, and here is what.' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { token: "dormant with action (xTile)" },
      why: "a doorway wearing a control — the no-fake-feature arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-tile.tsx": "export const aTile: HomeTileContribution = { id: 'dup', body: () => null };\n",
        "packages/client/src/features/b/lib/b-tile.tsx": "export const bTile: HomeTileContribution = { id: 'dup', body: () => null };\n",
      },
      expect: { token: 'duplicate id "dup" (bTile) — first claimed by "aTile" (packages/client/src/features/a/lib/a-tile.tsx)' },
      why: "two co-located tiles declaring the SAME id — the shadow-contribution arm",
    },
    {
      files: "export const tiles = createContributorRegistry('home-tiles', []);\n",
      at: "packages/client/src/features/home/lib/compose-tiles.ts",
      expect: { token: "second home-tiles assembly" },
      why: "a home-tiles assembly outside the composition root — the anti-god-map arm",
    },
  ],
  mustPass: [
    {
      files: "export const chatRecentsTile: HomeTileContribution = { id: 'chat.recents', action: null, body: () => null };\n",
      at: "packages/client/src/features/chat/lib/home-recents-tile.tsx",
      why: "a FULL co-located tile with a real body and a trailing action — passes",
    },
    {
      files:
        "export const buddyDormantTile: HomeTileContribution = { id: 'buddy', body: { dormant: { reason: 'domain/buddy is not in the retro tree', teaser: 'Your companion.' } } };\n",
      at: "packages/client/src/features/home/lib/buddy-tile.tsx",
      why: "an honest DORMANT doorway — a real reason, a real teaser, no controls — passes",
    },
    {
      files: "export const tiles = createContributorRegistry('home-tiles', []);\n",
      at: "packages/client/src/main.tsx",
      why: "the ONE assembly, at the composition root — passes",
    },
  ],
};
