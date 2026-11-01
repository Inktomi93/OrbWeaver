// The env parse's floor: what an empty environment resolves to, how the data slots read as their effective paths, and which spellings the boolean knobs refuse.
import { DATA_LAYOUT_SKIP_KEY, LEGACY_ENTRIES, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { AUTH_MODE_DEFAULT_FALLBACK } from "@orb/server/foundation/env/record";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { ASSETS_DIR_KEY } from "#server/foundation/data-layout/contract.ts";

// Pinned against an empty environment: a default flipped to "on" would ship capture or tracing into a production box silently.
test("the debug and observability gates default off, with no debug token", () => {
  const env = createTestEnv();
  expect(env.WIRE_CAPTURE).toBe("off");
  expect(env.WIRE_CAPTURE_REPLY).toBe("off");
  expect(env.RPG_TRACE).toBe("off");
  expect(env.DEBUG_TOKEN).toBeUndefined();
});

test("an empty environment boots as single-user with the fallback that mode defaults to, needing no SSO or secret keys", () => {
  const env = createTestEnv();
  expect(env.AUTH_MODE).toBe("single-user");
  expect(env.AUTH_FALLBACK).toBe(AUTH_MODE_DEFAULT_FALLBACK[env.AUTH_MODE]);
});

test("every data slot reads as its effective path, from the default root, a re-rooted tree, and an explicit slot that wins", () => {
  const base = createTestEnv();
  const layout = resolveDataLayout({});
  expect(base.DATA_LAYOUT).toEqual(layout);
  expect([base.DATA_DIR, base.ASSETS_DIR, base.USER_RUNTIME_DIR, base.LOCAL_LIGHT_CACHE_DIR, base.IMPORT_STAGING_DIR]).toEqual([
    layout.root,
    layout.assets,
    layout.users,
    layout.models,
    layout.importStaging,
  ]);

  const rerooted = createTestEnv({ ["DATA_DIR"]: "/srv/orb", [ASSETS_DIR_KEY]: "/blobs" });
  expect(rerooted.DATA_LAYOUT).toEqual(resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", [ASSETS_DIR_KEY]: "/blobs" }));
  expect(rerooted.ASSETS_DIR).toBe("/blobs");
  expect(rerooted.DATABASE_URL).toBe(rerooted.DATA_LAYOUT.databaseUrl);
  expect([...rerooted.DATA_LAYOUT.explicit]).toEqual([ASSETS_DIR_KEY]);
});

test("a DATA_LAYOUT_SKIP the layout refuses is refused at the parse, and the same list without the refused name parses", () => {
  const keyedEntry = Object.entries(LEGACY_ENTRIES).find(([, entry]) => entry.keptBy !== null)?.[0] ?? "";
  expect(() => createTestEnv({ [DATA_LAYOUT_SKIP_KEY]: keyedEntry })).toThrow("which it cannot keep");
  expect(() => createTestEnv({ [DATA_LAYOUT_SKIP_KEY]: "not-a-legacy-entry" })).toThrow("not a legacy entry");
  expect(createTestEnv({ [DATA_LAYOUT_SKIP_KEY]: "" }).DATA_LAYOUT.skip.size).toBe(0);
});

test("LOCAL_LIGHT_CPU_PERCENT takes a whole percentage and refuses every other spelling", () => {
  expect(createTestEnv({ ["LOCAL_LIGHT_CPU_PERCENT"]: "75" }).LOCAL_LIGHT_CPU_PERCENT).toBe(75);
  for (const value of ["0", "101", "50.5", "NaN", "Infinity", ""]) {
    expect(() => createTestEnv({ ["LOCAL_LIGHT_CPU_PERCENT"]: value }), value).toThrow("LOCAL_LIGHT_CPU_PERCENT");
  }
});

// z.stringbool unpinned is case-insensitive and accepts 1/0/yes/no/on/off; adopting it would widen every boolean knob.
test("boolean knobs accept exactly lowercase true and false", () => {
  expect(createTestEnv({ ["CORPUS_AUTOINDEX"]: "false" }).CORPUS_AUTOINDEX).toBe(false);
  expect(createTestEnv({ ["CORPUS_AUTOINDEX"]: "true" }).CORPUS_AUTOINDEX).toBe(true);
  for (const spelling of ["TRUE", "True", "1", "0", "yes", "on", "off", "", " true"]) {
    expect(() => createTestEnv({ ["CORPUS_AUTOINDEX"]: spelling }), JSON.stringify(spelling)).toThrow(EnvRefusedError);
  }
});
