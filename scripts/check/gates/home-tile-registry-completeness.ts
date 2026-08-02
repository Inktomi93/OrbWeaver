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
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

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
  readonly line: number;
  readonly init: ObjectLiteralExpression;
};

function checkDormantArm(def: TileDef, doorway: ObjectLiteralExpression, out: Violation[]): void {
  for (const field of ["reason", "teaser"] as const) {
    const value = doorwayField(doorway, field);
    if (value === undefined || value.length === 0) {
      out.push({
        file: rel(def.path),
        line: def.line,
        message:
          `dormant home tile "${def.name}" has an empty \`${field}\` — a doorway earns its pixels by naming what must ` +
          "land first (`reason`) AND what the thing will be (`teaser`); without both it is an IOU — docs/history/design/home-section-spec.md §3.5.",
      });
    }
  }
  if (objProp(def.init, "action") !== undefined) {
    out.push({
      file: rel(def.path),
      line: def.line,
      message:
        `dormant home tile "${def.name}" also declares an \`action\` — a DOORWAY has no controls (no button, no ` +
        "skeleton, no spinner); a tile with both is a fake feature wearing a Dormant badge — docs/history/design/home-section-spec.md §3.5.",
    });
  }
}

/** The uniqueness arm: records `id` against its first owner, reporting the SECOND claimant. */
function checkUniqueId(def: TileDef, out: Violation[], seenIds: Map<string, Seen>): void {
  const id = tileId(def.init);
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
      `home tile "${def.name}" declares id "${id}", already claimed by "${firstOwner.name}" (${firstOwner.file}) — ` +
      "two tiles for one id is a shadow contribution that rots green while edits land in the dead twin — docs/history/design/home-section-spec.md §7.",
  });
}

function checkTileDefs(sf: SourceFile, out: Violation[], seenIds: Map<string, Seen>): void {
  const path = sf.getFilePath();
  const coLocated = TILE_FILE_RE.test(path);
  for (const decl of sf.getVariableDeclarations()) {
    const typeNode = decl.getTypeNode();
    if (typeNode === undefined || !typeNode.getText().startsWith("HomeTileContribution")) {
      continue;
    }
    const line = decl.getStartLineNumber();
    if (!coLocated) {
      out.push({
        file: rel(path),
        line,
        message:
          `HomeTileContribution "${decl.getName()}" is not co-located — a home tile lives only in its OWNING feature's ` +
          "lib tile file (features/*/lib/*-tile.tsx; the gate keys on location, never on name) — docs/history/design/home-section-spec.md §7.",
      });
      continue;
    }
    const init = decl.getInitializer();
    if (init === undefined || !Node.isObjectLiteralExpression(init)) {
      continue;
    }
    const def: TileDef = { name: decl.getName(), path, line, init };
    checkUniqueId(def, out, seenIds);
    const doorway = dormantDoorway(init);
    if (doorway !== undefined) {
      checkDormantArm(def, doorway, out);
    }
  }
}

/** The anti-god-map arm: a `home-tiles` assembly outside the composition root. */
function checkAssembly(sf: SourceFile, out: Violation[]): void {
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
      out.push({
        file: rel(path),
        line: call.getStartLineNumber(),
        message:
          'a second "home-tiles" assembly outside the composition root — tiles are assembled ONCE at the main.tsx door ' +
          "(G8), so home consumes them blind and a feature can never register by importing home — docs/history/design/home-section-spec.md §3.2.",
      });
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
    const out: Violation[] = [];
    const seenIds = new Map<string, Seen>();
    for (const sf of ctx.project.getSourceFiles()) {
      if (!sf.getFilePath().includes(CLIENT_SRC)) {
        continue;
      }
      checkTileDefs(sf, out, seenIds);
      checkAssembly(sf, out);
    }
    for (const v of out) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: "export const strayTile: HomeTileContribution = { id: 'x', body: () => null };\n",
      at: "packages/client/src/features/x/lib/not-a-tile-file.ts",
      expect: { messageIncludes: "not co-located" },
      why: "a HomeTileContribution outside a `*-tile` file — the co-location arm",
    },
    {
      files: "export const xTile: HomeTileContribution = { id: 'x', body: { dormant: { reason: '', teaser: 'Soon.' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { messageIncludes: "empty `reason`" },
      why: "a dormant doorway that names nothing that must land first — the tracked-citation arm",
    },
    {
      files: "export const xTile: HomeTileContribution = { id: 'x', body: { dormant: { reason: 'domain/x is absent' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { messageIncludes: "empty `teaser`" },
      why: "a dormant doorway with no user-facing promise — the teaser arm",
    },
    {
      files:
        "export const xTile: HomeTileContribution = { id: 'x', action: null, body: { dormant: { reason: 'domain/x is absent', teaser: 'Soon, and here is what.' } } };\n",
      at: "packages/client/src/features/x/lib/x-tile.tsx",
      expect: { messageIncludes: "also declares an `action`" },
      why: "a doorway wearing a control — the no-fake-feature arm",
    },
    {
      files: {
        "packages/client/src/features/a/lib/a-tile.tsx": "export const aTile: HomeTileContribution = { id: 'dup', body: () => null };\n",
        "packages/client/src/features/b/lib/b-tile.tsx": "export const bTile: HomeTileContribution = { id: 'dup', body: () => null };\n",
      },
      expect: { messageIncludes: "already claimed by" },
      why: "two co-located tiles declaring the SAME id — the shadow-contribution arm",
    },
    {
      files: "export const tiles = createContributorRegistry('home-tiles', []);\n",
      at: "packages/client/src/features/home/lib/compose-tiles.ts",
      expect: { messageIncludes: "second" },
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
