// Only the physical executable varies; installed Query, seed import and owned child completion remain real.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentSdkSpawn } from "@orb/inference";
import { z } from "zod";
import {
  CORPUS_SDK_DEFER_EXIT,
  CORPUS_SDK_EMPTY,
  CORPUS_SDK_EOF,
  CORPUS_SDK_HOLD,
  CORPUS_SDK_QUERY,
  CORPUS_SDK_RECEIPT,
  CORPUS_SDK_REUSE,
} from "./corpus-sdk-protocol.ts";
import { createSdkProcessSpawner } from "./sdk-process.ts";

const receiptSchema = z.object({ sessionId: z.uuid(), resume: z.uuid().nullable(), frames: z.array(z.json()), prompt: z.string() });

/** Observe external protocol receipts and physical close without replacing a native process or Query. */
export function createCorpusSdkExecution(controls: { readonly deferHoldExit?: boolean } = {}): {
  readonly spawn: AgentSdkSpawn;
  readonly receipts: readonly z.infer<typeof receiptSchema>[];
  readonly children: readonly ChildProcessWithoutNullStreams[];
  readonly holding: Promise<void>;
  readonly settle: () => Promise<void>;
  readonly eof: Promise<void>;
  readonly releaseHeldExit: () => void;
} {
  const receipts: z.infer<typeof receiptSchema>[] = [];
  const children: ChildProcessWithoutNullStreams[] = [];
  const closes: Promise<void>[] = [];
  const holding = Promise.withResolvers<void>();
  const eof = Promise.withResolvers<void>();
  const pendingPrompts =
    controls.deferHoldExit === true
      ? [CORPUS_SDK_HOLD]
      : [
          CORPUS_SDK_EMPTY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_REUSE,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_QUERY,
          CORPUS_SDK_HOLD,
        ];
  const failures: Error[] = [];
  const observeLine = (line: string): void => {
    if (line === CORPUS_SDK_EOF) {
      eof.resolve();
    }
    if (!line.startsWith(CORPUS_SDK_RECEIPT)) {
      return;
    }
    const receipt = receiptSchema.parse(JSON.parse(line.slice(CORPUS_SDK_RECEIPT.length)));
    if (pendingPrompts.shift() !== receipt.prompt) {
      failures.push(new Error("the finite physical SDK corpus prompt plan diverged"));
    }
    receipts.push(receipt);
    if (receipt.prompt === CORPUS_SDK_HOLD) {
      holding.resolve();
    }
  };
  return {
    receipts,
    children,
    holding: holding.promise,
    eof: eof.promise,
    releaseHeldExit: (): void => {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGUSR1");
        }
      }
    },
    spawn: (options): ChildProcessWithoutNullStreams => {
      const args = controls.deferHoldExit === true ? [...options.args, CORPUS_SDK_DEFER_EXIT] : options.args;
      const child = createSdkProcessSpawner(new URL("./corpus-sdk-child.mjs", import.meta.url), args)(options);
      children.push(child);
      closes.push(new Promise((resolve) => child.once("close", () => resolve())));
      let pending = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (text: string) => {
        pending += text;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          observeLine(line);
        }
      });
      return child;
    },
    settle: async (): Promise<void> => {
      await Promise.all(closes);
      if (failures.length > 0 || pendingPrompts.length > 0) {
        throw new AggregateError(failures, "the finite physical SDK corpus execution did not complete its exact plan");
      }
    },
  };
}
