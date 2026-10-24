// @subject packages/server/src/foundation/observability/debug/wire-capture.ts
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { wireCaptureSchema } from "@orb/contracts/debug";
import { expect, test } from "@orb/testkit/node";
import { createTestEnv } from "@orb/testkit/node/composed";

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
    const { createWireCaptureSpill, recordWireCapture } = await import("@orb/server/foundation/observability");
    const marker = `spill-witness-${dataDir.split("-").at(-1) ?? ""}`;
    // The data layout a root's parsed record resolves for this data root, as boot hands it to the spill.
    const layout = createTestEnv({ ["DATA_DIR"]: dataDir }).DATA_LAYOUT;
    recordWireCapture(
      wireCaptureSchema.parse({ api: "chat", wire: "literal", providerId: "spill-witness", model: marker, at: 1, body: { marker } }),
      createWireCaptureSpill(layout.wireCapture),
    );
    const spilled = join(layout.wireCapture, SPILL_FILE);
    expect(spilled.startsWith(dataDir)).toBe(true);
    await expect.poll(() => sizeOf(spilled)).toBeGreaterThan(0);
    expect(await readFile(spilled, "utf8")).toContain(marker);
    expect(await sizeOf(CHECKOUT_SPILL)).toBe(checkoutBefore);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

const mkfifo = promisify(execFile);

test("one graph's blocked spill write never holds another graph's settle", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-wire-spill-graphs-"));
  const blockedDir = join(root, "blocked");
  const freeDir = join(root, "free");
  const blockedFile = join(blockedDir, SPILL_FILE);
  await mkdir(blockedDir);
  // A FIFO holds the append in `open` until a reader arrives, so this graph's write stays pending on a real filesystem.
  await mkfifo("mkfifo", [blockedFile]);
  const { createWireCaptureSpill, recordWireCapture } = await import("@orb/server/foundation/observability");
  const capture = (marker: string): ReturnType<typeof wireCaptureSchema.parse> =>
    wireCaptureSchema.parse({ api: "chat", wire: "literal", providerId: "spill-witness", model: marker, at: 1, body: { marker } });
  const blockedGraph = createWireCaptureSpill(blockedDir);
  const freeGraph = createWireCaptureSpill(freeDir);
  try {
    recordWireCapture(capture("blocked-graph"), blockedGraph);
    recordWireCapture(capture("free-graph"), freeGraph);
    const verdict = await Promise.race([freeGraph.settle().then(() => "settled"), sleep(2000, "stuck")]);
    expect(verdict).toBe("settled");
    expect(await readFile(join(freeDir, SPILL_FILE), "utf8")).toContain("free-graph");
  } finally {
    const drained = readFile(blockedFile, "utf8");
    await blockedGraph.settle();
    expect(await drained).toContain("blocked-graph");
    await rm(root, { recursive: true, force: true });
  }
});
