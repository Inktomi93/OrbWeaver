// biome-ignore-all lint/suspicious/noBitwiseOperators: the security test crafts a zip-slip archive by hand
// (the CRC-32 unsigned coercion) — intrinsically bitwise, like the fixtures in zip.int.test.ts.

// entry/import/run-bundle-import — the entity-agnostic bundle driver. Pins the load-bearing behavior with a
// TEST-DOUBLE registry (the real descriptors are injected at entry/compose): dependency ORDER (persona
// imports before character, per PORTABLE_IMPORT_ORDER), owner-scoping (every importFile sees the caller's
// ownerId), per-file ISOLATION (a descriptor returning ok:false, or throwing, never aborts the bundle),
// unknown-dir SKIPS (a benign forward-compat file is recorded, not fatal), and — the security pin — a
// HOSTILE archive (zip-slip) is rejected WHOLE by the belt battery so no importFile ever runs.

import type { PortabilityRegistry, PortableEntity, PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { runBundleImport } from "@orb/server/entry/import";
import type { ZipEntry } from "@orb/server/infra/storage";
import { packZip } from "@orb/server/infra/storage";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");
const enc = new TextEncoder();

interface RecordedCall {
  readonly kind: string;
  readonly ownerId: UserId;
  readonly filename: string;
}

/** A fake entity that records every importFile call + returns a scripted outcome. */
function fakeEntity(kind: PortableEntity["kind"], dir: string, calls: RecordedCall[], outcome: (file: PortableFile) => PortableImportOutcome): PortableEntity {
  return {
    kind,
    dir,
    ext: ".json",
    async *exportAll(): AsyncGenerator<PortableFile> {
      // no export in these tests
    },
    importFile: (ownerId, file): Promise<PortableImportOutcome> => {
      calls.push({ kind, ownerId, filename: file.filename });
      return Promise.resolve(outcome(file));
    },
  };
}

async function packBundle(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  async function* iter(): AsyncGenerator<ZipEntry> {
    yield* entries;
  }
  const reader = packZip(iter()).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one awaited read per stream chunk.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

describe("runBundleImport", () => {
  test("imports in PORTABLE_IMPORT_ORDER (persona before character) + owner-scopes every file", async () => {
    const calls: RecordedCall[] = [];
    const registry: PortabilityRegistry = [
      fakeEntity("character", "characters/", calls, () => ({ ok: true, created: true })),
      fakeEntity("persona", "personas/", calls, () => ({ ok: true, created: true })),
    ];
    const archive = await packBundle([
      { path: "characters/Aria.json", bytes: enc.encode("{}") },
      { path: "personas/Me.json", bytes: enc.encode("{}") },
    ]);

    const report = await runBundleImport({ registry, ownerId: OWNER, archive });

    // persona (earlier in PORTABLE_IMPORT_ORDER) is imported before character, regardless of archive order.
    expect(calls.map((c) => c.kind)).toEqual(["persona", "character"]);
    expect(calls.every((c) => c.ownerId === OWNER)).toBe(true);
    expect(report.imported).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
  });

  test("isolates a per-file failure (ok:false) and a throwing descriptor — the bundle continues", async () => {
    const calls: RecordedCall[] = [];
    const registry: PortabilityRegistry = [
      fakeEntity("character", "characters/", calls, (file) =>
        file.filename === "bad.json" ? { ok: false, error: "unreadable card" } : { ok: true, created: true },
      ),
      {
        ...fakeEntity("persona", "personas/", calls, () => ({ ok: true })),
        importFile: (ownerId, file): Promise<PortableImportOutcome> => {
          calls.push({ kind: "persona", ownerId, filename: file.filename });
          throw new Error("descriptor blew up");
        },
      },
    ];
    const archive = await packBundle([
      { path: "characters/good.json", bytes: enc.encode("{}") },
      { path: "characters/bad.json", bytes: enc.encode("{}") },
      { path: "personas/boom.json", bytes: enc.encode("{}") },
    ]);

    const report = await runBundleImport({ registry, ownerId: OWNER, archive });

    expect(report.imported).toBe(1); // characters/good.json
    expect(report.failed).toBe(2); // characters/bad.json (ok:false) + personas/boom.json (threw)
    const boom = report.outcomes.find((o) => o.path === "personas/boom.json");
    expect(boom).toMatchObject({ ok: false, kind: "persona" });
    expect(boom?.error).toContain("descriptor blew up");
  });

  test("records an unknown-dir file as a skip, never fatal", async () => {
    const calls: RecordedCall[] = [];
    const registry: PortabilityRegistry = [fakeEntity("character", "characters/", calls, () => ({ ok: true, created: true }))];
    const archive = await packBundle([
      { path: "characters/Aria.json", bytes: enc.encode("{}") },
      { path: "unknown-kind/x.json", bytes: enc.encode("{}") },
      { path: "toplevel.json", bytes: enc.encode("{}") },
    ]);

    const report = await runBundleImport({ registry, ownerId: OWNER, archive });

    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(2);
    const skips = report.outcomes.filter((o) => o.kind === null);
    expect(skips.map((s) => s.path).sort()).toEqual(["toplevel.json", "unknown-kind/x.json"]);
  });

  test("SECURITY: an aggregate decompression bomb is rejected WHOLE — no importFile runs", async () => {
    const calls: RecordedCall[] = [];
    const registry: PortabilityRegistry = [fakeEntity("character", "characters/", calls, () => ({ ok: true, created: true }))];
    // 40 entries of 64 KiB zeros ≈ 2.6 MiB decompressed; a 1 MiB aggregate cap must abort during extraction,
    // before any file reaches a descriptor's importFile.
    const entries: ZipEntry[] = [];
    for (let i = 0; i < 40; i++) {
      entries.push({ path: `characters/zeros-${i}.png`, bytes: new Uint8Array(64 * 1024) });
    }
    const archive = await packBundle(entries);

    await expect(
      runBundleImport({
        registry,
        ownerId: OWNER,
        archive,
        extractOptions: { maxTotalDecompressedBytes: 1024 * 1024 },
      }),
    ).rejects.toMatchObject({ kind: "bomb" });
    expect(calls).toHaveLength(0);
  });

  test("SECURITY: a zip-slip archive is rejected WHOLE — no importFile runs", async () => {
    const calls: RecordedCall[] = [];
    const registry: PortabilityRegistry = [fakeEntity("character", "characters/", calls, () => ({ ok: true, created: true }))];
    // Craft a minimal store archive whose central-directory name traverses out of the tree.
    const name = "characters/../../etc/passwd";
    const nameBytes = enc.encode(name);
    const payload = enc.encode("owned");
    const crc = (await import("node:zlib")).crc32(payload) >>> 0;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04_03_4b_50, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, payload.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02_01_4b_50, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, payload.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, 0, true);
    central.set(nameBytes, 46);
    const cdOffset = local.length + payload.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06_05_4b_50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, cdOffset, true);
    const archive = new Uint8Array(local.length + payload.length + central.length + eocd.length);
    archive.set(local, 0);
    archive.set(payload, local.length);
    archive.set(central, cdOffset);
    archive.set(eocd, cdOffset + central.length);

    await expect(runBundleImport({ registry, ownerId: OWNER, archive })).rejects.toMatchObject({
      kind: "zip-slip",
    });
    expect(calls).toHaveLength(0);
  });
});
