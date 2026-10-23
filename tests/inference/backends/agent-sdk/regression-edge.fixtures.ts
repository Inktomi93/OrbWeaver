import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SdkScriptSpawn } from "@orb/testkit/node/helpers";
import { createSdkProcessSpawner } from "@orb/testkit/node/helpers";
import { afterEach } from "vitest";

const leases = new Set<AsyncDisposable>();

function cleanupError(error: unknown): Error {
  return error instanceof Error ? error : new Error("controlled SDK cleanup failed", { cause: error });
}

async function cancelAndJoin(children: readonly ChildProcessWithoutNullStreams[], receipts: readonly Promise<void>[]): Promise<Error[]> {
  const failures: Error[] = [];
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) {
      continue;
    }
    try {
      if (!child.kill("SIGTERM")) {
        failures.push(new Error("the controlled SDK child refused its cleanup signal"));
      }
    } catch (error) {
      failures.push(cleanupError(error));
    }
  }
  for (const receipt of await Promise.allSettled(receipts)) {
    if (receipt.status === "rejected") {
      failures.push(cleanupError(receipt.reason));
    }
  }
  return failures;
}

afterEach(async () => {
  const owned = [...leases];
  leases.clear();
  const settled = await Promise.allSettled(owned.map((lease) => lease[Symbol.asyncDispose]()));
  const failures: Error[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      failures.push(cleanupError(result.reason));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "controlled SDK resources did not settle");
  }
});

export interface PhysicalSdkScenario extends AsyncDisposable {
  readonly directory: string;
  readonly children: readonly ChildProcessWithoutNullStreams[];
  readonly args: readonly (readonly string[])[];
  readonly environments: readonly Readonly<Record<string, string | undefined>>[];
  readonly initialized: Promise<void>;
  readonly peak: () => number;
  readonly spawn: SdkScriptSpawn;
}

/** Closed physical replies; native Query still owns decoding, controls and cancellation. */
export function physicalSdkScenario(options: {
  readonly frames?: readonly Record<string, unknown>[];
  readonly models?: readonly Record<string, unknown>[];
  readonly catalogError?: string;
  readonly hang?: boolean;
  readonly delayMs?: number;
}): PhysicalSdkScenario {
  const directory = mkdtempSync(join(tmpdir(), "orb-sdk-regression-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  const closeReceipts: Promise<void>[] = [];
  const closedChildren = new Set<ChildProcessWithoutNullStreams>();
  const args: string[][] = [];
  const environments: Record<string, string | undefined>[] = [];
  let active = 0;
  let peak = 0;
  const initialized = Promise.withResolvers<void>();
  const spawn = createSdkProcessSpawner(new URL("./regression-edge.mjs", import.meta.url), [JSON.stringify(options)]);
  // biome-ignore lint/nursery/useDisposables: ownership transfers to the returned scenario and the test-scope leases, which dispose every entry in afterEach.
  const result = {
    directory,
    children,
    args,
    environments,
    initialized: initialized.promise,
    peak: (): number => peak,
    spawn: ((input): ChildProcessWithoutNullStreams => {
      args.push([...input.args]);
      environments.push({ ...input.env });
      const child = spawn(input);
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.includes('"subtype":"init"')) {
          initialized.resolve();
        }
      });
      children.push(child);
      active += 1;
      peak = Math.max(peak, active);
      closeReceipts.push(
        new Promise<void>((resolve) => {
          child.once("close", () => {
            closedChildren.add(child);
            active -= 1;
            resolve();
          });
        }),
      );
      return child;
    }) satisfies SdkScriptSpawn,
    async [Symbol.asyncDispose](): Promise<void> {
      leases.delete(result);
      const outstanding = children.filter((child) => !closedChildren.has(child));
      const failures: Error[] = [];
      if (outstanding.length > 0) {
        failures.push(new Error("native Query left a controlled SDK child running"));
      }
      failures.push(...(await cancelAndJoin(outstanding, closeReceipts)));
      try {
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        failures.push(cleanupError(error));
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, "native Query left a controlled SDK child running or cleanup failed");
      }
    },
  };
  leases.add(result);
  return result;
}
