// Gate: persist-partialize-and-total-migrate (UI-Gates-and-Lessons.md §11.5, UI-Primitives-and-Reuse.md
// §13.1/§13.3). Zustand `persist()` is partly IRREVERSIBLE — once a stale blob is in localStorage you
// can't migrate from a version line never shipped, so every persist must route through one of the two
// minting factories that bake `partialize` + `version` + a TOTAL crash-proof `migrate`. ARM A: a bare
// `persist(` call outside the two factories is RED. ARM B: inside each factory, the options object must carry `version`/`partialize`/`migrate`.
import type { CallExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

/** A NODE-anchored hit — never a `{file,line,message}` Finding literal (finding-overload-provenance): the
 *  call node carries its own position, and `token` is the arm label the gate already used. */
interface Hit {
  readonly node: CallExpression;
  readonly token: string;
}

const CLIENT_SRC = "/packages/client/src/";

/** The two persist-minting factories — the ONLY sanctioned `persist(` call sites. */
const FACTORY_FILES = new Set(["packages/client/src/state/create-persisted-store.ts", "packages/client/src/state/create-entity-draft-store.ts"]);

/** The keys a persist options object MUST carry (the irreversibility guard). */
const REQUIRED_KEYS = ["version", "partialize", "migrate"] as const;

const RAW_PERSIST_MESSAGE =
  "raw zustand persist() outside the two minting factories — persistence footguns (partialize / " +
  "version + total-migrate / storage-key uniqueness) are baked into createPersistedStore / " +
  "createEntityDraftStore; use one, never a bare persist (UI-Gates-and-Lessons.md §11.5).";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

/** Every `persist(...)` call whose callee is the bare `persist` identifier (the zustand middleware). */
function persistCalls(sf: SourceFile): CallExpression[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const callee = call.getExpression();
    return Node.isIdentifier(callee) && callee.getText() === "persist";
  });
}

/** ARM A — a bare `persist(` outside the factories. */
function rawPersistHits(sf: SourceFile): Hit[] {
  return persistCalls(sf).map((call) => ({ node: call, token: "raw persist()" }));
}

/** ARM B — the factory's persist options object carries version + partialize + migrate. */
function factoryOptionHits(sf: SourceFile): Hit[] {
  const out: Hit[] = [];
  for (const call of persistCalls(sf)) {
    const opts = call.getArguments()[1];
    if (opts === undefined || !Node.isObjectLiteralExpression(opts)) {
      continue;
    }
    for (const key of REQUIRED_KEYS) {
      if (opts.getProperty(key) === undefined) {
        out.push({ node: call, token: `persist opts missing ${key}` });
      }
    }
  }
  return out;
}

// Two arms, per-FILE dispatch: a factory file runs ARM B (its persist options must carry version +
// partialize + migrate), every other client file runs ARM A (a bare `persist(` is RED).
export const gate: GateDescriptor = {
  name: "persist-partialize-and-total-migrate",
  docRow: "UI-Gates-and-Lessons.md §11.5 (UI-Primitives-and-Reuse.md §13.1/§13.3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: RAW_PERSIST_MESSAGE,
  fix: "use createPersistedStore / createEntityDraftStore (which bake partialize + version + a total crash-proof migrate) — never a bare persist().",
  scanRoot: (p) => p.includes("packages/client/src/"),
  visitFile: (sf, ctx: GateRunCtx) => {
    const rel = clientRel(sf.getFilePath());
    if (rel === undefined) {
      return;
    }
    const hits = FACTORY_FILES.has(rel) ? factoryOptionHits(sf) : rawPersistHits(sf);
    for (const hit of hits) {
      ctx.report(hit.node, { token: hit.token, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const s = persist(() => ({}), {});\n",
      at: "packages/client/src/features/x/store.ts",
      expect: { token: "raw persist()" },
      why: "a bare persist() outside the two minting factories — persistence footguns aren't baked in (§11.5)",
    },
    {
      files: "export const s = persist(() => ({}), { version: 1 });\n",
      at: "packages/client/src/state/create-persisted-store.ts",
      expect: { count: 2, token: "persist opts missing partialize" },
      why: "ARM B — the factory's persist options object is missing `partialize`/`migrate` (only version present)",
    },
  ],
  mustPass: [
    {
      files: "export const s = createPersistedStore('x', () => ({}));\n",
      at: "packages/client/src/features/x/store2.ts",
      why: "a factory mint (createPersistedStore) — no bare persist, the sanctioned door, passes",
    },
  ],
};
