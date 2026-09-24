// foundation/data-layout — the one derivation of every runtime data path from `DATA_DIR`. The slot keys
// keep their override power, and the resolver records which ones the operator set, because the layout
// migration moves only a defaulted slot.

import { DEFAULT_IMPORT_STAGING_DIR } from "@orb/server/domain/import";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { DATA_LAYOUT_SLOT_KEYS, DB_FILE_NAME, DEFAULT_DATA_DIR, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("resolveDataLayout", () => {
  test("every slot derives from the default root, keeping the relative spelling", () => {
    const layout = resolveDataLayout({});
    expect(layout.root).toBe(DEFAULT_DATA_DIR);
    expect(layout.databaseUrl).toBe("file:./data/db/orbweaver.db");
    expect(layout.dbDir).toBe("./data/db");
    expect(layout.backups).toBe("./data/backups");
    expect(layout.assets).toBe("./data/assets");
    expect(layout.users).toBe("./data/users");
    expect(layout.secrets).toBe("./data/secrets");
    expect(layout.reports).toBe("./data/reports");
    expect(layout.cache).toBe("./data/cache");
    expect(layout.models).toBe("./data/cache/models/transformers");
    expect(layout.variants).toBe("./data/cache/variants");
    expect(layout.importStaging).toBe("./data/cache/import-staging");
    expect([...layout.explicit]).toEqual([]);
  });

  test("an explicit DATA_DIR re-roots every derived slot, absolute roots included", () => {
    const layout = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb" });
    expect(layout.databaseUrl).toBe("file:/srv/orb/db/orbweaver.db");
    expect(layout.secrets).toBe("/srv/orb/secrets");
    expect(layout.variants).toBe("/srv/orb/cache/variants");
    expect(resolveDataLayout({ ["DATA_DIR"]: "./elsewhere" }).assets).toBe("./elsewhere/assets");
  });

  test("an explicit slot key wins over the root and lands in the explicit set; the rest still derive", () => {
    const layout = resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", ["ASSETS_DIR"]: "/blobs", ["LOCAL_LIGHT_CACHE_DIR"]: "/weights" });
    expect(layout.assets).toBe("/blobs");
    expect(layout.models).toBe("/weights");
    expect([...layout.explicit].sort()).toEqual(["ASSETS_DIR", "LOCAL_LIGHT_CACHE_DIR"]);
    // The variants for an explicit blob root still live under the data root's cache.
    expect(layout.variants).toBe("/srv/orb/cache/variants");
    expect(layout.databaseUrl).toBe("file:/srv/orb/db/orbweaver.db");
  });

  test("every slot key is honoured, and an empty value counts as unset", () => {
    const all = Object.fromEntries(DATA_LAYOUT_SLOT_KEYS.map((key) => [key, `/explicit/${key}`]));
    const layout = resolveDataLayout(all);
    expect([...layout.explicit].sort()).toEqual([...DATA_LAYOUT_SLOT_KEYS].sort());
    expect(layout.databaseUrl).toBe("/explicit/DATABASE_URL");
    expect(layout.importStaging).toBe("/explicit/IMPORT_STAGING_DIR");
    const empty = resolveDataLayout({ ["DATA_DIR"]: "", ["ASSETS_DIR"]: "" });
    expect(empty.root).toBe(DEFAULT_DATA_DIR);
    expect(empty.assets).toBe("./data/assets");
    expect([...empty.explicit]).toEqual([]);
  });

  test("a non-file DATABASE_URL is carried through untouched, so a remote db stays remote", () => {
    const layout = resolveDataLayout({ ["DATABASE_URL"]: "libsql://example.turso.io" });
    expect(layout.databaseUrl).toBe("libsql://example.turso.io");
    expect(layout.explicit.has("DATABASE_URL")).toBe(true);
  });

  test("DATA_LAYOUT_SKIP names keyless legacy root entries as a set, trimmed, with blanks dropped; unset is empty", () => {
    expect([...resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: " import-reports, variants,, orbweaver.db.backup-17 " }).skip].sort()).toEqual([
      "import-reports",
      "orbweaver.db.backup-17",
      "variants",
    ]);
    expect([...resolveDataLayout({}).skip]).toEqual([]);
    expect([...resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: "" }).skip]).toEqual([]);
  });

  // A skipped db would boot onto a fresh empty one, and a skipped keyed entry has a remedy that keeps the app
  // reading it. Each refusal names that entry's real key; an unknown name lists what the key takes.
  test("DATA_LAYOUT_SKIP refuses the db, a keyfile and a keyed slot by naming their keys, and an unknown name by listing the valid ones", () => {
    expect(() => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: DB_FILE_NAME })).toThrow("DATABASE_URL");
    expect(() => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: ".credentials-key" })).toThrow("CREDENTIALS_KEY");
    expect(() => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: ".session-secret" })).toThrow("SESSION_SECRET");
    expect(() => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: "models" })).toThrow("LOCAL_LIGHT_CACHE_DIR");
    expect(() => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: "import-staging" })).toThrow("IMPORT_STAGING_DIR");
    const typo = (): DataLayout => resolveDataLayout({ ["DATA_LAYOUT_SKIP"]: "import-report" });
    expect(typo).toThrow("import-report");
    expect(typo).toThrow("variants");
    expect(typo).toThrow("import-reports");
  });

  // The db's remedy is a value, not only a key: the url that keeps the legacy db under the operator's root.
  test("DATA_LAYOUT_SKIP refuses the db with the DATABASE_URL value that keeps it under the root", () => {
    const refusal = (): DataLayout => resolveDataLayout({ ["DATA_DIR"]: "/srv/orb", ["DATA_LAYOUT_SKIP"]: DB_FILE_NAME });
    expect(refusal).toThrow(`DATABASE_URL=file:/srv/orb/${DB_FILE_NAME} `);
  });

  test("an explicit CREDENTIALS_KEY or SESSION_SECRET lands in the explicit set like a slot key", () => {
    const layout = resolveDataLayout({ ["CREDENTIALS_KEY"]: "ab".repeat(32), ["SESSION_SECRET"]: "" });
    expect([...layout.explicit]).toEqual(["CREDENTIALS_KEY"]);
  });

  test("the import domain's own default is the same path the resolver derives", () => {
    expect(DEFAULT_IMPORT_STAGING_DIR).toBe(resolveDataLayout({}).importStaging);
  });
});
