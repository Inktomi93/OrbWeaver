// Own native Query cleanup and supplied raw-child close receipts; never replace the omitted SDK spawn.
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
    open: (connection, input, signal, captureStderr): AgentSdkQueryLease => {
      if (cancelled) {
        throw new ProviderError({ kind: "aborted", retryable: false, message: "agent-sdk: execution scope is closed" });
      }
      const owner = new OwnedQuery([connection, input, signal, captureStderr], deps, recordFailure, () => active.delete(owner));
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
  private readonly secrets;
  private readonly stderr;
  private query: ReturnType<AgentSdkExecutionDeps["query"]> | undefined;
  private closing: Promise<void> | undefined;
  private readonly abort = (): void => this.cancel();

  private readonly input: Parameters<AgentSdkExecutionDeps["query"]>[0];
  private readonly signal: AbortSignal | undefined;
  private readonly captureStderr: boolean;
  private readonly deps: AgentSdkExecutionDeps;
  private readonly recordFailure: (error: Error) => void;
  private readonly release: () => void;

  constructor(
    [connection, input, signal, captureStderr]: Parameters<AgentSdkExecution["open"]>,
    deps: AgentSdkExecutionDeps,
    recordFailure: (error: Error) => void,
    release: () => void,
  ) {
    this.input = input;
    this.signal = signal;
    this.captureStderr = captureStderr === true;
    this.deps = deps;
    this.recordFailure = recordFailure;
    this.release = release;
    this.secrets = resolvedScrubSet({ credential: connection.credential, transport: null });
    this.stderr = new SdkStderr(this.secrets, input.options?.stderr);
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
        abortController: this.controller,
        ...(this.input.options?.stderr === undefined && !this.captureStderr ? {} : { stderr: (text: string): void => this.stderr.append(text) }),
        ...(spawn === undefined ? {} : { spawnClaudeCodeProcess: this.spawn(spawn) }),
      };
      this.query = this.deps.query({ ...this.input, options });
      return {
        query: this.query,
        signal: this.controller.signal,
        stderrTail: (): string => this.stderr.tail(),
        [Symbol.asyncDispose]: (): Promise<void> => this.close(),
      };
    } catch (error) {
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
      this.recordFailure(new Error(sanitizeApiError(redactSecretsFromText(errorMessage(error), this.secrets))));
    } finally {
      await Promise.all(this.children);
      this.stderr.end();
      this.signal?.removeEventListener("abort", this.abort);
      this.release();
    }
  }
}
