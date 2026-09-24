// Mirror unit test for domain/import/substrate/staging — the per-owner staging NAMESPACE (#1534). The
// derivation is shared by the two upload routes (writers) and the import contribution (reader), so its two
// load-bearing properties are pinned here rather than re-asserted at each of the three call sites: DISTINCT
// owners never share a directory (that is the whole authorization story — a handle is a name, and it only
// resolves for the account it was staged for), and the owner id is VALIDATED before it becomes a path
// segment rather than trusted because the mint happens to be safe.

import { join, resolve } from "node:path";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { DEFAULT_IMPORT_STAGING_DIR, stagedOwnerRoot } from "../../../../../packages/server/src/domain/import/substrate/staging.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE = castId<UserId>("01h455vb4pex5vsknk084sn02q");
const BOB = castId<UserId>("01h455vb4pex5vsknk084sn03r");

describe("stagedOwnerRoot", () => {
  test("two owners never resolve to the same directory, and each sits strictly under the root", () => {
    const root = "/srv/orb/staging";
    const alice = stagedOwnerRoot(root, ALICE);
    const bob = stagedOwnerRoot(root, BOB);

    expect(alice).toBe(join(root, ALICE));
    expect(alice).not.toBe(bob);
    // Strict descendants: neither can name the shared root, which is what makes the containment belt's
    // `startsWith(root + sep)` check meaningful per owner.
    expect(alice.startsWith(`${root}/`)).toBe(true);
    expect(bob.startsWith(`${root}/`)).toBe(true);
  });

  test("the root is resolved, so a relative configured root cannot make the owner dir relative", () => {
    expect(stagedOwnerRoot(DEFAULT_IMPORT_STAGING_DIR, ALICE)).toBe(join(resolve(DEFAULT_IMPORT_STAGING_DIR), ALICE));
  });

  // A UserId is a branded string; nothing in the type stops a future mint (or a bad migration) from putting
  // a separator in one. This is a path builder, so it refuses instead of joining.
  test.each([["../../etc"], ["a/b"], ["."], [".."], [""], [".hidden"], ["a\0b"]])("refuses %j as an owner segment", (bad) => {
    expect(() => stagedOwnerRoot("/srv/orb/staging", castId<UserId>(bad))).toThrow(DomainOperationError);
  });

  test("the default staging root is app-owned, never the OS temp dir", () => {
    // A shared, world-listable namespace is not a staging root: any other local process can read an
    // unconsumed upload's bytes out of it.
    expect(DEFAULT_IMPORT_STAGING_DIR).toBe("./data/cache/import-staging");
    expect(DEFAULT_IMPORT_STAGING_DIR.startsWith("/tmp")).toBe(false);
  });
});
