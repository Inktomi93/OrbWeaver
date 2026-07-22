// Gate: assets-single-writer (Core-Enforcement-Deferred-Dropped.md "assets-single-writer" row —
// "only domain/assets writes the assets table + storeBlob (the one CAS coherence site)"; ledger D21
// context) — the invariant is CAS WRITE coherence, not read scoping. `storeBlob` (domain/assets/
// persistence/queries.ts) is the one writer of the blob↔row pair; every insert/update/delete on the
// `assets` table outside domain/assets/** is a bypass of that coherence primitive.
//
// A table-symbol IMPORT seal (the `vector-scope-derived` shape, read+write) was considered and
// REJECTED 2026-07-17 — a 9-domain sweep found standing avatar-resolution `.leftJoin(assets, …)`
// reads in imagery/chat/discovery/search/character/persona (avatarAssetId → assets.id joins) that are
// FK-derived and sanctioned (D18/D20 ownership-derives-through-FK). Sealing reads would fight the
// architecture. So this gate has two WRITE-only arms:
//   1. `storeBlob` imported/called only from domain/assets/**.
//   2. a raw `.insert(assets)` / `.update(assets)` / `.delete(assets)` write outside domain/assets/**.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const SANCTIONED = /\/packages\/server\/src\/domain\/assets\//u;
const WRITE_METHODS = new Set(["insert", "update", "delete"]);

const STOREBLOB_MESSAGE =
  'storeBlob imported outside domain/assets — it is the one writer of the blob↔row pair (the CAS coherence primitive); every asset write goes through it (Core-Enforcement-Deferred-Dropped.md "assets-single-writer").';
const WRITE_MESSAGE =
  'a raw insert/update/delete on the `assets` table outside domain/assets — bypasses storeBlob\'s CAS+row coherence write (Core-Enforcement-Deferred-Dropped.md "assets-single-writer").';

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function reportAt(ctx: GateRunCtx, node: Node, message: string, token: string): void {
  const sf = node.getSourceFile();
  const finding: Finding = {
    file: relPath(ctx.root, sf.getFilePath()),
    line: node.getStartLineNumber(),
    column: sf.getLineAndColumnAtPos(node.getStart()).column,
    message,
    token,
  };
  ctx.report(finding);
}

/** Is this ImportSpecifier `storeBlob` imported from its persistence home (server/kit-reachable path)? */
function storeBlobImport(node: Node): boolean {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return false;
  }
  if (node.getName() !== "storeBlob") {
    return false;
  }
  // storeBlob has exactly one definition site (domain/assets/persistence/queries.ts), reached via a
  // relative import — the name alone disambiguates it from any other symbol.
  return node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== undefined;
}

/** Is this CallExpression a `.insert/.update/.delete(assets)` write? */
function assetsWrite(node: Node): string {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return "";
  }
  const callee = node.getExpression();
  if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return "";
  }
  if (!WRITE_METHODS.has(callee.getName())) {
    return "";
  }
  const [firstArg] = node.getArguments();
  const isAssetsArg = firstArg?.isKind(SyntaxKind.Identifier) && firstArg.getText() === "assets";
  return isAssetsArg ? `.${callee.getName()}(assets)` : "";
}

export const gate: GateDescriptor = {
  name: "assets-single-writer",
  docRow: 'Core-Enforcement-Deferred-Dropped.md "assets-single-writer" row (D21 context)',
  status: "active",
  scopeSafety: "incremental-safe",
  message: STOREBLOB_MESSAGE,
  fix: "route the write through domain/assets' storeBlob (the one CAS+row coherence primitive) instead of importing storeBlob or inserting/updating/deleting the assets table directly.",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    if (SANCTIONED.test(path)) {
      return;
    }
    if (storeBlobImport(node)) {
      reportAt(ctx, node, STOREBLOB_MESSAGE, "storeBlob");
      return;
    }
    const write = assetsWrite(node);
    if (write !== "") {
      reportAt(ctx, node, WRITE_MESSAGE, write);
    }
  },
  mustFlag: [
    {
      files: 'import { storeBlob } from "../assets/persistence/queries.ts";\nexport const s = storeBlob;\n',
      at: "packages/server/src/domain/hub/x.ts",
      expect: { messageIncludes: "storeBlob" },
      why: "storeBlob imported outside domain/assets — the one CAS coherence writer, dodged",
    },
    {
      files: 'import { assets } from "@orb/db";\nexport const w = (db: { insert: (t: unknown) => void }) => db.insert(assets);\n',
      at: "packages/server/src/domain/hub/y.ts",
      expect: { messageIncludes: "bypasses storeBlob" },
      why: "a raw `.insert(assets)` write outside domain/assets — bypasses the CAS+row coherence primitive",
    },
  ],
  mustPass: [
    {
      files:
        'import { assets } from "@orb/db";\nexport async function storeBlob(db: { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } }) {\n  return db.insert(assets).values({});\n}\n',
      at: "packages/server/src/domain/assets/persistence/queries.ts",
      why: "the sanctioned writer itself — storeBlob's own `.insert(assets)` inside domain/assets, passes",
    },
    {
      files:
        'import { characters, assets } from "@orb/db";\nexport const withAvatar = (db: { select: () => { from: (t: unknown) => { leftJoin: (t: unknown, c: unknown) => unknown } } }) =>\n  db.select().from(characters).leftJoin(assets, characters.avatarAssetId === assets.id);\n',
      at: "packages/server/src/domain/character/persistence/queries.ts",
      why: "a FK-derived avatar-resolution `.leftJoin(assets, eq(x.avatarAssetId, assets.id))` read outside domain/assets — reads are sanctioned (D18/D20), only writes are sealed",
    },
  ],
};
