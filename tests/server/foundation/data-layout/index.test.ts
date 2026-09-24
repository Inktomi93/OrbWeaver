// foundation/data-layout — the one derivation of every runtime data path from `DATA_DIR`. The slot keys
// keep their override power, and the resolver records which ones the operator set, because the layout
// migration moves only a defaulted slot.

import { DEFAULT_IMPORT_STAGING_DIR } from "@orb/server/domain/import";
import { DATA_LAYOUT_SLOT_KEYS, DEFAULT_DATA_DIR, resolveDataLayout } from "@orb/server/foundation/data-layout";
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

  test("the import domain's own default is the same path the resolver derives", () => {
    expect(DEFAULT_IMPORT_STAGING_DIR).toBe(resolveDataLayout({}).importStaging);
  });
});
