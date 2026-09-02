// domain/import/loader/collect — #763 fault-injection: every best-effort collector arm that swallows a
// staged-file read failure must distinguish a genuinely MISSING file (`ENOENT`) or a corrupt-FORMAT file
// (unparseable JSON) — both documented, both preserved as "treat as absent/default" — from an fs
// INFRASTRUCTURE failure (`EACCES`/`EIO`/`ELOOP`/…). Folding an infra failure into the same fallback used
// to produce an INCOMPLETE import that still reported success; now it rejects with `ImportInfraFailureError`
// naming the affected path + operation. Table-driven over the 8 catch arms `collect.ts` carries (verified
// exactly 8 via `grep -n catch packages/server/src/domain/import/loader/collect.ts` while authoring this).

import type { ImportFsPort } from "@orb/server/domain/import";
import { collectBundlesFromDir, ImportInfraFailureError } from "@orb/server/domain/import";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const ENC = new TextEncoder();
const SETTINGS_PATH = "root/settings.json";
const AVATAR_PATH = "root/User Avatars/avatar1.png";
const GROUP_LEAF_PATH = "root/group chats/leaf1.jsonl";

/** A coded fs error — the shape `NodeJS.ErrnoException` carries (`.code`), which is what `isInfraFailure`
 *  keys on. A plain `Error` (no `.code`) models the corrupt-format case (`JSON.parse` throws a bare
 *  `SyntaxError`); `new FsError("ENOENT")` models the documented "missing" case. */
class FsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const BASE_FILES: Record<string, Uint8Array> = {
  // biome-ignore lint/style/useNamingConvention: ST wire field names (snake_case) are the interchange format and appear verbatim in the fixtures.
  [SETTINGS_PATH]: ENC.encode(JSON.stringify({ power_user: { personas: { "avatar1.png": "Alice" } } })),
  [AVATAR_PATH]: ENC.encode("avatar-bytes"),
  "root/groups/g1.json": ENC.encode(JSON.stringify({ members: ["a.png"], chats: ["leaf1"] })),
  // biome-ignore lint/style/useNamingConvention: ST wire field names (snake_case) are the interchange format and appear verbatim in the fixtures.
  [GROUP_LEAF_PATH]: ENC.encode(JSON.stringify({ user_name: "u", character_name: "c", create_date: "2025-07-18@12h00m00s" })),
};

/** An in-memory `ImportFsPort` over a flat path→bytes map — mirrors the real node port's `readdir` contract
 *  (never throws; resolves `[]` for a missing dir) so an absent optional dir behaves like production. */
function memoryFs(files: Record<string, Uint8Array>): ImportFsPort {
  const fileSet = new Map(Object.entries(files));
  return {
    readdir: (dir): ReturnType<ImportFsPort["readdir"]> => {
      const children = new Map<string, "file" | "directory">();
      for (const path of fileSet.keys()) {
        if (path.startsWith(`${dir}/`)) {
          const rest = path.slice(dir.length + 1);
          const name = rest.split("/")[0] ?? rest;
          children.set(name, rest.includes("/") ? "directory" : "file");
        }
      }
      return Promise.resolve([...children].map(([name, kind]) => ({ name, kind })));
    },
    readFile: (path): Promise<Uint8Array> => {
      const bytes = fileSet.get(path);
      return bytes === undefined ? Promise.reject(new FsError("ENOENT")) : Promise.resolve(bytes);
    },
    stat: (path): Promise<{ readonly size: number }> => {
      const bytes = fileSet.get(path);
      return bytes === undefined ? Promise.reject(new FsError("ENOENT")) : Promise.resolve({ size: bytes.byteLength });
    },
    join: (...parts): string => parts.join("/"),
  };
}

/** Wrap `base` so the Nth `readFile` of `path` rejects with `error` — every other call (including EARLIER
 *  reads of the SAME path) delegates normally. Six of the eight #763 arms independently re-read
 *  `settings.json`; this targets exactly one arm's catch block per test without disturbing the others. */
function failNthRead(base: ImportFsPort, path: string, n: number, error: Error): ImportFsPort {
  let count = 0;
  return {
    ...base,
    readFile: (p): Promise<Uint8Array> => {
      if (p !== path) {
        return base.readFile(p);
      }
      count += 1;
      return count === n ? Promise.reject(error) : base.readFile(p);
    },
  };
}

/** Wrap `base` so every `readFile` of `path` rejects with `error` — for the two arms whose failing file is
 *  read exactly once (the group-chat leaf, a persona avatar), no counting is needed. */
function failRead(base: ImportFsPort, path: string, error: Error): ImportFsPort {
  return { ...base, readFile: (p) => (p === path ? Promise.reject(error) : base.readFile(p)) };
}

describe("collectBundlesFromDir — #763 infra-failure fault injection", () => {
  // The settings.json-reading arms, in the exact sequential order collectBundlesFromDir calls them —
  // `failNthRead`'s counter targets the Nth call, so ordering here must match the source's call order.
  const settingsJsonArms: { readonly name: string; readonly nthCall: number }[] = [
    { name: "collectSettingsPreset (collect.ts:327)", nthCall: 1 },
    { name: "collectUnhandled (collect.ts:423)", nthCall: 2 },
    { name: "collectPersonas outer read (collect.ts:564)", nthCall: 3 },
    { name: "collectTags (collect.ts:552)", nthCall: 4 },
    { name: "collectAppearance (collect.ts:435)", nthCall: 5 },
    { name: "readSettingsJson via collectGlobalRegexScripts (collect.ts:460)", nthCall: 6 },
  ];

  for (const arm of settingsJsonArms) {
    test(`rejects with ImportInfraFailureError when ${arm.name} hits EACCES reading settings.json`, async () => {
      const fs = failNthRead(memoryFs(BASE_FILES), SETTINGS_PATH, arm.nthCall, new FsError("EACCES"));

      const error: unknown = await collectBundlesFromDir(fs, "root").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ImportInfraFailureError);
      expect(error).toMatchObject({ path: SETTINGS_PATH, operation: "readFile" });
    });
  }

  test("rejects with ImportInfraFailureError when the group-chat leaf read hits EIO (collect.ts:361)", async () => {
    const fs = failRead(memoryFs(BASE_FILES), GROUP_LEAF_PATH, new FsError("EIO"));

    const error: unknown = await collectBundlesFromDir(fs, "root").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ImportInfraFailureError);
    expect(error).toMatchObject({ path: GROUP_LEAF_PATH, operation: "readFile" });
  });

  test("rejects with ImportInfraFailureError when a persona avatar read hits EACCES (collect.ts:575)", async () => {
    const fs = failRead(memoryFs(BASE_FILES), AVATAR_PATH, new FsError("EACCES"));

    const error: unknown = await collectBundlesFromDir(fs, "root").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ImportInfraFailureError);
    expect(error).toMatchObject({ path: AVATAR_PATH, operation: "readFile" });
  });

  test("still tolerates a genuinely missing settings.json (ENOENT) — no regression from the fail-closed change", async () => {
    const { [SETTINGS_PATH]: _settings, ...withoutSettings } = BASE_FILES;
    const fs = memoryFs(withoutSettings);

    const result = await collectBundlesFromDir(fs, "root");

    expect(result.personas).toEqual([]);
    expect(result.appearance).toEqual({});
  });

  test("still tolerates a corrupt-FORMAT settings.json (unparseable JSON, no fs .code) — the documented fallback survives", async () => {
    const fs = memoryFs({ ...BASE_FILES, [SETTINGS_PATH]: ENC.encode("{not valid json") });

    const result = await collectBundlesFromDir(fs, "root");

    expect(result.personas).toEqual([]);
    expect(result.appearance).toEqual({});
  });

  test("still tolerates a genuinely missing persona avatar (ENOENT) — an avatar-less persona, not a rejection", async () => {
    const { [AVATAR_PATH]: _avatar, ...withoutAvatar } = BASE_FILES;
    const fs = memoryFs(withoutAvatar);

    const result = await collectBundlesFromDir(fs, "root");

    expect(result.personas).toEqual([{ parsed: expect.objectContaining({ name: "Alice", avatarFile: "avatar1.png" }) }]);
  });
});
