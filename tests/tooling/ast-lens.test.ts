// Self-test for the `pnpm ast` rot lenses (scripts/codemods/ast.ts) — unwired, clientgap, the orphan
// substrate, swallowed, respell, and typeonly-alive. Each drives the pure enumeration substrate over a tiny
// synthetic project (a server router with one WIRED and one UNWIRED procedure; a namespace-swallowed schema
// barrel; a derived-vs-hand-spelled contract pair; a value export reached only from type positions) and
// asserts the lens flags EXACTLY the defect shape — bite-proof in both directions, never a sketch.

import { Project } from "ts-morph";
import { describe } from "vitest";
import type { SwallowedCandidate } from "../../scripts/codemods/ast.ts";
import {
  assignabilityChecker,
  buildLiveness,
  collectClientConsumed,
  collectOrphanCandidates,
  collectServerProcedures,
  collectSwallowedCandidates,
  collectTypeOnlyCandidates,
  isProdConsumed,
  isSwallowedExempt,
  isTypeOnlyExempt,
  isUnwiredExempt,
  respellHitsFor,
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
