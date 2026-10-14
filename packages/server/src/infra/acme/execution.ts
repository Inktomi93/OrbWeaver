// Native orders are joined through worker exit, including termination during an uncancellable library request.
import { Worker } from "node:worker_threads";
import { crypto as acmeCrypto } from "acme-client";
import type { AcmeIssuerDeps, AcmeWorkerRequest, IssueOutcome, OwnedAcmeIssuer } from "./contract.ts";
import { issueOutcomeSchema } from "./contract.ts";

/** Own native ACME execution without changing the library's process-global HTTP configuration. */
export function createOwnedAcmeIssuer(options: Pick<AcmeIssuerDeps, "directoryUrl" | "polling"> | undefined): OwnedAcmeIssuer {
  const active = new Set<Worker>();
  const pending = new Set<Promise<IssueOutcome>>();
  const terminations = new Set<Promise<number>>();
  let closed = false;
  let disposal: Promise<void> | undefined;
  const terminate = (worker: Worker): void => {
    const stopped = worker.terminate();
    terminations.add(stopped);
    // Keep failures observed until disposal can report every physical termination.
    void stopped.catch(() => undefined);
  };
  const cancel = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const worker of active) {
      terminate(worker);
    }
  };
  return {
    createAccountKey: async (): Promise<string> => {
      if (closed || options === undefined) {
        throw new Error("ACME execution is not configured or is closed");
      }
      return (await acmeCrypto.createPrivateEcdsaKey()).toString("utf-8");
    },
    issue(request, signal): Promise<IssueOutcome> {
      if (closed || options === undefined || signal?.aborted === true) {
        return Promise.resolve({ ok: false, code: "issuance_failed", detail: "ACME execution is not configured or is closed" });
      }
      const operation = new Promise<IssueOutcome>((resolve) => {
        const worker = new Worker(new URL("./order-worker.ts", import.meta.url), {
          workerData: { ...options, request } satisfies AcmeWorkerRequest,
          stdout: true,
          stderr: true,
        });
        active.add(worker);
        const abort = (): void => terminate(worker);
        signal?.addEventListener("abort", abort, { once: true });
        // Library diagnostics may contain request/PEM bytes. They are never forwarded to application logs.
        worker.stdout.resume();
        worker.stderr.resume();
        let outcome: IssueOutcome | undefined;
        worker.on("message", (value: unknown) => {
          const parsed = issueOutcomeSchema.safeParse(value);
          if (parsed.success && outcome === undefined) {
            outcome = parsed.data;
          } else {
            terminate(worker);
          }
        });
        worker.on("error", () => {
          outcome = { ok: false, code: "issuance_failed", detail: "The native ACME order worker failed" };
        });
        worker.once("exit", (code) => {
          signal?.removeEventListener("abort", abort);
          active.delete(worker);
          if (closed || signal?.aborted === true) {
            resolve({ ok: false, code: "issuance_failed", detail: "The native ACME order was cancelled" });
          } else if (code === 0 && outcome !== undefined) {
            resolve(outcome);
          } else {
            resolve({ ok: false, code: "issuance_failed", detail: "The native ACME order ended without a completed result" });
          }
        });
      });
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    cancel,
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= (async (): Promise<void> => {
        cancel();
        const results = await Promise.allSettled([...pending, ...terminations]);
        const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (failures.length > 0) {
          throw new AggregateError(failures, "native ACME execution disposal failed");
        }
      })();
      return disposal;
    },
  };
}
