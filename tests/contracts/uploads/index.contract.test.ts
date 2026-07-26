import {
  ASSET_UPLOAD_MAX_BYTES,
  DATABANK_UPLOAD_MAX_BYTES,
  DEFAULT_UPLOAD_CAPS,
  IMPORT_MAX_DECOMPRESSED_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
  resolveUploadCaps,
} from "@orb/contracts/uploads";
import { expect, test } from "../../support/fixtures";

const MIB = 1024 * 1024;

// ── The byte-identical cap catalog: the ONE source every upload boundary derives from ───────────────────
test("the cap catalog pins the exact byte values (byte-identical to the pre-consolidation server truth)", () => {
  expect(ASSET_UPLOAD_MAX_BYTES).toBe(64 * MIB);
  expect(DATABANK_UPLOAD_MAX_BYTES).toBe(20 * MIB);
  expect(IMPORT_MAX_TOTAL_BYTES).toBe(256 * MIB);
  expect(IMPORT_MAX_DECOMPRESSED_BYTES).toBe(10_240 * MIB); // 10 GiB zip-bomb floor
});

// ── The served defaults: byte-identical to the raw constants (the client fallback never invents a number) ─
test("DEFAULT_UPLOAD_CAPS mirrors the raw constants exactly", () => {
  expect(DEFAULT_UPLOAD_CAPS).toEqual({
    assetUpload: ASSET_UPLOAD_MAX_BYTES,
    image: ASSET_UPLOAD_MAX_BYTES,
    databankUpload: DATABANK_UPLOAD_MAX_BYTES,
    importTotal: IMPORT_MAX_TOTAL_BYTES,
  });
});

// ── resolveUploadCaps: the image cap is the TIGHTER of the route cap and the admin maxImageBytes ─────────
test("resolveUploadCaps clamps the image cap to a tighter maxImageBytes", () => {
  const tighter = 5 * MIB;
  const caps = resolveUploadCaps(tighter);
  expect(caps.image).toBe(tighter);
  // Only the image cap is clamped; the others are the fixed route/runner caps.
  expect(caps.assetUpload).toBe(ASSET_UPLOAD_MAX_BYTES);
  expect(caps.databankUpload).toBe(DATABANK_UPLOAD_MAX_BYTES);
  expect(caps.importTotal).toBe(IMPORT_MAX_TOTAL_BYTES);
});

test("resolveUploadCaps keeps the route cap when maxImageBytes is looser", () => {
  const looser = 500 * MIB;
  expect(resolveUploadCaps(looser).image).toBe(ASSET_UPLOAD_MAX_BYTES);
});
