// @subject packages/db/src/schema/index.ts
// Schema module layout (Tier-1-DB.md): the barrel re-exports every schema module, and each module is named for the
// server domain that produces its rows.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// biome-ignore lint/performance/noNamespaceImport: the barrel's full export set is the denominator the layout is judged against.
import * as barrel from "@orb/db/schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const SCHEMA_DIR = join(import.meta.dirname, "../../../packages/db/src/schema");
const DOMAIN_DIR = join(import.meta.dirname, "../../../packages/server/src/domain");
const BARREL_FILE = "index.ts";

/** Top-level schema modules by name. Nested files and the barrel itself are not modules. */
function moduleNames(): readonly string[] {
  return readdirSync(SCHEMA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && entry.name !== BARREL_FILE)
    .map((entry) => entry.name.slice(0, -".ts".length))
    .toSorted();
}

function domainNames(): ReadonlySet<string> {
  return new Set(
    readdirSync(DOMAIN_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
}

/**
 * A module whose exports are not all present, by identity, in the barrel silently drops those tables from
 * `typeof schema` and from the relational query API. A module with no runtime export cannot be proven, so it is a finding too.
 */
function notReexported(modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>, exported: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.entries(modules).flatMap(([name, exports]) => {
    const entries = Object.entries(exports);
    return entries.length === 0 ? [`${name} (no runtime export)`] : entries.filter(([key, value]) => exported[key] !== value).map(([key]) => `${name}.${key}`);
  });
}

/** A module with no same-named producer domain and no reviewed non-domain ruling. */
function withoutProducer(modules: readonly string[], domains: ReadonlySet<string>, nonDomain: Readonly<Record<string, string>>): readonly string[] {
  return modules.filter((name) => !(domains.has(name) || Object.hasOwn(nonDomain, name)));
}

/** A ruling for a module that has since gained its domain or gone away no longer licenses anything. */
function staleRulings(modules: readonly string[], domains: ReadonlySet<string>, nonDomain: Readonly<Record<string, string>>): readonly string[] {
  return Object.keys(nonDomain).filter((name) => !modules.includes(name) || domains.has(name));
}

/** Schema modules whose rows are produced outside a same-named domain. One reason each. */
const NON_DOMAIN_PRODUCERS = {
  users: "reserved cross-cutting schema: identity rows belong to no single producer domain",
  audit: "reserved cross-cutting schema: every domain writes the audit log",
  relations: "reserved cross-cutting schema: the relational query definitions span every table",
  gallery: "the assets domain owns gallery presentation rows",
  "rate-limit": "transport owns limiter rows; a rate-limit domain would collapse the transport tier",
  "connection-bindings": "domain/connection produces these tables; they live apart from connection.ts only to break an import cycle",
  "sdk-session": "connection owns durable SDK lineage through its injected persistence writer; a satellite file avoids a connection/chat FK cycle",
} as const satisfies Readonly<Record<string, string>>;

async function loadModules(names: readonly string[]): Promise<Readonly<Record<string, Readonly<Record<string, unknown>>>>> {
  const loaded = await Promise.all(
    names.map(async (name): Promise<readonly [string, Record<string, unknown>]> => [name, await import(pathToFileURL(join(SCHEMA_DIR, `${name}.ts`)).href)]),
  );
  return Object.fromEntries(loaded);
}

// ── the real tree ────────────────────────────────────────────────────────────────────────────────────
test("the barrel re-exports every export of every schema module", async () => {
  const names = moduleNames();
  expect(names.length).toBeGreaterThan(0);
  expect(notReexported(await loadModules(names), barrel)).toEqual([]);
});

test("every schema module is named for its producer domain or carries a reviewed non-domain ruling", () => {
  const names = moduleNames();
  expect(names.length).toBeGreaterThan(0);
  expect(domainNames().size).toBeGreaterThan(0);
  expect(withoutProducer(names, domainNames(), NON_DOMAIN_PRODUCERS)).toEqual([]);
  expect(staleRulings(names, domainNames(), NON_DOMAIN_PRODUCERS)).toEqual([]);
});

// ── controls ─────────────────────────────────────────────────────────────────────────────────────────
test("a module omitted from the barrel, or any module under an empty barrel, is flagged; a re-exported module passes", () => {
  const modules = { orphan: { t: 1 }, thing: { u: 2 } };
  expect(notReexported(modules, { u: 2 })).toEqual(["orphan.t"]);
  expect(notReexported(modules, {})).toEqual(["orphan.t", "thing.u"]);
  expect(notReexported({ thing: { u: 2 } }, { u: 2 })).toEqual([]);
  expect(notReexported({ typesOnly: {} }, {})).toEqual(["typesOnly (no runtime export)"]);
});

test("a module with neither a same-named domain nor a ruling is flagged, and a ruling that no longer binds is stale", () => {
  const domains = new Set(["thing", "other"]);
  expect(withoutProducer(["nowhere", "thing"], domains, {})).toEqual(["nowhere"]);
  expect(withoutProducer(["nowhere", "thing"], domains, { nowhere: "reviewed" })).toEqual([]);
  expect(staleRulings(["thing", "nowhere"], domains, { thing: "gained its domain", gone: "file removed", nowhere: "still binds" })).toEqual(["thing", "gone"]);
});
