// The dev server's `/@fs/` path filter (#1483) — a ROOT-CONFIG pin, hence a flat `tests/tooling/` file
// (the `test-layout` gate's exempt non-mirror tier: `packages/client/vite.config.ts` is not under a
// `src/`, so it prefix-swaps to nothing).
//
// WHY THIS IS A TEST AND NOT A READING OF THE ARRAY. `server.fs.allow` is the whole workspace root — the
// monorepo REQUIRES it, because client imports `@orb/*` SOURCE from sibling packages — so `deny` is the
// only thing standing between a `/@fs/` request and every file on disk under that root, including the
// gitignored `data/` dir (the SQLite database and its backup copies, the CAS blob store, derived image
// variants, import reports). A glob list is exactly the kind of thing that reads correct and matches
// wrong, so this asks the config's `devServerServes` — which is vite's OWN `isFileLoadingAllowed` over
// the real allow/deny pair, the same predicate the dev middleware consults — rather than re-implementing
// picomatch here.
//
// IT ASSERTS BOTH DIRECTIONS ON PURPOSE. The `data/**` pattern is ROOT-ANCHORED, and the obvious
// "simplification" back to an unanchored globstar would still pass a denied-only pin while silently
// breaking the dev server: vite matches any deny pattern containing a `/` against the FULL absolute path
// (`matchBase: false`), so an unanchored `data` glob also swallows `packages/client/src/data/**` — the
// client's own data tier. The served arm below is that trap's tripwire, and it is also this file's
// planted positive control: if the predicate ever answered `false` for everything (a broken resolve, a
// wrong root), the denied arm alone would read as a clean pass.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { devServerServes } from "../../packages/client/vite.config.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const serves = async (relative: string): Promise<boolean> => await devServerServes(`${REPO_ROOT}/${relative}`);

describe("the dev server's /@fs/ deny list", () => {
  test.each([
    // The three classes that were reachable before #1483, all under the ONE runtime data dir.
    ["data/variants/01m0jprjygf6fv5s6j2f2366d6/512.avif", "a derived image variant — the same CAS blob /api/blob owner-gates"],
    ["data/import-reports/import-1786225291863.md", "an import report — another user's library, in prose"],
    ["data/orbweaver.db.backup-1787470062790", "a FULL database copy: the `.backup-<ts>` suffix matches no `*.db` glob"],
    ["data/assets/ab/cdef.png", "the CAS blob store itself (denied before #1483 too — it stays denied)"],
    // The floor the data-dir rule must not have displaced.
    [".env", "the environment file — vite's own default floor, re-listed because `deny` REPLACES it"],
    ["data/.credentials-key", "the credential-encryption key: leaking it decrypts every stored provider API key"],
    // A keyfile sits beside whatever db DATABASE_URL names; the e2e and snap stages keep theirs under `.cache/`.
    [".cache/e2e/local/.credentials-key", "the credential-encryption key beside a db outside data/"],
    [".cache/e2e/local/.session-secret", "the password and session pepper beside a db outside data/"],
    ["data/orbweaver.db", "the live SQLite database"],
  ])("refuses to serve %s (%s)", async (relative) => {
    expect(await serves(relative)).toBe(false);
  });

  test.each([
    // THE ANCHORING CONTROL. `packages/client/src/data/` is a real, load-bearing source directory; an
    // unanchored `data` glob would deny it and the dev server would stop serving its own source.
    ["packages/client/src/data/bus/room-registry.ts", "the client's data tier — an unanchored data glob would kill this"],
    ["packages/client/src/main.tsx", "the app entry"],
    // The workspace-source reach that forces `allow` to be the whole root in the first place.
    ["packages/ui/src/primitives/input/input.tsx", "a sibling package's source, served through /@fs/"],
  ])("still serves %s (%s)", async (relative) => {
    expect(await serves(relative)).toBe(true);
  });
});
