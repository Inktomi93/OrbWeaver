// The server source root is the closed six-tier architecture, and every domain follows the per-feature template.
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@orb/testkit/node";

const REPOSITORY = join(import.meta.dirname, "../..");
const SERVER_SOURCE = "packages/server/src";
const DOMAIN = `${SERVER_SOURCE}/domain`;
const NON_AUTHORED = new Set(["node_modules", ".git", "dist", ".cache"]);

interface Entry {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/** Every authored entry beneath a repository-relative directory, at any depth. */
function listTree(directory: string): readonly Entry[] {
  return readdirSync(join(REPOSITORY, directory), { recursive: true, withFileTypes: true }).flatMap((dirent) => {
    const path = relative(REPOSITORY, join(dirent.parentPath, dirent.name));
    const inside = relative(join(REPOSITORY, directory), join(dirent.parentPath, dirent.name));
    return inside.split("/").some((segment) => NON_AUTHORED.has(segment))
      ? []
      : [{ path, kind: dirent.isDirectory() ? ("directory" as const) : ("file" as const) }];
  });
}

/** A tree from a file map: each file plus every directory above it, the way a checkout lists. */
function treeOf(files: Readonly<Record<string, string>>): readonly Entry[] {
  const entries = new Map<string, Entry>();
  for (const path of Object.keys(files)) {
    entries.set(path, { path, kind: "file" });
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      const directory = segments.slice(0, depth).join("/");
      entries.set(directory, { path: directory, kind: "directory" });
    }
  }
  return [...entries.values()];
}

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function directChildren(entries: readonly Entry[], directory: string): readonly Entry[] {
  const prefix = `${directory}/`;
  return entries.filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes("/"));
}

// ── the six-tier root ────────────────────────────────────────────────────────────────────────────────────────

const REQUIRED_TIERS = ["entry", "transport", "domain", "infra", "foundation", "primitives"] as const;
const LEGAL_ROOT_ENTRIES: ReadonlySet<string> = new Set([...REQUIRED_TIERS, "index.ts"]);

/** Two-sided: an entry outside the vocabulary, and a vocabulary member that is absent. */
function rootProblems(rootNames: readonly string[]): readonly string[] {
  const present = new Set(rootNames);
  return [
    ...rootNames.filter((name) => !LEGAL_ROOT_ENTRIES.has(name)).map((name) => `illegal ${name}`),
    ...[...LEGAL_ROOT_ENTRIES].filter((name) => !present.has(name)).map((name) => `missing ${name}`),
  ];
}

const LEGAL_ROOT = [...LEGAL_ROOT_ENTRIES];

test("the server source root holds exactly the six tiers plus index.ts", () => {
  const names = listTree(SERVER_SOURCE)
    .filter((entry) => !entry.path.slice(SERVER_SOURCE.length + 1).includes("/"))
    .map((entry) => basename(entry.path));
  expect(names).toContain("domain");
  expect(rootProblems(names)).toEqual([]);
});

test("a stray file at the server root is illegal", () => {
  expect(rootProblems([...LEGAL_ROOT, "stray.ts"])).toEqual(["illegal stray.ts"]);
});

test("a tier absent from the server root is reported", () => {
  const withoutPrimitives = LEGAL_ROOT.filter((name) => name !== "primitives");
  expect(rootProblems(withoutPrimitives)).toEqual(["missing primitives"]);
});

test("a server root holding only index.ts is missing every tier, one finding per tier", () => {
  expect(rootProblems(["index.ts"])).toEqual(REQUIRED_TIERS.map((tier) => `missing ${tier}`));
});

test("a server root with every tier and index.ts has nothing to report", () => {
  expect(rootProblems(LEGAL_ROOT)).toEqual([]);
});

// ── the per-domain template ──────────────────────────────────────────────────────────────────────────────────

const REQUIRED_FILES = ["index.ts", "service.ts"] as const;

/** Law §4: `context.ts` exists only for dependency adaptation, operation binding or shared-state construction. */
const OPTIONAL_ROOT_FILES = ["context.ts"] as const;
const REQUIRED_DIRS = ["contract", "verbs"] as const;

/** Root slots any domain may carry: the `can()` authority seam, the model-teaching seam and the background-work seam. */
const ALWAYS_ALLOWED_ROOT_FILES = ["guard.ts", "teaching-contribution.ts", "workload-contributions.ts"] as const;

/** Root singletons that fit no verb, substrate or subsystem, each owned by one domain. */
const DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES: Readonly<Record<string, readonly string[]>> = {
  chat: ["bus.ts", "active-turns.ts"],
  rpg: ["bus.ts", "staging.ts", "snapshot-edit.ts", "flush-barrier.ts", "game-mint.ts", "trace.ts"],
  preset: ["constants.ts", "seed.ts"],
  settings: ["constants.ts", "seed-themes.ts"],
  stats: ["reconcile-in-flight.ts"],
};

function domainNames(entries: readonly Entry[]): readonly string[] {
  return directChildren(entries, DOMAIN)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => basename(entry.path))
    .toSorted();
}

function isAllowedRootFile(domain: string, file: string): boolean {
  const required: readonly string[] = REQUIRED_FILES;
  const optional: readonly string[] = OPTIONAL_ROOT_FILES;
  const always: readonly string[] = ALWAYS_ALLOWED_ROOT_FILES;
  return required.includes(file) || optional.includes(file) || always.includes(file) || (DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES[domain] ?? []).includes(file);
}

function templateProblems(entries: readonly Entry[]): readonly string[] {
  const kinds = new Map(entries.map((entry) => [entry.path, entry.kind]));
  return domainNames(entries).flatMap((domain) => {
    const root = `${DOMAIN}/${domain}`;
    return [
      ...REQUIRED_FILES.filter((file) => kinds.get(`${root}/${file}`) !== "file").map((file) => `${domain}: missing ${file}`),
      ...REQUIRED_DIRS.filter((dir) => kinds.get(`${root}/${dir}`) !== "directory").map((dir) => `${domain}: missing ${dir}/`),
      ...directChildren(entries, root)
        .filter((entry) => entry.kind === "file" && !isAllowedRootFile(domain, basename(entry.path)))
        .map((entry) => `${domain}: loose ${basename(entry.path)}`),
    ];
  });
}

/** Both allowlists only shrink: a slot or singleton no domain occupies is a standing permission on a bare name. */
function staleAllowlistProblems(entries: readonly Entry[]): readonly string[] {
  const kinds = new Map(entries.map((entry) => [entry.path, entry.kind]));
  const domains = domainNames(entries);
  return [
    ...ALWAYS_ALLOWED_ROOT_FILES.filter((slot) => !domains.some((domain) => kinds.get(`${DOMAIN}/${domain}/${slot}`) === "file")).map(
      (slot) => `stale slot ${slot}`,
    ),
    ...Object.entries(DOMAIN_SPECIFIC_ALLOWED_ROOT_FILES).flatMap(([domain, files]) =>
      domains.includes(domain)
        ? files.filter((file) => kinds.get(`${DOMAIN}/${domain}/${file}`) !== "file").map((file) => `stale ${domain}/${file}`)
        : [`stale domain ${domain}`],
    ),
  ];
}

const domainFiles = (domain: string, ...paths: readonly string[]): Record<string, string> =>
  Object.fromEntries(paths.map((path) => [`${DOMAIN}/${domain}/${path}`, "export const x = 1;\n"]));
const wholeDomain = (domain: string): Record<string, string> => domainFiles(domain, "index.ts", "service.ts", "contract/service.ts", "verbs/x.ts");

test("every real domain follows the template and every allowlisted root name is occupied", () => {
  const entries = listTree(DOMAIN);
  expect(domainNames(entries)).toContain("chat");
  expect(templateProblems(entries)).toEqual([]);
  expect(staleAllowlistProblems(entries)).toEqual([]);
});

test("a domain holding only index.ts is missing the other required slots", () => {
  expect(templateProblems(treeOf(domainFiles("broken", "index.ts")))).toEqual([
    "broken: missing service.ts",
    "broken: missing contract/",
    "broken: missing verbs/",
  ]);
});

test("a domain with every slot plus a non-template root file reports the loose file", () => {
  expect(templateProblems(treeOf({ ...wholeDomain("loose"), ...domainFiles("loose", "helpers.ts") }))).toEqual(["loose: loose helpers.ts"]);
});

test("a domain may carry the optional context.ts", () => {
  expect(templateProblems(treeOf({ ...wholeDomain("adapted"), ...domainFiles("adapted", "context.ts") }))).toEqual([]);
});

test("a domain with every slot and nothing else passes", () => {
  expect(templateProblems(treeOf(wholeDomain("whole")))).toEqual([]);
});

test("allowlist rows and slots that no domain occupies are stale", () => {
  const entries = treeOf({ ...wholeDomain("chat"), ...domainFiles("chat", "guard.ts", "bus.ts") });
  expect(templateProblems(entries)).toEqual([]);
  expect(staleAllowlistProblems(entries)).toEqual([
    "stale slot teaching-contribution.ts",
    "stale slot workload-contributions.ts",
    "stale chat/active-turns.ts",
    "stale domain rpg",
    "stale domain preset",
    "stale domain settings",
    "stale domain stats",
  ]);
});
