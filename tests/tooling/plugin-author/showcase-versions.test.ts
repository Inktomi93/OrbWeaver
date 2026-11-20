// A showcase bundle whose bytes changed must ship a newer manifest version, or seeded installs keep the old bytes.
// @subject tooling/src/plugin-author-showcase/index.ts
import { expect, test } from "@orb/testkit/tooling";
import type { ShowcaseRelease } from "../../../tooling/src/plugin-author-showcase/index.ts";
import { loadShowcaseRelease, SHOWCASE_RELEASE_RECEIPT, unbumpedShowcaseBundles } from "../../../tooling/src/plugin-author-showcase/index.ts";

type Planted = Readonly<Record<string, { readonly version: string; readonly main: string }>>;

/** Load a planted tree through the production reader, so the receipt and manifest parsing run too. */
async function release(bundles: Planted): Promise<ShowcaseRelease> {
  const files = new Map<string, string>([
    [
      SHOWCASE_RELEASE_RECEIPT,
      JSON.stringify({ format: 1, bundles: Object.fromEntries(Object.entries(bundles).map(([slug, { main }]) => [slug, { "main.js": main }])) }),
    ],
    ...Object.entries(bundles).map(([slug, { version }]) => [`packages/showcase-plugins/bundles/${slug}/manifest.json`, JSON.stringify({ version })] as const),
  ]);
  return await loadShowcaseRelease(async (path) => {
    const text = files.get(path);
    if (text === undefined) {
      throw new Error(`the planted tree holds no ${path}`);
    }
    return await Promise.resolve(text);
  });
}

test("changed bytes under the same or an older version fail, and a newer version, unchanged bytes and a new bundle pass", async () => {
  const base = await release({
    same: { version: "1.0.9", main: "a" },
    older: { version: "1.2.0", main: "a" },
    bumped: { version: "1.0.9", main: "a" },
    untouched: { version: "1.0.0", main: "a" },
  });
  const current = await release({
    same: { version: "1.0.9", main: "b" },
    older: { version: "1.1.9", main: "b" },
    // Numeric order: a string comparison would read 1.0.10 as older than 1.0.9.
    bumped: { version: "1.0.10", main: "b" },
    untouched: { version: "1.0.0", main: "a" },
    added: { version: "1.0.0", main: "b" },
  });

  expect(unbumpedShowcaseBundles(base, current)).toEqual(["older", "same"]);
});
