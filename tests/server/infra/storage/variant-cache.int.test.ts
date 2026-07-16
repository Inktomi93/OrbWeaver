// infra/storage/variant-cache — the per-user derived-image cache against the real filesystem (integration
// lane). Pins the put/read round-trip, the miss, removeAll, the D21 per-user isolation, and the guards.

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createVariantCache } from "@orb/server/infra/storage";
import { afterEach, beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

const OWNER_A = castId<UserId>("user_alpha");
const OWNER_B = castId<UserId>("user_beta");
// A valid 64-hex CAS key, COMPUTED (never a hardcoded high-entropy literal — `noSecrets`).
const HASH = createHash("sha256").update("orbweaver-variant-key").digest("hex");
const WIDTH = 96;
const ICON_KEY = { kind: "icon" as const, width: WIDTH };
const PORTRAIT_KEY = { kind: "portrait" as const, width: WIDTH };
const WEBP_BYTES = new TextEncoder().encode("pretend-webp-bytes");
const PORTRAIT_WEBP_BYTES = new TextEncoder().encode("pretend-portrait-webp-bytes");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-variant-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("round-trip + miss", () => {
  test("read is undefined on a miss, then returns the bytes after put", async () => {
    const cache = createVariantCache(root);
    expect(await cache.read(OWNER_A, HASH, ICON_KEY)).toBeUndefined();

    await cache.put(OWNER_A, HASH, ICON_KEY, WEBP_BYTES);
    expect(new Uint8Array((await cache.read(OWNER_A, HASH, ICON_KEY)) ?? new Uint8Array())).toEqual(WEBP_BYTES);
  });

  test("removeAll drops every variant of a blob", async () => {
    const cache = createVariantCache(root);
    await cache.put(OWNER_A, HASH, ICON_KEY, WEBP_BYTES);
    await cache.removeAll(OWNER_A, HASH);
    expect(await cache.read(OWNER_A, HASH, ICON_KEY)).toBeUndefined();
  });
});

describe("per-user isolation (D21)", () => {
  test("one owner's variant is invisible to another", async () => {
    const cache = createVariantCache(root);
    await cache.put(OWNER_A, HASH, ICON_KEY, WEBP_BYTES);
    expect(await cache.read(OWNER_B, HASH, ICON_KEY)).toBeUndefined();
  });
});

describe("guards", () => {
  test("an invalid width and a non-hash both throw", async () => {
    const cache = createVariantCache(root);
    await expect(cache.put(OWNER_A, HASH, { kind: "icon", width: 0 }, WEBP_BYTES)).rejects.toThrow();
    await expect(cache.read(OWNER_A, "not-a-hash", ICON_KEY)).resolves.toBeUndefined();
    await expect(cache.removeAll(OWNER_A, "not-a-hash")).rejects.toThrow();
  });
});

// §B.4 — the `kind` discriminator: an `icon` and a `portrait` variant at the SAME width are two
// DISTINCT cache entries (never a collision, even though both round-trip through the same `(owner,hash)`
// per-hash directory that `removeAll` sweeps as one unit).
describe("kind discriminator (icon vs. portrait, #67)", () => {
  test("an icon and a portrait entry at the same width never collide", async () => {
    const cache = createVariantCache(root);
    await cache.put(OWNER_A, HASH, ICON_KEY, WEBP_BYTES);
    await cache.put(OWNER_A, HASH, PORTRAIT_KEY, PORTRAIT_WEBP_BYTES);

    expect(new Uint8Array((await cache.read(OWNER_A, HASH, ICON_KEY)) ?? new Uint8Array())).toEqual(WEBP_BYTES);
    expect(new Uint8Array((await cache.read(OWNER_A, HASH, PORTRAIT_KEY)) ?? new Uint8Array())).toEqual(PORTRAIT_WEBP_BYTES);
  });

  test("removeAll drops BOTH kinds for a blob (one recursive rm of the shared per-hash directory)", async () => {
    const cache = createVariantCache(root);
    await cache.put(OWNER_A, HASH, ICON_KEY, WEBP_BYTES);
    await cache.put(OWNER_A, HASH, PORTRAIT_KEY, PORTRAIT_WEBP_BYTES);
    await cache.removeAll(OWNER_A, HASH);
    expect(await cache.read(OWNER_A, HASH, ICON_KEY)).toBeUndefined();
    expect(await cache.read(OWNER_A, HASH, PORTRAIT_KEY)).toBeUndefined();
  });
});
