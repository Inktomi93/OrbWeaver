// resolveDataLayout is the one derivation of every runtime path from DATA_DIR; the migration moves only what the operator left defaulted.
import type { DataLayoutInput } from "@orb/server/foundation/data-layout";
import { DATA_LAYOUT_SKIP_KEY, DB_FILE_NAME, DEFAULT_DATA_DIR, LEGACY_ENTRIES, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";

// Every derived path slot: the file URL and the two explicit-set/skip collections are not paths under the root.
function pathSlots(layout: ReturnType<typeof resolveDataLayout>): readonly string[] {
  const { databaseUrl: _databaseUrl, explicit: _explicit, skip: _skip, ...slots } = layout;
  return Object.values(slots);
}

const keyed = Object.entries(LEGACY_ENTRIES).flatMap(([name, entry]) => (entry.keptBy === null ? [] : [{ name, keptBy: entry.keptBy }]));
const keyless = Object.entries(LEGACY_ENTRIES).flatMap(([name, entry]) => (entry.keptBy === null ? [name] : []));

test("an unset DATA_DIR derives every slot under the default root, spelled relative, with nothing explicit", () => {
  const layout = resolveDataLayout({});
  expect(layout.root).toBe(DEFAULT_DATA_DIR);
  for (const slot of pathSlots(layout)) {
    expect(slot === layout.root || slot.startsWith(`${layout.root}/`), slot).toBe(true);
  }
  expect([...layout.explicit]).toEqual([]);
  expect([...layout.skip]).toEqual([]);
});

test.for(["/srv/orb", "./elsewhere"])("DATA_DIR %s re-roots every derived slot and the database url", (root) => {
  const base = resolveDataLayout({});
  const layout = resolveDataLayout({ ["DATA_DIR"]: root });
  expect(layout.root).toBe(root);
  // Re-rooting changes only the prefix: the tree under the root is the same for every root.
  expect(pathSlots(layout)).toEqual(pathSlots(base).map((slot) => slot.replace(DEFAULT_DATA_DIR, root)));
  expect(layout.databaseUrl).toContain(`${root.replace(/^\./u, "")}/db/${DB_FILE_NAME}`);
});

test("an empty DATA_DIR counts as unset", () => {
  expect(resolveDataLayout({ ["DATA_DIR"]: "" })).toEqual(resolveDataLayout({}));
});

test("each explicit slot key replaces its own slot and lands in the explicit set; an empty value counts as unset", () => {
  const keys = [
    "DATABASE_URL",
    "ASSETS_DIR",
    "LOCAL_LIGHT_CACHE_DIR",
    "USER_RUNTIME_DIR",
    "IMPORT_STAGING_DIR",
  ] as const satisfies readonly (keyof DataLayoutInput)[];
  const base = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb" });
  for (const key of keys) {
    const layout = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", [key]: `/explicit/${key}` });
    expect([...layout.explicit]).toEqual([key]);
    // Exactly one slot differs from the derived tree, and it is the one the key names.
    const differing = Object.entries(layout).filter(([field, value]) => field !== "explicit" && field !== "skip" && value !== Reflect.get(base, field));
    expect(
      differing.map(([, value]) => value),
      key,
    ).toEqual([`/explicit/${key}`]);
    const empty = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", [key]: "" });
    expect(empty).toEqual(base);
  }
  const secrets = resolveDataLayout({ ["CREDENTIALS_KEY"]: "ab".repeat(32), ["SESSION_SECRET"]: "" });
  expect([...secrets.explicit]).toEqual(["CREDENTIALS_KEY"]);
});

test("a remote DATABASE_URL is carried through untouched", () => {
  const layout = resolveDataLayout({ ["DATABASE_URL"]: "libsql://example.invalid/db" });
  expect(layout.databaseUrl).toBe("libsql://example.invalid/db");
  expect(layout.explicit.has("DATABASE_URL")).toBe(true);
});

test("DATA_LAYOUT_SKIP is a trimmed set of legacy root entries with blanks dropped", () => {
  const [first, second] = keyless;
  expect([first, second]).not.toContain(undefined);
  const layout = resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: ` ${first},${second},, ${DB_FILE_NAME}.backup-17 ` });
  expect(layout.skip).toEqual(new Set([first, second, `${DB_FILE_NAME}.backup-17`]));
  expect([...resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: "" }).skip]).toEqual([]);
});

test.for(keyed)("DATA_LAYOUT_SKIP refuses the keyed entry $name, which $keptBy keeps in place", ({ name }) => {
  expect(() => resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: name })).toThrow();
});

test("DATA_LAYOUT_SKIP refuses a name that is no legacy entry", () => {
  expect(() => resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: `${keyless[0]}-typo` })).toThrow();
  // Control: the exact name is accepted, so the refusal above is the unknown name and not the key.
  expect(resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: keyless[0] ?? "" }).skip.size).toBe(1);
});
