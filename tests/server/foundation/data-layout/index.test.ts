// resolveDataLayout is the one derivation of every runtime path from DATA_DIR; the migration moves only what the operator left defaulted.
import type { DataLayoutInput } from "@orb/server/foundation/data-layout";
import { DATA_LAYOUT_SKIP_KEY, DB_FILE_NAME, DEFAULT_DATA_DIR, LEGACY_ENTRIES, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  ASSETS_DIR_KEY,
  DATABASE_URL_KEY,
  IMPORT_STAGING_DIR_KEY,
  LOCAL_LIGHT_CACHE_DIR_KEY,
  USER_RUNTIME_DIR_KEY,
} from "#server/foundation/data-layout/contract.ts";

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

// Every input key has a row, so a key added to the resolver's input fails tsc here until a case names how it behaves.
const INPUT_KIND: Readonly<Record<keyof DataLayoutInput, "root" | "slot" | "secret" | "skip">> = {
  ["DATA_DIR"]: "root",
  [DATABASE_URL_KEY]: "slot",
  [ASSETS_DIR_KEY]: "slot",
  [LOCAL_LIGHT_CACHE_DIR_KEY]: "slot",
  [USER_RUNTIME_DIR_KEY]: "slot",
  [IMPORT_STAGING_DIR_KEY]: "slot",
  ["CREDENTIALS_KEY"]: "secret",
  ["SESSION_SECRET"]: "secret",
  [DATA_LAYOUT_SKIP_KEY]: "skip",
};
const INPUT_KEYS = Object.keys(INPUT_KIND).filter((key): key is keyof DataLayoutInput => Object.hasOwn(INPUT_KIND, key));
const keysOfKind = (kind: (typeof INPUT_KIND)[keyof DataLayoutInput]): readonly (keyof DataLayoutInput)[] =>
  INPUT_KEYS.filter((key) => INPUT_KIND[key] === kind);

forEachNonEmpty(keysOfKind("slot"), "slot keys", (key) => {
  test(`an explicit ${key} replaces its own slot and lands in the explicit set; an empty value counts as unset`, () => {
    const base = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb" });
    const layout = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", [key]: `/explicit/${key}` });
    expect([...layout.explicit]).toEqual([key]);
    // Exactly one slot differs from the derived tree, and it is the one the key names.
    const differing = Object.entries(layout).filter(([field, value]) => field !== "explicit" && field !== "skip" && value !== Reflect.get(base, field));
    expect(differing.map(([, value]) => value)).toEqual([`/explicit/${key}`]);
    expect(resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", [key]: "" })).toEqual(base);
  });
});

forEachNonEmpty(keysOfKind("secret"), "secret keys", (key) => {
  test(`an explicit ${key} lands in the explicit set without moving any slot; an empty value counts as unset`, () => {
    const base = resolveDataLayout({});
    const layout = resolveDataLayout({ [key]: "ab".repeat(32) });
    expect([...layout.explicit]).toEqual([key]);
    expect({ ...layout, explicit: base.explicit }).toEqual(base);
    expect(resolveDataLayout({ [key]: "" })).toEqual(base);
  });
});

test("a remote DATABASE_URL is carried through untouched", () => {
  const layout = resolveDataLayout({ [DATABASE_URL_KEY]: "libsql://example.invalid/db" });
  expect(layout.databaseUrl).toBe("libsql://example.invalid/db");
  expect(layout.explicit.has(DATABASE_URL_KEY)).toBe(true);
});

test("DATA_LAYOUT_SKIP is a trimmed set of legacy root entries with blanks dropped", () => {
  const [first, second] = keyless;
  expect([first, second]).not.toContain(undefined);
  const layout = resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: ` ${first},${second},, ${DB_FILE_NAME}.backup-17 ` });
  expect(layout.skip).toEqual(new Set([first, second, `${DB_FILE_NAME}.backup-17`]));
  expect([...resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: "" }).skip]).toEqual([]);
});

forEachNonEmpty(keyed, "keyed legacy entries", ({ name, keptBy }) => {
  test(`DATA_LAYOUT_SKIP refuses the keyed entry ${name}, which ${keptBy} keeps in place`, () => {
    expect(() => resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: name })).toThrow();
  });
});

test("DATA_LAYOUT_SKIP refuses a name that is no legacy entry", () => {
  expect(() => resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: `${keyless[0]}-typo` })).toThrow();
  // Control: the exact name is accepted, so the refusal above is the unknown name and not the key.
  expect(resolveDataLayout({ [DATA_LAYOUT_SKIP_KEY]: keyless[0] ?? "" }).skip.size).toBe(1);
});
