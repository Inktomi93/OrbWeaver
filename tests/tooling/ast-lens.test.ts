// Self-test for the `pnpm ast` unwired + clientgap lenses (scripts/codemods/ast.ts). Drives the pure
// enumeration substrate over a tiny synthetic project — a server router with one WIRED and one UNWIRED
// procedure, a client that consumes the wired one via both idioms (proxy chain + `Trpc[…]` inference) —
// and asserts the diff flags EXACTLY the unwired procedure (bite-proof, not a sketch).

import { Project } from "ts-morph";
import { describe } from "vitest";
import { buildLiveness, collectClientConsumed, collectServerProcedures, isUnwiredExempt } from "../../scripts/codemods/ast.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = "/repo";

/** An in-memory workspace holding `files` (repo-relative path → source), rooted at ROOT. */
function projectOf(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

// A server surface: `worldInfo` (namespaced sub-router) with a WIRED `listBooks` + an UNWIRED
// `orphanVerb`; plus a loose root `health` proc. The client wires only `listBooks`.
const SERVER_ROUTER = `
export const worldInfoRouter = t.router({
  listBooks: authedProcedure.query(() => []),
  orphanVerb: authedProcedure.mutation(() => null),
});
`;

const APP_ROUTER = `
import { worldInfoRouter } from "./routers/world-info";
export const appRouter = t.router({
  health: publicProcedure.query(() => ({ ok: true })),
  worldInfo: worldInfoRouter,
});
`;

// The client consumes worldInfo.listBooks two ways: the proxy chain and the type-level indexed access.
const CLIENT_CONSUMER = `
import type { Trpc } from "../../data/trpc";
type Books = Trpc["worldInfo"]["listBooks"];
export function useBooks(trpc: Trpc) {
  return trpc.worldInfo.listBooks.queryOptions({});
}
`;

const SERVER_FILES = {
  "packages/server/src/transport/trpc/routers/world-info.ts": SERVER_ROUTER,
  "packages/server/src/transport/trpc/router.ts": APP_ROUTER,
};

const byString = (a: string, b: string): number => a.localeCompare(b);

describe("ast unwired lens", () => {
  test("flags EXACTLY the procedure no client consumes", () => {
    const project = projectOf({
      ...SERVER_FILES,
      "packages/client/src/features/world/use-books.ts": CLIENT_CONSUMER,
    });

    const procs = collectServerProcedures(project);
    const names = procs.map((p) => p.full).sort(byString);
    // Every server proc enumerated with correct namespacing (loose root proc keyed bare).
    expect(names).toEqual(["health", "worldInfo.listBooks", "worldInfo.orphanVerb"]);

    const valid = new Set(names);
    const consumed = collectClientConsumed(project, valid);
    // The client wired listBooks (proxy chain + Trpc[…]) — and nothing else.
    expect(consumed.has("worldInfo.listBooks")).toBe(true);

    const unwired = procs
      .filter((p) => !consumed.has(p.full))
      .map((p) => p.full)
      .sort(byString);
    // orphanVerb + the loose health proc are unwired; listBooks is NOT reported.
    expect(unwired).toContain("worldInfo.orphanVerb");
    expect(unwired).not.toContain("worldInfo.listBooks");
  });

  test("does not count a same-name proc in a DIFFERENT namespace as consumed (no bare-name merge)", () => {
    // The client consumes `worldInfo.listBooks`; a `chat.listBooks` (fictional) must stay unwired — the
    // lens keys on `<ns>.<proc>`, never the bare tail.
    const project = projectOf({
      "packages/server/src/transport/trpc/routers/world-info.ts": SERVER_ROUTER,
      "packages/server/src/transport/trpc/routers/chat.ts": "export const chatRouter = t.router({ listBooks: authedProcedure.query(() => []) });",
      "packages/server/src/transport/trpc/router.ts": `
        import { worldInfoRouter } from "./routers/world-info";
        import { chatRouter } from "./routers/chat";
        export const appRouter = t.router({ worldInfo: worldInfoRouter, chat: chatRouter });
      `,
      "packages/client/src/features/world/use-books.ts": CLIENT_CONSUMER,
    });
    const procs = collectServerProcedures(project);
    const valid = new Set(procs.map((p) => p.full));
    const consumed = collectClientConsumed(project, valid);
    expect(consumed.has("worldInfo.listBooks")).toBe(true);
    expect(consumed.has("chat.listBooks")).toBe(false);
  });

  test("a `@server-only:` or `@test-fixture:` reason filters an otherwise-unwired procedure; a bare marker does not", () => {
    const project = projectOf({
      "packages/server/src/transport/trpc/routers/world-info.ts": `
export const worldInfoRouter = t.router({
  listBooks: authedProcedure.query(() => []),
  // @server-only: break-glass admin KV — no client panel exists by design.
  serverOnlyVerb: authedProcedure.mutation(() => null),
  // @test-fixture: the CT typed-read template — a test's only consumer, on purpose.
  fixtureVerb: authedProcedure.mutation(() => null),
  // A bare marker with no reason after the colon is NOT a legal exemption — it stays reported.
  // @server-only:
  unreasonedOrphan: authedProcedure.mutation(() => null),
  // An unmarked unwired proc is reported.
  plainOrphan: authedProcedure.mutation(() => null),
});
`,
      "packages/server/src/transport/trpc/router.ts": APP_ROUTER,
      "packages/client/src/features/world/use-books.ts": CLIENT_CONSUMER,
    });

    const procs = collectServerProcedures(project);
    const declOf = (full: string): Parameters<typeof isUnwiredExempt>[0] => {
      const proc = procs.find((p) => p.full === full);
      expect(proc).toBeDefined();
      return proc?.decl as Parameters<typeof isUnwiredExempt>[0];
    };
    // Both honest markers exempt; a bare marker and an unmarked proc do not.
    expect(isUnwiredExempt(declOf("worldInfo.serverOnlyVerb"))).toBe(true);
    expect(isUnwiredExempt(declOf("worldInfo.fixtureVerb"))).toBe(true);
    expect(isUnwiredExempt(declOf("worldInfo.unreasonedOrphan"))).toBe(false);
    expect(isUnwiredExempt(declOf("worldInfo.plainOrphan"))).toBe(false);
  });
});

describe("ast clientgap lens (liveness split)", () => {
  test("splits prod consumption into client vs server buckets by importing package", () => {
    const project = projectOf({
      // A contract with two client-facing shapes: one the CLIENT imports, one only the SERVER imports.
      "packages/contracts/src/thing/index.ts": `
        export interface WiredView { id: string; }
        export interface OrphanView { id: string; }
      `,
      // Relative specifiers so the in-memory project resolves them without @orb/* path mapping.
      "packages/client/src/features/thing/panel.ts":
        'import type { WiredView } from "../../../../contracts/src/thing/index"; export const x: WiredView | null = null;',
      "packages/server/src/domain/thing/service.ts":
        'import type { OrphanView } from "../../../../contracts/src/thing/index"; export const y: OrphanView | null = null;',
    });

    const live = buildLiveness(project);
    // originKey is `<declFile><NUL><name>` — match by name suffix + file substring to stay separator-agnostic.
    const has = (bucket: Set<string>, name: string): boolean => [...bucket].some((k) => k.endsWith(name) && k.includes("/thing/index.ts"));

    // WiredView is client-consumed (positive: NOT a gap); OrphanView is server-only (the clientgap hit).
    expect(has(live.usedClientProd, "WiredView")).toBe(true);
    expect(has(live.usedServerProd, "OrphanView")).toBe(true);
    expect(has(live.usedClientProd, "OrphanView")).toBe(false);
    // The union stays correct for orphans/testonly/prodonly (both live in usedProd).
    expect(has(live.usedProd, "WiredView")).toBe(true);
    expect(has(live.usedProd, "OrphanView")).toBe(true);
  });
});
