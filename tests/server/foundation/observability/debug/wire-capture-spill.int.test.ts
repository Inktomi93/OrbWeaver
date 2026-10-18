// @subject packages/server/src/foundation/observability/debug/wire-capture.ts
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { wireCaptureSchema } from "@orb/contracts/debug";
import { DATA_LAYOUT_DIRS } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

const SPILL_FILE = "captures.jsonl";
// A stack started from a checkout used to spill here; private request bodies must never reach it.
const CHECKOUT_SPILL = join(process.cwd(), ".cache", "wire-capture", SPILL_FILE);

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

test("a wire capture spills under the data root and never into the process checkout", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "orb-wire-spill-"));
  try {
    const checkoutBefore = await sizeOf(CHECKOUT_SPILL);
    vi.stubEnv("DATA_DIR", dataDir);
    vi.resetModules();
    const { recordWireCapture } = await import("@orb/server/foundation/observability");
    const marker = `spill-witness-${dataDir.split("-").at(-1) ?? ""}`;
    recordWireCapture(wireCaptureSchema.parse({ api: "chat", wire: "literal", providerId: "spill-witness", model: marker, at: 1, body: { marker } }));
    const spilled = join(dataDir, DATA_LAYOUT_DIRS.wireCapture, SPILL_FILE);
    await expect.poll(() => sizeOf(spilled)).toBeGreaterThan(0);
    expect(await readFile(spilled, "utf8")).toContain(marker);
    expect(await sizeOf(CHECKOUT_SPILL)).toBe(checkoutBefore);
  } finally {
    vi.unstubAllEnvs();
    await rm(dataDir, { recursive: true, force: true });
  }
});
