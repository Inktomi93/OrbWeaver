// Own native Query cleanup and actual child close receipts; never replace the omitted SDK spawn.

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { errorMessage } from "@orb/kit/error-message";
import { ProviderError } from "#contract";
import type { AgentSdkExecution, AgentSdkExecutionDeps, AgentSdkQueryLease } from "#src/contract/agent-sdk-execution.ts";
import { resolvedScrubSet, sanitizeApiError } from "../http/sanitize.ts";
import { redactSecretsFromText } from "../wire/openai-body.ts";
import { SdkStderr } from "./stderr.ts";

/** Publish ownership before native query construction, including deferred spawns and construction failures. */
export function createAgentSdkExecution(deps: AgentSdkExecutionDeps): AgentSdkExecution {
  const active = new Set<OwnedQuery>();
  const failures: Error[] = [];
  let cancelled = false;
  const recordFailure = (error: Error): void => {
    failures.push(error);
    deps.log.error({ error: error.message }, "agent-sdk: query cleanup failed");
  };
  const cancel = (): void => {
    cancelled = true;
    for (const owner of active) {
      owner.cancel();
    }
  };
  return {
    open: (connection, input, signal): AgentSdkQueryLease => {
      if (cancelled) {
        throw new ProviderError({ kind: "aborted", retryable: false, message: "agent-sdk: execution scope is closed" });
      }
      const owner = new OwnedQuery([connection, input, signal], deps, recordFailure, () => active.delete(owner));
      active.add(owner);
      return owner.open();
    },
    cancel,
    settle: async (): Promise<void> => {
      cancel();
      await Promise.all([...active].map((owner) => owner.close()));
      if (failures.length > 0) {
        throw new AggregateError(failures, "agent-sdk: owned query cleanup failed");
      }
    },
  };
}

class OwnedQuery {
  private readonly controller = new AbortController();
  private readonly children = new Set<Promise<void>>();
  private readonly constructed = Promise.withResolvers<void>();
  private readonly exitFailures = new WeakSet<Error>();
  private physicalChild: ChildProcessWithoutNullStreams | undefined;
  private readonly secrets;
  private readonly stderr;
  private readonly privateStderr;
  private readonly stdoutRecords;
  private query: ReturnType<AgentSdkExecutionDeps["query"]> | undefined;
  private closing: Promise<void> | undefined;
  private readonly abort = (): void => this.cancel();

  private readonly input: Parameters<AgentSdkExecutionDeps["query"]>[0];
  private readonly signal: AbortSignal | undefined;
  private readonly deps: AgentSdkExecutionDeps;
  private readonly recordFailure: (error: Error) => void;
  private readonly release: () => void;

  constructor(
    [connection, input, signal]: Parameters<AgentSdkExecution["open"]>,
    deps: AgentSdkExecutionDeps,
    recordFailure: (error: Error) => void,
    release: () => void,
  ) {
    this.input = input;
    this.signal = signal;
    this.deps = deps;
    this.recordFailure = recordFailure;
    this.release = release;
    this.secrets = resolvedScrubSet({ credential: connection.credential, transport: null });
    this.stderr = new SdkStderr(this.secrets, input.options?.stderr);
    this.privateStderr = new SdkStderr(this.secrets);
    // Native readline removes CR/LF before these diagnostic records reach the owner.
    this.stdoutRecords = new SdkStderr(this.secrets.flatMap((secret) => [secret, ...secret.split(/\r\n|\r|\n/u).filter((part) => part.length > 0)]));
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted === true) {
      this.controller.abort();
    }
  }

  open(): AgentSdkQueryLease {
    try {
      const spawn = this.deps.spawn;
      const options = {
        ...this.input.options,
        ...this.deps.native,
        abortController: this.controller,
        diagnosticProjection: {
          record: (text: string): string => redactSecretsFromText(text, this.secrets),
          stderr: (text: string, end: boolean): string => this.privateStderr.append(text) + (end ? this.privateStderr.end() : ""),
          stdoutRecord: (text: string): string => this.stdoutRecords.append(text) + this.stdoutRecords.end(),
        },
        onProcessExitError: (error: Error): void => {
          this.exitFailures.add(error);
        },
        ...(this.input.options?.stderr === undefined
          ? {
              onDecodedStderr: (text: string): void => {
                this.stderr.append(text);
              },
            }
          : {
              stderr: (text: string): void => {
                this.stderr.append(text);
              },
            }),
        ...(spawn === undefined
          ? {
              onNativeProcessCreated: (child: Parameters<NonNullable<NonNullable<AgentSdkExecutionDeps["native"]>["onNativeProcessCreated"]>>[0]): void => {
                this.physicalChild = child;
                this.children.add(new Promise<void>((resolve) => child.once("close", () => resolve())));
                this.deps.native?.onNativeProcessCreated?.(child);
              },
              onNativeProcessCleanupError: (error: unknown): void => {
                this.recordFailure(new Error(this.safeErrorMessage(error)));
              },
            }
          : { spawnClaudeCodeProcess: this.spawn(spawn) }),
      };
      this.query = this.deps.query({ ...this.input, options });
      return {
        query: this.query,
        signal: this.controller.signal,
        stderrTail: (): string => this.stderr.tail(),
        safeErrorMessage: (error: unknown): string => this.safeErrorMessage(error),
        [Symbol.asyncDispose]: (): Promise<void> => this.close(),
      };
    } catch (error) {
      this.controller.abort();
      this.closing ??= this.finish();
      throw error;
    } finally {
      this.constructed.resolve();
    }
  }

  private spawn(execute: NonNullable<AgentSdkExecutionDeps["spawn"]>): NonNullable<AgentSdkExecutionDeps["spawn"]> {
    return (options): ReturnType<NonNullable<AgentSdkExecutionDeps["spawn"]>> => {
      if (this.controller.signal.aborted) {
        throw new ProviderError({ kind: "aborted", retryable: false, message: "agent-sdk: spawn was cancelled" });
      }
      const child = execute(options);
      this.physicalChild = child;
      const decoder = new StringDecoder("utf8");
      child.stderr.on("data", (chunk: Buffer) => this.stderr.append(decoder.write(chunk)));
      child.stderr.on("error", (error: Error) => {
        this.recordFailure(new Error(sanitizeApiError(redactSecretsFromText(error.message, this.secrets))));
      });
      child.stderr.once("close", () => {
        this.stderr.append(decoder.end());
        this.stderr.end();
      });
      this.children.add(new Promise<void>((resolve) => child.once("close", () => resolve())));
      return child;
    };
  }

  cancel(): void {
    this.controller.abort();
    this.closing ??= this.finish();
  }

  private safeErrorMessage(error: unknown): string {
    const child = this.physicalChild;
    if (error instanceof Error && this.exitFailures.has(error) && child !== undefined) {
      const status = child.signalCode === null ? `code ${child.exitCode}` : `signal ${child.signalCode}`;
      const tail = this.stderr.tail();
      return sanitizeApiError(`agent-sdk process exited with ${status}${tail.length === 0 ? "" : `: ${tail}`}`);
    }
    return sanitizeApiError(redactSecretsFromText(errorMessage(error), this.secrets));
  }

  close(): Promise<void> {
    this.closing ??= this.finish();
    return this.closing;
  }

  private async finish(): Promise<void> {
    await this.constructed.promise;
    try {
      this.query?.close();
      await this.query?.return(undefined);
    } catch (error) {
      this.recordFailure(new Error(this.safeErrorMessage(error)));
    } finally {
      await Promise.all(this.children);
      this.stderr.end();
      this.privateStderr.end();
      this.stdoutRecords.end();
      this.signal?.removeEventListener("abort", this.abort);
      this.release();
    }
  }
}
