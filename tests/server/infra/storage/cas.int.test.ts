// infra/storage/cas — the per-user content-addressed blob store against the real filesystem (the
// integration lane: real I/O, serial). Pins the D21 per-user keying (owner isolation + same-hash-
// different-owner coexistence), the round-trip, dedup, the path-traversal guards, verify, and the walks.

import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCas } from "@orb/server/infra/storage";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const OWNER_A = castId<UserId>("user_alpha");
const OWNER_B = castId<UserId>("user_beta");
const BYTES = new TextEncoder().encode("orbweaver-cas-fixture-bytes");
const OTHER_BYTES = new TextEncoder().encode("a-different-blob-entirely");
// A fixed injected wall-clock (epoch-ms) — never the ambient clock (determinism).
const NOW = 1_750_000_000_000;
const SHARD_A_END = 2;
const SHARD_B_END = 4;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of iter) {
    out.push(v);
  }
  return out;
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-cas-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("round-trip + dedup", () => {
  test("putBytes stores under the sha-256; read/exists/verify round-trip", async () => {
    const cas = createCas(root);
    const res = await cas.putBytes(OWNER_A, BYTES, NOW);

    expect(res.created).toBe(true);
    expect(res.hash).toBe(sha256Hex(BYTES));
    expect(res.size).toBe(BYTES.byteLength);

    expect(await cas.exists(OWNER_A, res.hash)).toBe(true);
    expect(new Uint8Array(await cas.read(OWNER_A, res.hash))).toEqual(BYTES);
    expect(await cas.verify(OWNER_A, res.hash)).toBe(true);
  });

  test("a second identical put within the owner dedups (created:false), no duplicate blob", async () => {
    const cas = createCas(root);
    const first = await cas.putBytes(OWNER_A, BYTES, NOW);
    const second = await cas.putBytes(OWNER_A, BYTES, NOW);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.hash).toBe(first.hash);
    expect(await collect(cas.listHashes(OWNER_A))).toEqual([first.hash]);
  });
});

describe("the per-user path (D21)", () => {
  test("blobPath is <root>/<owner>/<ab>/<cd>/<hash> and the blob lands there", async () => {
    const cas = createCas(root);
    const { hash } = await cas.putBytes(OWNER_A, BYTES, NOW);

    const expected = join(
      root,
      "user_alpha",
      hash.slice(0, SHARD_A_END),
      hash.slice(SHARD_A_END, SHARD_B_END),
      hash,
    );
    expect(cas.blobPath(OWNER_A, hash)).toBe(expected);
    await expect(stat(expected)).resolves.toBeDefined();
  });
});

describe("owner isolation (D21 — no cross-user oracle)", () => {
  test("one owner's blob is invisible to another (exists:false, read rejects)", async () => {
    const cas = createCas(root);
    const { hash } = await cas.putBytes(OWNER_A, BYTES, NOW);

    expect(await cas.exists(OWNER_B, hash)).toBe(false);
    await expect(cas.read(OWNER_B, hash)).rejects.toThrow();
    expect(cas.blobPath(OWNER_A, hash)).not.toBe(cas.blobPath(OWNER_B, hash));
  });

  test("the same bytes under two owners coexist as two distinct blobs (both created)", async () => {
    const cas = createCas(root);
    const a = await cas.putBytes(OWNER_A, BYTES, NOW);
    const b = await cas.putBytes(OWNER_B, BYTES, NOW);

    expect(a.hash).toBe(b.hash); // same content → same hash
    expect(a.created).toBe(true);
    expect(b.created).toBe(true); // NOT deduped across owners
    expect(new Uint8Array(await cas.read(OWNER_A, a.hash))).toEqual(BYTES);
    expect(new Uint8Array(await cas.read(OWNER_B, b.hash))).toEqual(BYTES);
    expect(await collect(cas.listOwners())).toEqual(
      expect.arrayContaining(["user_alpha", "user_beta"]),
    );
  });
});

describe("remove + verify", () => {
  test("remove deletes the blob and is idempotent", async () => {
    const cas = createCas(root);
    const { hash } = await cas.putBytes(OWNER_A, BYTES, NOW);

    await cas.remove(OWNER_A, hash);
    expect(await cas.exists(OWNER_A, hash)).toBe(false);
    await expect(cas.remove(OWNER_A, hash)).resolves.toBeUndefined(); // idempotent
  });

  test("verify is false for a missing blob and catches silent corruption", async () => {
    const cas = createCas(root);
    const { hash } = await cas.putBytes(OWNER_A, BYTES, NOW);

    expect(await cas.verify(OWNER_A, sha256Hex(OTHER_BYTES))).toBe(false); // missing

    await writeFile(cas.blobPath(OWNER_A, hash), OTHER_BYTES); // tamper in place
    expect(await cas.verify(OWNER_A, hash)).toBe(false); // hash no longer matches the bytes
  });
});

describe("path-traversal guards", () => {
  test("a non-hash throws at path construction (the guard fires before any I/O)", () => {
    const cas = createCas(root);
    expect(() => cas.blobPath(OWNER_A, "not-a-valid-hash")).toThrow();
    // `read` builds the path via the same guard synchronously, so a non-hash throws at the call site.
    expect(() => cas.read(OWNER_A, "../../etc/passwd")).toThrow();
  });

  test("an unsafe owner segment throws (cannot escape the root)", () => {
    const cas = createCas(root);
    const evil = castId<UserId>("../evil");
    expect(() => cas.blobPath(evil, sha256Hex(BYTES))).toThrow();
  });
});
