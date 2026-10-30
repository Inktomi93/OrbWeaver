// The import domain's fallback staging root is the path the data layout derives for it, so a caller that omits the root stages where the layout expects.
import { DEFAULT_IMPORT_STAGING_DIR } from "@orb/server/domain/import";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";

test("the import domain's default staging root is the layout's own import-staging slot", () => {
  expect(DEFAULT_IMPORT_STAGING_DIR).toBe(resolveDataLayout({}).importStaging);
});
