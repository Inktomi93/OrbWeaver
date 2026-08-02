// Self-test for the `pnpm ast` rot lenses (scripts/codemods/ast.ts) — unwired, clientgap, the orphan
// substrate, swallowed, respell, typeonly-alive, columns, regkeys, and chains. Each drives the pure
// enumeration substrate over a tiny synthetic project (a server router with one WIRED and one UNWIRED
// procedure; a namespace-swallowed schema barrel; a derived-vs-hand-spelled contract pair; a value export
// reached only from type positions; a miniature drizzle schema with one column per consumption class; a
// 3-link dead chain) and asserts the lens flags EXACTLY the defect shape — bite-proof in both directions,
// never a sketch.
//
// ONE SUITE HERE IS A GATE GUARD, NOT A LENS TEST: "ast liveness edge map (parallel + opt-in)". The
// declaration-granular edge `chains` needs was added to `buildLiveness`, which the PUSH-tier
// `deps:orphan-ratchet` also reads — so that suite pins the six liveness sets identical with the edge flag
// off and on. Perturbing them is a GATE regression, not a lens change. Do not weaken it.

import { Project } from "ts-morph";
import { describe } from "vitest";
import type { ChainCandidate, Liveness, SwallowedCandidate } from "../../scripts/codemods/ast.ts";
import {
  assignabilityChecker,
  buildLiveness,
  collectChainAudit,
  collectChainCandidates,
  collectClientConsumed,
  collectColumnCandidates,
  collectOrphanCandidates,
  collectRegistries,
  collectSchemaTables,
  collectServerProcedures,
  collectSwallowedCandidates,
  collectTypeOnlyCandidates,
  isColumnExempt,
  isProdConsumed,
  isPublicTagged,
  isSwallowedExempt,
  isTypeOnlyExempt,
  isUnwiredExempt,
  respellHitsFor,
  scanRowReads,
} from "../../scripts/codemods/ast.ts";
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

// ── liveness identity: an ALIAS must never fork an export's liveness key ──────────────────────
// The false-orphan class (2026-08-02): a barrel that RENAMES on re-export (`export { createCreate as
// createCreateBook }`) made consumption key on the alias while the orphan candidate keyed on the
// origin's own name — 15 wired verbs reported dead. The format-agnostic proof: consuming an export
// DIRECTLY from its origin and consuming it through an aliasing barrel must land the SAME key (that
// direct-import key is, by construction, the one the orphans/testonly/clientgap candidate side uses).

const ALIAS_ORIGIN = `
export function createCreate() { return 1; }
export function createRemove() { return 2; }
export default () => 3;
`;

const ALIAS_BARREL = `
export { createCreate as createCreateBook, createRemove as createRemoveBook } from "./create";
export { default as makeThing } from "./create";
`;

/** The direct-from-origin consumer (client bucket) — the reference identity for every alias hop. */
const ALIAS_DIRECT_CONSUMER = `
import makeThing, { createCreate, createRemove } from "../../../../server/src/domain/wi/verbs/create";
export const direct = [createCreate, createRemove, makeThing];
`;

const ALIAS_FILES = {
  "packages/server/src/domain/wi/verbs/create.ts": ALIAS_ORIGIN,
  "packages/server/src/domain/wi/verbs/index.ts": ALIAS_BARREL,
  "packages/client/src/features/wi/direct.ts": ALIAS_DIRECT_CONSUMER,
};

/** Every liveness key whose declaration lives in `fileFragment`, sorted — separator/format agnostic. */
function keysIn(bucket: Set<string>, fileFragment: string): string[] {
  return [...bucket].filter((k) => k.includes(fileFragment)).sort(byString);
}

const ORIGIN_FRAGMENT = "/domain/wi/verbs/create.ts";

describe("ast liveness identity (aliased re-exports)", () => {
  test("a RENAMING barrel's named import keys to the same identity as a direct origin import", () => {
    const project = projectOf({
      ...ALIAS_FILES,
      // Consumes all three exports through the barrel, every one of them under an ALIAS.
      "packages/server/src/domain/wi/service.ts": `
        import { createCreateBook, createRemoveBook, makeThing } from "./verbs/index";
        export const wired = [createCreateBook, createRemoveBook, makeThing];
      `,
    });

    const live = buildLiveness(project);
    const direct = keysIn(live.usedClientProd, ORIGIN_FRAGMENT);
    const viaBarrel = keysIn(live.usedServerProd, ORIGIN_FRAGMENT);

    // All three origin exports are reached both ways, and the alias hop does not fork the identity.
    expect(direct).toHaveLength(3);
    expect(viaBarrel).toEqual(direct);
    // …and the three stay DISTINCT (a file-only key would "fix" the mismatch by making every export
    // of a consumed file look alive — that is a false-negative, not a fix).
    expect(new Set(viaBarrel).size).toBe(3);
  });

  test("a namespace import over a RENAMING barrel keys to the same identity as a direct origin import", () => {
    const project = projectOf({
      ...ALIAS_FILES,
      "packages/server/src/domain/wi/service.ts": `
        import * as verbs from "./verbs/index";
        export const wired = [verbs.createCreateBook, verbs.createRemoveBook, verbs.makeThing];
      `,
    });

    const live = buildLiveness(project);
    // markModuleAlive keeps a namespaced module's WHOLE export surface alive — through the aliases.
    expect(keysIn(live.usedServerProd, ORIGIN_FRAGMENT)).toEqual(keysIn(live.usedClientProd, ORIGIN_FRAGMENT));
  });

  test("a star-chained barrel above a RENAMING barrel keeps the same identity", () => {
    const project = projectOf({
      ...ALIAS_FILES,
      "packages/server/src/domain/wi/index.ts": 'export * from "./verbs/index";',
      "packages/server/src/domain/wi/service.ts": `
        import { createCreateBook, createRemoveBook, makeThing } from "./index";
        export const wired = [createCreateBook, createRemoveBook, makeThing];
      `,
    });

    const live = buildLiveness(project);
    expect(keysIn(live.usedServerProd, ORIGIN_FRAGMENT)).toEqual(keysIn(live.usedClientProd, ORIGIN_FRAGMENT));
  });
});

// ── the orphan-candidate substrate (shared by `pnpm ast orphans` and the push-tier ratchet) ──────
// The ratchet (scripts/verify/orphan-export-ratchet.ts) judges EXACTLY this candidate set, so the two can
// never disagree about what an orphan is. Two properties are load-bearing for it: star-suppressed
// candidates are FLAGGED as suppressed (never silently dropped, never ratcheted), and `isProdConsumed`
// answers the stale-`@public` question on the same declaration identity the candidate side keys on.

describe("ast orphan-candidate substrate", () => {
  test("names star-suppressed candidates separately, and marks prod-consumed origins alive", () => {
    const project = projectOf({
      // `rot` is reached by nobody; `live` is imported by a prod file. Both live under a file the barrel
      // re-exports with `export *`, so both are STAR-SUPPRESSED candidates.
      "packages/contracts/src/thing/shapes.ts": "export interface RotShape { a: number; }\nexport interface LiveShape { b: number; }\n",
      "packages/contracts/src/thing/index.ts": 'export * from "./shapes";',
      // A shape NOT under any star re-export — the plain orphan the ratchet actually pins.
      "packages/contracts/src/thing/solo.ts": "export interface SoloRot { c: number; }\n",
      "packages/server/src/domain/thing/service.ts":
        'import type { LiveShape } from "../../../../contracts/src/thing/shapes"; export const y: LiveShape | null = null;',
    });

    const live = buildLiveness(project);
    const candidates = collectOrphanCandidates(project, live, (fp) => fp.includes("/packages/contracts/src/"));
    const named = (suppressed: boolean): string[] =>
      candidates
        .filter((c) => c.starSuppressed === suppressed)
        .map((c) => c.name)
        .sort(byString);

    // The consumed shape is NOT a candidate at all; the star-suppressed rot is NAMED as suppressed (per
    // symbol — the grain the ratchet needs to refuse to judge it); the unsuppressed rot stands alone.
    expect(named(true)).toEqual(["RotShape"]);
    expect(named(false)).toEqual(["SoloRot"]);

    // `isProdConsumed` reads the SAME identity: true for the imported shape, false for the rot beside it.
    const shapes = project.getSourceFileOrThrow(`${ROOT}/packages/contracts/src/thing/shapes.ts`);
    const declOf = (name: string): Parameters<typeof isProdConsumed>[1] => shapes.getInterfaceOrThrow(name);
    expect(isProdConsumed(live, declOf("LiveShape"))).toBe(true);
    expect(isProdConsumed(live, declOf("RotShape"))).toBe(false);
  });
});

// ── swallowed: the err-alive namespace arm hiding a functionally dead export ──────────────────────
// The real shape (packages/db): `import * as schema from "#schema"` handed to `drizzle(client, {schema})`
// marks EVERY export of the barrel alive without naming one — `usersRelations` read as consumed for five
// weeks. The fixture reproduces it and pins all four escape hatches: a member the swallowing file SPELLS
// (`schema.users`), one it DESTRUCTURES, one a NAMED import reaches elsewhere, and one used in its own file
// are all genuinely alive; only the wholesale-passed export is a candidate.

const SCHEMA_TABLES = `
export const users = { id: "users" };
export const auditLog = { id: "audit" };
export const legacyView = { id: "legacy" };
export const selfUsed = { id: "self" };
export const usersRelations = { on: users, self: selfUsed };
`;

const SCHEMA_BARREL = 'export * from "./tables";';

// The swallowing consumer: passes the namespace WHOLESALE to a library, and separately names two members.
const SWALLOWING_CLIENT = `
import * as schema from "../schema/index";
export const db = drizzle(client, { schema });
export const primary = schema.users;
const { legacyView } = schema;
export const legacy = legacyView;
`;

const SWALLOWED_FILES = {
  "packages/db/src/schema/tables.ts": SCHEMA_TABLES,
  "packages/db/src/schema/index.ts": SCHEMA_BARREL,
  "packages/db/src/client/index.ts": SWALLOWING_CLIENT,
  // A NAMED importer of one member — "no named import reaches it ANYWHERE" is part of the definition.
  "packages/server/src/domain/audit/service.ts": 'import { auditLog } from "../../../../db/src/schema/tables"; export const a = auditLog;',
};

const inDb = (fp: string): boolean => fp.includes("/packages/db/");

describe("ast swallowed lens (namespace-only liveness)", () => {
  test("flags EXACTLY the export the swallowing file never names", () => {
    const project = projectOf(SWALLOWED_FILES);
    const candidates = collectSwallowedCandidates(project, buildLiveness(project), inDb);

    // usersRelations rides into drizzle inside the namespace object and is never spelled — the rot-hider.
    // Every other export is alive through a DIFFERENT arm and must not be reported: users (property access
    // at the swallow site), legacyView (destructure of the namespace), auditLog (a named import elsewhere),
    // selfUsed (used in its own file).
    expect(candidates.map((c) => c.name).sort(byString)).toEqual(["usersRelations"]);

    const swallowed = candidates.find((c) => c.name === "usersRelations") as SwallowedCandidate;
    // The hit names the file a human must read to render the verdict — the site holding the wholesale pass.
    // (Path form is repo-relative on the real tree; this synthetic root is outside it, so match the tail.)
    expect(swallowed.sites.some((s) => s.endsWith("packages/db/src/client/index.ts"))).toBe(true);
  });

  test("a member the swallowing file SPELLS is not a candidate, even through a renaming barrel", () => {
    // The namespace exposes the origin under the BARREL's alias, so the lens must match `ns.<barrel name>`,
    // not the origin's own name — the same alias trap that forked the liveness key in 2026-08-02.
    const project = projectOf({
      "packages/db/src/schema/tables.ts": "export const rawUsers = { id: 1 };\nexport const rawAudit = { id: 2 };\n",
      "packages/db/src/schema/index.ts": 'export { rawUsers as users, rawAudit as auditLog } from "./tables";',
      "packages/db/src/client/index.ts":
        'import * as schema from "../schema/index";\nexport const db = drizzle(client, { schema });\nexport const primary = schema.users;\n',
    });
    const candidates = collectSwallowedCandidates(project, buildLiveness(project), inDb);
    // `schema.users` spells the ALIAS of rawUsers → alive. rawAudit is never spelled → the candidate.
    expect(candidates.map((c) => c.name)).toEqual(["rawAudit"]);
  });

  test("an export reached by NOBODY is an orphan, not a swallowed candidate (the lenses do not overlap)", () => {
    const project = projectOf({
      "packages/db/src/schema/tables.ts": "export const unreached = { id: 1 };\n",
    });
    const live = buildLiveness(project);
    expect(collectSwallowedCandidates(project, live, inDb)).toEqual([]);
    expect(collectOrphanCandidates(project, live, inDb).map((c) => c.name)).toEqual(["unreached"]);
  });

  test("`@swallowed-ok: <reason>` above an `export const` exempts; a bare marker does not", () => {
    const project = projectOf({
      "packages/db/src/schema/relations.ts": `
// @swallowed-ok: handed to drizzle wholesale; the library reads the relations config it is given.
export const usersRelations = { on: 1 };
// @swallowed-ok:
export const unreasoned = { on: 2 };
export const untagged = { on: 3 };
`,
    });
    const decls = project.getSourceFileOrThrow(`${ROOT}/packages/db/src/schema/relations.ts`);
    const declOf = (name: string): Parameters<typeof isSwallowedExempt>[0] => decls.getVariableDeclarationOrThrow(name);
    // The marker lives on the STATEMENT, not on the binding name — reading it off the declaration alone
    // would make every `export const`-shaped marker (i.e. the real one, in db/schema/relations.ts) invisible.
    expect(isSwallowedExempt(declOf("usersRelations"))).toBe(true);
    expect(isSwallowedExempt(declOf("unreasoned"))).toBe(false);
    expect(isSwallowedExempt(declOf("untagged"))).toBe(false);
  });
});

// ── respell: the lens must not flag the derive it recommends ──────────────────────────────────────
// SM1's finding (2026-08-03): `export type X = <contracts symbol>` IS mutually assignable with that symbol,
// so the lens flagged its own recommended fix and its steady state was "3 hits, all resolved" — which trains
// a reader to ignore it. A bare alias naming the matched contracts symbol is the destination, not the defect;
// a hand-spelled twin of the same body still has to red.

const CONTRACTS_MEMORY = "export interface MemoryBackfillResult { scanned: number; written: number; skipped: number; }\n";
const CONTRACTS_IMPORT = "../../../../../contracts/src/chat/index";

describe("ast respell lens (alias blind spot)", () => {
  test("skips a bare alias OF the matched contracts symbol, still reds a hand-spelled twin", () => {
    const project = projectOf({
      "packages/contracts/src/chat/index.ts": CONTRACTS_MEMORY,
      "packages/server/src/domain/chat/contract/memory.ts": `
import type { MemoryBackfillResult } from "${CONTRACTS_IMPORT}";
export type MemoryBackfillCounts = MemoryBackfillResult;
export interface MemoryBackfillTally { scanned: number; written: number; skipped: number; }
`,
    });
    const names = respellHitsFor(project, assignabilityChecker(project), "chat").map((h) => h.text);
    // The hand-copy is the defect; the alias is the fix the lens's own banner recommends.
    expect(names.some((t) => t.startsWith("MemoryBackfillTally"))).toBe(true);
    expect(names.some((t) => t.startsWith("MemoryBackfillCounts"))).toBe(false);
  });

  test("an alias of a DIFFERENT contracts symbol that happens to match is still reported", () => {
    // The skip is per-PAIR (same declaration identity), not "any alias is innocent": aliasing shape A while
    // structurally duplicating shape B is still a re-spell candidate.
    const project = projectOf({
      "packages/contracts/src/chat/index.ts": `${CONTRACTS_MEMORY}export interface MemoryScanResult { scanned: number; written: number; skipped: number; }\n`,
      "packages/server/src/domain/chat/contract/memory.ts": `
import type { MemoryBackfillResult } from "${CONTRACTS_IMPORT}";
export type MemoryBackfillCounts = MemoryBackfillResult;
`,
    });
    const texts = respellHitsFor(project, assignabilityChecker(project), "chat").map((h) => h.text);
    // Skipped against its own origin, reported against the structurally-identical sibling.
    expect(texts).toEqual(["MemoryBackfillCounts  ≡  @orb/contracts/chat::MemoryScanResult"]);
  });
});

// ── typeonly-alive: value exports kept alive ONLY by type positions ───────────────────────────────
// The owner-named rot class: an export whose every reference is `import type` / `typeof X` / an annotation
// / an `implements` clause — it ships a runtime body to satisfy a SHAPE and nothing ever calls it. The
// lens classifies by REFERENCE POSITION, not import form, so the fixture pins the arms an import-form pass
// would get WRONG: a plain (un-typed) import used only as `typeof X` is the defect; a class's runtime
// `extends` target is alive even though its heritage node IS a TypeNode by kind; a namespace-member access
// and a renaming-barrel hop both resolve to the origin.

const TYPEONLY_ORIGIN = `
export const TYPE_ONLY = { a: 1 };
export const PLAIN_IMPORT_TYPE_ONLY = { b: 2 };
export const VALUE_USED = { c: 3 };
export const NS_VALUE_USED = { d: 4 };
export const SELF_USED = { e: 5 };
export const SELF_CONSUMER = SELF_USED.e;
export const UNREACHED = { f: 6 };
export function fnTypeOnly() { return 1; }
export class ClsImplemented {}
export class ClsExtended {}
export interface PlainShape { g: number; }
export type PlainAlias = { h: number };
`;

const TYPEONLY_CONSUMER = `
import type { TYPE_ONLY, PlainShape, PlainAlias } from "../../../../server/src/typeonly/origin";
import { PLAIN_IMPORT_TYPE_ONLY, VALUE_USED, fnTypeOnly, ClsImplemented, ClsExtended } from "../../../../server/src/typeonly/origin";
import * as origin from "../../../../server/src/typeonly/origin";
export type A = typeof TYPE_ONLY;
export type B = typeof PLAIN_IMPORT_TYPE_ONLY;
export type C = ReturnType<typeof fnTypeOnly>;
export const v = VALUE_USED.c;
export const n = origin.NS_VALUE_USED;
export class Impl implements ClsImplemented { x = 1; }
export class Sub extends ClsExtended {}
export interface Widened extends PlainShape { i: number; }
export type Aliased = PlainAlias;
`;

const inTypeOnlyScope = (fp: string): boolean => fp.includes("/packages/server/src/typeonly/");

describe("ast typeonly-alive lens (reference-position liveness)", () => {
  test("flags EXACTLY the value exports whose every reference is a type position", () => {
    const project = projectOf({
      "packages/server/src/typeonly/origin.ts": TYPEONLY_ORIGIN,
      "packages/client/src/features/typeonly/panel.ts": TYPEONLY_CONSUMER,
    });

    const names = collectTypeOnlyCandidates(project, inTypeOnlyScope)
      .map((c) => c.name)
      .sort(byString);

    // TYPE_ONLY (import type + typeof), PLAIN_IMPORT_TYPE_ONLY (PLAIN import, only ever `typeof` — the arm
    // an import-form classifier gets wrong), fnTypeOnly (`ReturnType<typeof …>`), ClsImplemented (an
    // `implements` heritage clause is type-only).
    expect(names).toEqual(["ClsImplemented", "fnTypeOnly", "PLAIN_IMPORT_TYPE_ONLY", "TYPE_ONLY"]);

    // Everything else is alive or out of class, each for a DIFFERENT reason the lens must respect:
    //   VALUE_USED       — a property read at a runtime position;
    //   NS_VALUE_USED    — reached only through `import * as origin` + `origin.NS_VALUE_USED` (the member
    //                      access import-edge liveness cannot see, and this lens CAN);
    //   SELF_USED        — used by its own file at a value position;
    //   ClsExtended      — a class's `extends` target is CONSTRUCTED at runtime, even though the heritage
    //                      node is a TypeNode by kind;
    //   UNREACHED        — nothing references it at all: an `orphans` hit, never this lens's;
    //   PlainShape /     — an interface and a type alias are type-only BY NATURE and legal, so they are
    //   PlainAlias         never candidates even though every reference to them is a type position.
    for (const alive of ["VALUE_USED", "NS_VALUE_USED", "SELF_USED", "ClsExtended", "UNREACHED", "PlainShape", "PlainAlias"]) {
      expect(names).not.toContain(alive);
    }
  });

  test("names the type-position sites, and sees through a RENAMING barrel", () => {
    // The alias trap that forked the liveness key in 2026-08-02: the consumer spells the BARREL's name.
    // Reference resolution keys on the origin declaration, so the hop must not hide the type-only verdict.
    const project = projectOf({
      "packages/server/src/typeonly/origin.ts": "export const inner = { a: 1 };\n",
      "packages/server/src/typeonly/index.ts": 'export { inner as outer } from "./origin";\n',
      "packages/client/src/features/typeonly/panel.ts": `
import { outer } from "../../../../server/src/typeonly/index";
export type A = typeof outer;
`,
    });

    const candidates = collectTypeOnlyCandidates(project, inTypeOnlyScope);
    expect(candidates.map((c) => c.name)).toEqual(["inner"]);
    // The hit names the file a human must read to render the verdict — the type position, not the barrel.
    expect(candidates[0]?.sites.some((s) => s.endsWith("packages/client/src/features/typeonly/panel.ts:3"))).toBe(true);
  });

  test("ONE runtime reference anywhere kills the candidacy (err alive, never a false death sentence)", () => {
    const project = projectOf({
      "packages/server/src/typeonly/origin.ts": "export const shape = { a: 1 };\n",
      "packages/client/src/features/typeonly/type-user.ts":
        'import type { shape } from "../../../../server/src/typeonly/origin";\nexport type A = typeof shape;\n',
      // A single value read, in a TEST path — the lens still reads it as alive (a test-only value consumer
      // is `testonly`'s class, not runtime-dead code).
      "tests/typeonly/shape.test.ts": 'import { shape } from "../../packages/server/src/typeonly/origin";\nexport const v = shape.a;\n',
    });
    expect(collectTypeOnlyCandidates(project, inTypeOnlyScope)).toEqual([]);
  });

  test("`@typeonly-ok: <reason>` above an `export const` exempts; a bare marker does not; a marker on a live export is STALE", () => {
    const project = projectOf({
      "packages/server/src/typeonly/origin.ts": `
// @typeonly-ok: the axis tuple; its whole job is to be the source of the derived union.
export const KINDS = ["a", "b"] as const;
// @typeonly-ok:
export const unreasoned = { a: 1 };
export const untagged = { a: 2 };
// @typeonly-ok: a marker on an export something actually CALLS — the stale side of the two-sided arm.
export const staleTagged = { a: 3 };
`,
      "packages/client/src/features/typeonly/panel.ts": `
import type { unreasoned, untagged } from "../../../../server/src/typeonly/origin";
import { staleTagged } from "../../../../server/src/typeonly/origin";
import type { KINDS } from "../../../../server/src/typeonly/origin";
export type K = (typeof KINDS)[number];
export type U = typeof unreasoned;
export type T = typeof untagged;
export const live = staleTagged.a;
`,
    });
    const origin = project.getSourceFileOrThrow(`${ROOT}/packages/server/src/typeonly/origin.ts`);
    const declOf = (name: string): Parameters<typeof isTypeOnlyExempt>[0] => origin.getVariableDeclarationOrThrow(name);
    // The marker lives on the STATEMENT, not on the binding name (the `export const` commentHost hop).
    expect(isTypeOnlyExempt(declOf("KINDS"))).toBe(true);
    expect(isTypeOnlyExempt(declOf("unreasoned"))).toBe(false);
    expect(isTypeOnlyExempt(declOf("untagged"))).toBe(false);

    const candidates = collectTypeOnlyCandidates(project, inTypeOnlyScope);
    const candidateNames = candidates.map((c) => c.name).sort(byString);
    // KINDS is a candidate the marker EXEMPTS; the other two type-only exports stay reported.
    expect(candidateNames).toEqual(["KINDS", "unreasoned", "untagged"]);

    // The STALE arm's exact predicate (what `printStaleTypeOnlyTags` reds on): tagged, but no longer a
    // candidate — `staleTagged` has a runtime consumer now, so the marker is a lie.
    expect(isTypeOnlyExempt(declOf("staleTagged"))).toBe(true);
    expect(candidateNames).not.toContain("staleTagged");
  });
});

// The columns lens over a MINIATURE drizzle: `sqliteTable` is declared with a signature returning the config
// object's own type, so `<table>.<col>` resolves to the real PropertyAssignment the way the live drizzle
// types do. All three consumption shapes the lens must separate are present: a QUERY read (`t.col`), a ROW
// read, and structural writes via `.values({…})` / `.set({…})` / a whole-row `.values(row)`.
//
// A NOTE ON WHAT THIS SYNTHETIC PROJECT CANNOT REPRODUCE, so a later reader does not mistake it for full
// coverage: on the REAL tree, drizzle's `$inferSelect` loses its declaration links, which is why a
// `row.<col>` read there is invisible to reference resolution and why READ arm 2 exists at all (measured —
// the lens's first cut reported 90 write-only columns, of which `plugins.*` was a whole table of falsehoods).
// A hand-written mini `$inferSelect` keeps those links whatever shape it is given, so arm 1 happens to catch
// that read HERE. Arm 2 is therefore pinned DIRECTLY, against `scanRowReads`, in its own test below.
const MINI_DRIZZLE = `
export declare function sqliteTable<T>(name: string, cols: T): T & { $inferSelect: { [K in keyof T]: string } };
export declare function text(name: string): string;
export declare function integer(name: string): number;
export declare const db: {
  insert: (t: unknown) => { values: (v: unknown) => { onConflictDoUpdate: (c: unknown) => void } };
  update: (t: unknown) => { set: (v: unknown) => { where: (w: unknown) => void } };
  select: () => { from: (t: unknown) => unknown[] };
};
`;

const WIDGET_SCHEMA = `
import { integer, sqliteTable, text } from "../drizzle";
export const widgets = sqliteTable("widgets", {
  id: text("id"),
  label: text("label"),
  // @column-ok: written by the importer for provenance; nothing renders it yet (PD-999).
  origin: text("origin"),
  tally: integer("tally"),
  ghost: text("ghost"),
});
`;

/** Only the mini-schema counts as the schema dir — the lens's own SCHEMA_DIR constant is a path substring. */
const COLUMN_FILES: Record<string, string> = {
  "packages/db/src/drizzle.ts": MINI_DRIZZLE,
  "packages/db/src/schema/widgets.ts": WIDGET_SCHEMA,
  "packages/server/src/domain/widget/queries.ts": `
import { db } from "../../../../db/src/drizzle";
import { widgets } from "../../../../db/src/schema/widgets";
type WidgetRow = typeof widgets.$inferSelect;
export function readAll(): string[] {
  const rows = db.select().from(widgets) as WidgetRow[];
  return rows.map((row) => row.tally + widgets.label);
}
export function write(): void {
  db.insert(widgets).values({ id: "a", label: "b", origin: "import", tally: "1" });
  db.update(widgets).set({ tally: "2" }).where(widgets.id);
}
`,
};

describe("ast columns lens (drizzle consumption)", () => {
  test("classifies every column into the four consumption classes", () => {
    const project = projectOf(COLUMN_FILES);
    const tables = collectSchemaTables(project);
    expect(tables.map((t) => t.sqlName)).toEqual(["widgets"]);

    const byName = new Map(collectColumnCandidates(project, tables).candidates.map((c) => [c.column.jsProp, c]));
    // `label` is read as a query reference AND written in the insert literal — the healthy state.
    expect(byName.get("label")?.klass).toBe("read-write");
    // `tally` is read off a row and written twice (the insert literal + the update `set`).
    expect(byName.get("tally")?.klass).toBe("read-write");
    // `id` is read (the `where` reference) and written — healthy.
    expect(byName.get("id")?.klass).toBe("read-write");
    // `origin` is written by the insert literal and read by NOBODY — the RV-11 class, exactly.
    expect(byName.get("origin")?.klass).toBe("write-only");
    // `ghost` is named by no reader and no writer at all, and no writer here is opaque — pure rot.
    expect(byName.get("ghost")?.klass).toBe("neither");
    expect(byName.get("ghost")?.opaque).toBe(false);
    // The SQL spelling travels beside the JS one (a reader greps the migration, not the property).
    expect(byName.get("ghost")?.column.sqlColumn).toBe("ghost");
  });

  test("READ arm 2 counts a row-shaped access with NO link back to the table (the mapped-type hole)", () => {
    const project = projectOf({
      ...COLUMN_FILES,
      // A hand-written view whose fields merely MATCH the columns — nothing ties it to `widgets`, so
      // reference resolution can never connect this read to the schema. Arm 2's shape test is the only
      // thing that can, and this is exactly the real-tree `type Row = typeof t.$inferSelect` situation.
      "packages/server/src/domain/widget/view.ts": `
interface WidgetView { id: string; label: string; origin: string; tally: string; ghost: string }
export function render(v: WidgetView): string {
  const { ghost } = v;
  return v.origin + ghost;
}
`,
    });
    const tables = collectSchemaTables(project);
    const rowReads = scanRowReads(project, tables);
    // The scan's key is the lens's private (tableVar, prop) PAIR — matched by suffix so this test never
    // encodes the separator, the same way the liveness tests avoid encoding declaration keys.
    const readSites = (col: string): readonly string[] => [...rowReads].find(([k]) => k.endsWith(col))?.[1] ?? [];
    // The property access AND the destructure both land — a destructure is a read of every name it binds.
    expect(readSites("origin").length).toBeGreaterThan(0);
    expect(readSites("ghost").length).toBeGreaterThan(0);
    // `label` is on the view type but nothing reads it there — arm 2 counts ACCESSES, never membership.
    expect(readSites("label")).toEqual([]);

    // End to end: the two columns the view reads stop being findings; the lens errs toward alive.
    const byName = new Map(collectColumnCandidates(project, tables).candidates.map((c) => [c.column.jsProp, c]));
    expect(byName.get("origin")?.klass).toBe("read-write");
    expect(byName.get("ghost")?.klass).toBe("read-only");
  });

  test("a whole-row `.values(row)` makes every column of that table write-UNKNOWN, never `neither`", () => {
    const project = projectOf({
      ...COLUMN_FILES,
      // The opaque writer: a typed variable, no object literal — it names no column, so the lens must stop
      // claiming any column of `widgets` is unwritten (erring toward alive, as the swallowed lens does).
      "packages/server/src/domain/widget/bulk.ts": `
import { db } from "../../../../db/src/drizzle";
import { widgets } from "../../../../db/src/schema/widgets";
export function bulk(row: { id: string }): void {
  db.insert(widgets).values(row);
}
`,
    });
    const audit = collectColumnCandidates(project, collectSchemaTables(project));
    const ghost = audit.candidates.find((c) => c.column.jsProp === "ghost");
    expect(ghost?.opaque).toBe(true);
    // The load-bearing assertion: `neither` is no longer reachable for this table, but the READ half is
    // untouched, so `ghost` stays a WRITE-only hit rather than silently disappearing into read-write.
    expect(ghost?.klass).toBe("write-only");
    expect(audit.opaqueTables.has("widgets")).toBe(true);
  });

  test("`@column-ok: <reason>` on the column property exempts it; the marker reads off the PropertyAssignment", () => {
    const project = projectOf(COLUMN_FILES);
    const tables = collectSchemaTables(project);
    const declOf = (name: string): Parameters<typeof isColumnExempt>[0] => {
      const found = tables[0]?.columns.find((c) => c.jsProp === name)?.decl;
      if (found === undefined) {
        throw new Error(`no column ${name}`);
      }
      return found;
    };
    expect(isColumnExempt(declOf("origin"))).toBe(true);
    expect(isColumnExempt(declOf("ghost"))).toBe(false);
  });
});

describe("ast regkeys lens (informational row dispatch)", () => {
  test("reports only the rows whose key is spelled at no non-test dispatch site", () => {
    const project = projectOf({
      "packages/client/src/state/panes.ts": `
export const PANE_REGISTRY = {
  chat: 1,
  settings: 2,
  retired: 3,
  alsoRetired: 4,
} as const;
`,
      // `chat` is dispatched as a string literal, `settings` as a property-access name — both count.
      "packages/client/src/features/shell/router.ts": `
export const open = (): string => "chat";
export const which = (r: { settings: number }): number => r.settings;
`,
      // A TEST spelling `retired` must NOT keep it alive — the same rule `testonly` applies to exports.
      "tests/client/panes.test.ts": 'export const k = "retired";\n',
    });
    const registries = collectRegistries(project);
    expect(registries.map((r) => r.name)).toEqual(["PANE_REGISTRY"]);
    expect(registries[0]?.rows.map((r) => r.key)).toEqual(["chat", "settings", "retired", "alsoRetired"]);
  });

  test("a 2-row table is below the registry floor, and a non-exported / lowercase-untyped const is not a registry", () => {
    const project = projectOf({
      "packages/client/src/state/small.ts": "export const TWO_ROWS = { a: 1, b: 2 } as const;\n",
      "packages/client/src/state/local.ts": "const PRIVATE_TABLE = { a: 1, b: 2, c: 3 } as const;\nexport const use = PRIVATE_TABLE.a;\n",
      "packages/client/src/state/plain.ts": "export const plainObject = { a: 1, b: 2, c: 3 };\n",
      // The Record-annotated form IS a registry even without a SCREAMING_SNAKE name (the house dispatch shape).
      "packages/client/src/state/typed.ts": "export const handlers: Record<string, number> = { a: 1, b: 2, c: 3 };\n",
    });
    expect(collectRegistries(project).map((r) => r.name)).toEqual(["handlers"]);
  });
});

// ── the DECLARATION-GRANULAR edge must not perturb the liveness sets (the GATE-REGRESSION guard) ──────
// `buildLiveness` is shared substrate: `pnpm ast orphans` prints its verdict and the PUSH-tier
// `deps:orphan-ratchet` (scripts/verify/orphan-export-ratchet.ts) gates on the same candidate set. So the
// edge map added for `chains` is PARALLEL and OPT-IN, and this is the pin that keeps it that way: over every
// fixture corpus in this file, the six liveness sets must be IDENTICAL with the flag off and on — the flag's
// only observable effect is `consumers`. (The same identity was measured on the REAL workspace before and
// after the substrate landed: all 7028 usedProd / 8353 arm entries byte-identical outside the edited files.)

/** Everything a liveness verdict is allowed to depend on, in a comparable form. */
function livenessDigest(live: Liveness): Record<string, string[]> {
  const sorted = (bucket: Set<string>): string[] => [...bucket].sort(byString);
  return {
    usedProd: sorted(live.usedProd),
    usedClientProd: sorted(live.usedClientProd),
    usedServerProd: sorted(live.usedServerProd),
    usedTest: sorted(live.usedTest),
    starTargets: sorted(live.starTargets),
    arms: [...live.arms.entries()].map(([k, v]) => `${k}=>${[...v].sort(byString).join(",")}`).sort(byString),
    namespaceSites: live.namespaceSites.map((s) => `${s.file.getFilePath()}::${s.alias}::${[...s.exposed.keys()].sort(byString).join("|")}`).sort(byString),
  };
}

describe("ast liveness edge map (parallel + opt-in)", () => {
  test("the edge flag changes NOTHING about the liveness sets, on every fixture corpus in this file", () => {
    const corpora: Record<string, Record<string, string>> = {
      alias: {
        ...ALIAS_FILES,
        "packages/server/src/domain/wi/service.ts": 'import { createCreateBook } from "./verbs/index"; export const wired = [createCreateBook];',
      },
      swallowed: SWALLOWED_FILES,
      columns: COLUMN_FILES,
      chain: CHAIN_FILES,
      typeonly: {
        "packages/server/src/typeonly/origin.ts": TYPEONLY_ORIGIN,
        "packages/client/src/features/typeonly/panel.ts": TYPEONLY_CONSUMER,
      },
    };
    for (const [label, files] of Object.entries(corpora)) {
      const project = projectOf(files);
      const off = buildLiveness(project);
      const on = buildLiveness(project, { edges: true });
      // The load-bearing assertion: the sets orphans/testonly/clientgap/swallowed/the ratchet read are equal.
      expect(livenessDigest(on), `corpus ${label}`).toEqual(livenessDigest(off));
      // …and the flag is what it claims to be — the map is EMPTY when off and populated when on, so a future
      // edit that computes edges unconditionally (re-introducing the cost on the ratchet's path) fails here.
      expect(off.consumers.size, `corpus ${label} (off)`).toBe(0);
      expect(on.consumers.size, `corpus ${label} (on)`).toBeGreaterThan(0);
    }
  });
});

// ── chains: WHOLE dead chains, not just the head ──────────────────────────────────────────────────
// The alias-rabbit-hole class. `orphans` answers "does anything reach this export?" and stops, so a chain
// reports as ONE hit — its head — and costs a delete-and-rerun cycle per link. Measured on the real tree
// before this lens existed: a planted 3-link chain under packages/server/src/ made `pnpm ast orphans server`
// print exactly `chainProbeHead` and neither link below it. The fixture below is that shape, plus a FILE-LOCAL
// hop (the arm no import-edge lens can ever see) so one run has to name all three links.

const CHAIN_FILES: Record<string, string> = {
  "packages/server/src/chain/deep.ts": "export function deepFn(): number { return 1; }\n",
  // `localHop` is NOT exported — a chain that launders itself through a file-local alias is the same defect,
  // and it is invisible to every import-edge lens in the file.
  "packages/server/src/chain/mid.ts": 'import { deepFn } from "./deep";\nconst localHop = deepFn;\nexport const midValue = localHop();\n',
  "packages/server/src/chain/head.ts": 'import { midValue } from "./mid";\nexport const headValue = midValue + 1;\n',
};

const inChainScope = (fp: string): boolean => fp.includes("/packages/server/src/chain/");

/** The lens's candidates for one file set, by name — sorted, so every assertion below is EXACT (a lens that
 *  names one link too few or the head too many fails, which is what makes these tests mutation-proof). */
function chainNames(files: Record<string, string>, inScope: (fp: string) => boolean = inChainScope): string[] {
  const project = projectOf(files);
  return collectChainCandidates(project, buildLiveness(project, { edges: true }), inScope)
    .map((c) => c.name)
    .sort(byString);
}

describe("ast chains lens (declaration-granular fixpoint)", () => {
  test("names EVERY link of a 3-link chain in ONE run — and never the head, which is `orphans`' hit", () => {
    const project = projectOf(CHAIN_FILES);
    const candidates = collectChainCandidates(project, buildLiveness(project, { edges: true }), inChainScope);

    // All three links below the head, including the FILE-LOCAL hop. `headValue` is absent: nothing reaches it
    // at all, so it is an `orphans` hit — the two lenses never report the same row (the `swallowed` rule).
    expect(candidates.map((c) => c.name).sort(byString)).toEqual(["deepFn", "localHop", "midValue"]);
    // …and `orphans` really does own the head, on the SAME project — the split is a fact, not a convention.
    expect(collectOrphanCandidates(project, buildLiveness(project), inChainScope).map((c) => c.name)).toEqual(["headValue"]);

    const byName = new Map(candidates.map((c) => [c.name, c]));
    // The export/file-local split a reader prices a verdict with: a file-local link essentially cannot have
    // an unseen dynamic consumer, an exported one can.
    expect(byName.get("localHop")?.exported).toBe(false);
    expect(byName.get("midValue")?.exported).toBe(true);

    // The WHOLE chain is rendered, in order, terminating at the unconsumed head — that rendering is the
    // deliverable (the reason this lens exists is that a reader gets the root cause without three re-runs).
    const deep = byName.get("deepFn") as ChainCandidate;
    expect(deep.chain.map((l) => l.name)).toEqual(["localHop", "midValue", "headValue"]);
    expect(deep.chain.map((l) => l.terminal)).toEqual([false, false, true]);
  });

  test("the audit reports the GRAPH's own size, so a ZERO is legible as clean rather than as blindness", () => {
    // The permanent-zero footgun this file already ate once (`orphans contracts` reporting clean while blind
    // to a 100%-barrel package). "0 findings" is only a claim if the reader can see how much was examined —
    // and the whole-workspace first audit of this lens WAS a zero, which is why these numbers must be real.
    const project = projectOf(CHAIN_FILES);
    const audit = collectChainAudit(project, buildLiveness(project, { edges: true }), inChainScope);
    expect(audit.declarations).toBe(4); // deepFn, localHop, midValue, headValue
    expect(audit.edges).toBe(3); // deepFn←localHop, localHop←midValue, midValue←headValue
    expect(audit.unconsumedHeads).toBe(1); // headValue — the `orphans` hit this lens does NOT repeat
    expect(audit.candidates).toHaveLength(3);
  });

  test("`@public <reason>` on the HEAD makes the whole chain alive — the fix-at-the-head rule, end to end", () => {
    // The lens deliberately has NO marker of its own: every chain ends at an orphan candidate the ratchet
    // already governs, so tagging the head is the exemption. A BARE `@public` must NOT exempt (the
    // `isUnwiredExempt` discipline), which is the other half of this test.
    const headPath = "packages/server/src/chain/head.ts";
    const tagged = {
      ...CHAIN_FILES,
      [headPath]: 'import { midValue } from "./mid";\n/** @public the unbuilt admin surface this pairs with. */\nexport const headValue = midValue + 1;\n',
    };
    expect(chainNames(tagged)).toEqual([]);

    const bare = { ...CHAIN_FILES, [headPath]: 'import { midValue } from "./mid";\n/** @public */\nexport const headValue = midValue + 1;\n' };
    expect(chainNames(bare)).toEqual(["deepFn", "localHop", "midValue"]);

    // The predicate itself, at the ONE home the push-tier orphan ratchet imports (two spellings of it would
    // let the ratchet and this fixpoint disagree about what "deliberately unconsumed" means).
    const headDecl = (files: Record<string, string>): Parameters<typeof isPublicTagged>[0] =>
      projectOf(files).getSourceFileOrThrow(`${ROOT}/${headPath}`).getVariableDeclarationOrThrow("headValue");
    expect(isPublicTagged(headDecl(tagged))).toBe(true);
    expect(isPublicTagged(headDecl(bare))).toBe(false);
  });

  test("a MODULE-SCOPE side effect and a TEST consumer are each alive roots (nothing can make them dead)", () => {
    // ROOT 1 — a top-level statement belongs to no declaration, so the fixpoint can never kill it.
    const sideEffect = { ...CHAIN_FILES, "packages/server/src/chain/boot.ts": 'import { headValue } from "./head";\nconsole.log(headValue);\n' };
    expect(chainNames(sideEffect)).toEqual([]);
    // ROOT 2 — a test consumer, exactly as `orphans` counts test consumption as life. The two lenses must
    // agree about what is alive or they would nominate different code for deletion.
    const fromTest = {
      ...CHAIN_FILES,
      "tests/chain/head.test.ts": 'import { headValue } from "../../packages/server/src/chain/head";\nexport const t = headValue;\n',
    };
    expect(chainNames(fromTest)).toEqual([]);
  });

  test("a DESTRUCTURED export keys on its BindingElement, so its chain is neither faked nor missed", () => {
    // The regression the lens's own first audit caught: `getExportedDeclarations()` hands back the
    // BindingElement for `export const { useKit } = …`, while the declaration side saw a VariableDeclaration
    // named `"{ useKit }"`. That fork reported the entire `useAppForm` form kit — 32 declarations — as one
    // chain-dead subtree. Both directions are pinned here, because a fix that just excluded destructured
    // declarations would pass the alive arm and silently lose the chain arm.
    const files: Record<string, string> = {
      "packages/server/src/chain/widget.ts": "export const FieldWidget = { id: 1 };\n",
      "packages/server/src/chain/kit.ts": 'import { FieldWidget } from "./widget";\nexport const { useKit } = makeKit({ FieldWidget });\n',
    };
    // ALIVE arm: a module-scope consumer of the destructured name keeps the registered widget alive THROUGH
    // the binding element. Under the forked keying this reported `FieldWidget`.
    expect(chainNames({ ...files, "packages/server/src/chain/boot.ts": 'import { useKit } from "./kit";\nconsole.log(useKit);\n' })).toEqual([]);
    // CHAIN arm: with nothing consuming `useKit`, the widget is chain-dead THROUGH it — and the link is
    // named `useKit`, not the pattern text, so the reader is told where to go.
    const project = projectOf(files);
    const candidates = collectChainCandidates(project, buildLiveness(project, { edges: true }), inChainScope);
    expect(candidates.map((c) => c.name)).toEqual(["FieldWidget"]);
    expect(candidates[0]?.chain.map((l) => l.name)).toEqual(["useKit"]);
  });

  test("an export reached by NOBODY is an orphan, not a chain hit (the lenses do not overlap)", () => {
    const project = projectOf({ "packages/server/src/chain/solo.ts": "export const unreached = { id: 1 };\n" });
    expect(collectChainCandidates(project, buildLiveness(project, { edges: true }), inChainScope)).toEqual([]);
    expect(collectOrphanCandidates(project, buildLiveness(project), inChainScope).map((c) => c.name)).toEqual(["unreached"]);
  });

  test("a dead CYCLE terminates and is reported as having no head to fix at", () => {
    // Two declarations that only reach each other: dead, but neither chain ever arrives at an unconsumed
    // head. Without the walk's `seen` guard this loops forever; without reporting them the fixpoint's whole
    // advantage over iterated file reachability is lost (this is the shape no file lens can resolve).
    const project = projectOf({
      "packages/server/src/chain/a.ts": 'import { bee } from "./b";\nexport const ay = (): number => bee();\n',
      "packages/server/src/chain/b.ts": 'import { ay } from "./a";\nexport const bee = (): number => ay();\n',
    });
    const candidates = collectChainCandidates(project, buildLiveness(project, { edges: true }), inChainScope);
    expect(candidates.map((c) => c.name).sort(byString)).toEqual(["ay", "bee"]);
    // Every rendered chain ends on a NON-terminal link — the tell the verb prints as `↺ dead CYCLE`.
    for (const candidate of candidates) {
      expect(candidate.chain.length).toBeGreaterThan(0);
      expect(candidate.chain.at(-1)?.terminal).toBe(false);
    }
  });

  test("a package's own build config is an alive root (it is loaded by TOOLING, not by an import edge)", () => {
    // The other false-positive class the first audit caught: `packages/client/vite.config.ts`'s helpers hung
    // off the config's own default export, which no workspace file imports because VITE loads it. The audited
    // surface is `packages/<pkg>/src/` for exactly this reason.
    const files: Record<string, string> = {
      "packages/server/src/chain/helper.ts": "export const buildHelper = (): number => 1;\n",
      // The real shape: a helper chain living INSIDE the config, whose own top export nothing imports
      // (vite does). Treat the config as audited surface and `buildHelper` reads chain-dead through it.
      "packages/server/vite.config.ts":
        'import { buildHelper } from "./src/chain/helper";\nconst cspMirror = (): number => buildHelper();\nexport const devConfig = { value: cspMirror() };\n',
    };
    expect(chainNames(files)).toEqual([]);
  });

  test("`export default <expression>` CONSUMES what it names (only a bare `export default local` is a hop)", () => {
    // Under-attribution is the one direction this substrate must never take: skipping the whole
    // ExportAssignment left `helper` with no consumer at all, which silently reclassifies a live default
    // export's dependency. A non-identifier default lands at module scope — an alive root.
    const consumed = {
      "packages/server/src/chain/helper.ts": "export const helper = (): number => 1;\n",
      "packages/server/src/chain/config.ts": 'import { helper } from "./helper";\nexport default { value: helper() };\n',
    };
    const project = projectOf(consumed);
    const live = buildLiveness(project, { edges: true });
    expect(collectChainCandidates(project, live, inChainScope)).toEqual([]);
    // …and it is alive because something CONSUMES it, not because nothing reaches it: `orphans` (which has
    // no notion of the default-export hop) agrees `helper` is reached.
    expect(collectOrphanCandidates(project, buildLiveness(project), inChainScope).map((c) => c.name)).not.toContain("helper");
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
      // A test-path consumer of WiredView — pins WHICH shape the client key belongs to without the
      // test knowing the key's format (keys are declaration identities, not names).
      "tests/thing/view.test.ts": 'import type { WiredView } from "../../packages/contracts/src/thing/index"; export const z: WiredView | null = null;',
    });

    const live = buildLiveness(project);
    const contractKeys = (bucket: Set<string>): string[] => keysIn(bucket, "/thing/index.ts");

    // Exactly one shape per bucket, and they are DIFFERENT shapes (per-symbol granularity holds).
    expect(contractKeys(live.usedClientProd)).toHaveLength(1);
    expect(contractKeys(live.usedServerProd)).toHaveLength(1);
    expect(contractKeys(live.usedClientProd)).not.toEqual(contractKeys(live.usedServerProd));
    // The client-consumed shape is WiredView — the test path imports WiredView by name and lands the
    // same identity; OrphanView (server-only) is the clientgap hit.
    expect(contractKeys(live.usedTest)).toEqual(contractKeys(live.usedClientProd));
    // The union stays correct for orphans/testonly/prodonly (both shapes live in usedProd).
    expect(contractKeys(live.usedProd).sort(byString)).toEqual([...contractKeys(live.usedClientProd), ...contractKeys(live.usedServerProd)].sort(byString));
  });
});
