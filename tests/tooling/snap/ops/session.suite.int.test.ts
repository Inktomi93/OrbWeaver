// Retained failure traces must carry the native popover's open state and its painted pixels.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_BUDGET_MS = scaledBudget(60_000);
const POPOVER_OPEN_MARKER = "__playwright_popover_open_";
const FIXTURE = `<!doctype html><html data-app-ready="settled"><head><title>popover trace</title><style>
  body { margin:0; background:#000; color:#fff; }
  #popover { position:fixed; inset:100px auto auto 80px; margin:0; width:120px; height:60px; padding:0; border:0; background:#ff00ff; }
  #occluder { position:fixed; inset:100px auto auto 80px; width:120px; height:60px; background:#00ffff; z-index:999999; }
</style></head><body><main><button popovertarget="popover">Open popover</button><div id="occluder"></div>
<div id="popover" popover="manual">Retained popover content</div></main></body></html>`;

interface TraceEvent {
  readonly type: string;
  readonly snapshot?: { readonly html: object };
  readonly sha1?: string;
}

interface TraceIndex {
  readonly artifacts: readonly { readonly channel: string; readonly relativePath: string }[];
}

for (const open of [false, true]) {
  test(`a retained failure trace preserves the popover ${open ? "open" : "closed"} state and pixels`, { timeout: CLI_BUDGET_MS }, async ({
    plantedTree,
    runCli,
  }) => {
    const root = await plantedTree({ "popover.html": FIXTURE });
    const result = await runCli(
      "snap",
      [
        "--file",
        join(root, "popover.html"),
        "--no-shot",
        "--no-deadcss",
        ...(open ? ["--click", "button", "--wait-for", "#popover:popover-open"] : []),
        "--expect-visible",
        "#missing",
      ],
      { timeoutMs: CLI_BUDGET_MS },
    );
    await expect(result).toExitWith(EXIT.violations);
    const indexPath = /RESULT snap exit=\d+ index=(\S+)/u.exec(result.stdout)?.[1];
    expect(indexPath).toBeDefined();
    const index = JSON.parse(await readFile(String(indexPath), "utf8")) as TraceIndex;
    const trace = index.artifacts.find(({ channel }) => channel === "playwright-trace");
    expect(trace).toBeDefined();
    const entries = unzipSync(await readFile(join(dirname(String(indexPath)), String(trace?.relativePath))));
    const events = Object.entries(entries)
      .filter(([name]) => name.endsWith(".trace"))
      .flatMap(([, bytes]) =>
        strFromU8(bytes)
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as TraceEvent),
      );
    const snapshots = events.filter(({ type }) => type === "frame-snapshot");
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.some(({ snapshot }) => JSON.stringify(snapshot?.html).includes(POPOVER_OPEN_MARKER))).toBe(open);
    const frames = events.filter(({ type, sha1 }) => type === "screencast-frame" && sha1 !== undefined);
    expect(frames.length).toBeGreaterThan(0);
    const colours = await Promise.all(
      frames.map(async ({ sha1 }) => {
        const bytes = entries[`resources/${String(sha1)}`];
        expect(bytes).toBeDefined();
        const { data, info } = await Promise.resolve(sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
        const offset = (Math.floor((info.height * 130) / 800) * info.width + Math.floor((info.width * 140) / 1280)) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      }),
    );
    expect(colours.some(([red, green, blue]) => (red ?? 0) > 220 && (green ?? 255) < 30 && (blue ?? 0) > 220)).toBe(open);
  });
}
