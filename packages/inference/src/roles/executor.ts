// Every execution re-checks current funding and credential authority without changing its pinned model/config.
// Provider failures strike only the credential this execution used; cancellation and passenger failures preserve
// the original error. The executor never selects a connection or follows a changed binding.

import { credentialExecutionEvidenceOf } from "@orb/contracts/credentials";
import type { BeginEmbeddingAccounting, EmbeddingAccounting, EmbeddingTask } from "@orb/contracts/embeddings";
import type { Task } from "@orb/contracts/inference";
import { canFund } from "@orb/contracts/inference";
import type { EmbedResult, ImageEmbedResult } from "@orb/contracts/providers";
import { judgesTheKey } from "../backends/http/error-classify.ts";
import type { BackendRegistry, ProviderExecutor, ReadOwnedExecutionConnection } from "../contract/backend.ts";
import { ProviderError } from "../contract/errors.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { InferenceDeps, SpanFn } from "../deps.ts";
import { runTask } from "../registry/dispatch.ts";
import { unavailableRefusal } from "./role-clients.ts";

async function accounted<T>(accounting: EmbeddingAccounting, run: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    try {
      await accounting.finish(false);
    } catch (accountingError) {
      // biome-ignore lint/style/useErrorCause: AggregateError takes options in its third argument; both failures remain in errors and the original execution is the cause.
      throw new AggregateError([error, accountingError], "Embedding execution and accounting settlement failed", { cause: error });
    }
    throw error;
  }
  await accounting.finish(true);
  return result;
}

function providerFailureOf(err: unknown): ProviderError | null {
  let cause: unknown = err;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !(cause instanceof ProviderError) && cause.cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    cause = cause.cause;
  }
  return cause instanceof ProviderError ? cause : null;
}

function refusalOf(failure: ProviderError): ProviderError {
  return new ProviderError({
    kind: "invalid",
    retryable: false,
    message: failure.message,
    ...(failure.apiErrorStatus === undefined ? {} : { apiErrorStatus: failure.apiErrorStatus }),
    cause: failure,
  });
}

export function createProviderExecutor(args: {
  readonly registry: BackendRegistry;
  readonly span: SpanFn;
  readonly beginEmbeddingAccounting: BeginEmbeddingAccounting;
  readonly readOwnedConnection: ReadOwnedExecutionConnection;
  readonly resolveCredential: InferenceDeps["resolveCredential"];
  readonly log: InferenceDeps["log"];
  readonly onAuthFailed?: InferenceDeps["onAuthFailed"];
}): ProviderExecutor {
  const { registry, span, beginEmbeddingAccounting } = args;
  const begin = (connection: Resolved, task: EmbeddingTask): EmbeddingAccounting =>
    beginEmbeddingAccounting({
      ownerId: connection.ownerId,
      connectionId: connection.connectionId,
      providerId: connection.providerId,
      model: connection.model,
      wire: connection.wire,
      task,
    });

  // SECURITY: the one strike decision for every task. A 403 on a row whose 403 judges nothing (a model off the plan, a
  // cooldown) never strikes the key and fails as a refusal in the service's words, since `auth_failed` would also tell
  // the user the key was rejected. A settled caller-owned cancellation is not evidence against the key either.
  const settleFailure = async (connection: Resolved, task: Task, signal: AbortSignal, err: unknown): Promise<never> => {
    const failure = providerFailureOf(err);
    if (failure === null || signal.aborted) {
      throw err;
    }
    if (!judgesTheKey(failure, connection.features.forbiddenIsNotCredentialVerdict === true)) {
      throw failure.kind === "auth_failed" ? refusalOf(failure) : err;
    }
    if (args.onAuthFailed !== undefined) {
      try {
        await args.onAuthFailed({
          ownerId: connection.ownerId,
          ...credentialExecutionEvidenceOf(connection.credential),
          errorKind: failure.kind,
          errorMessage: failure.message,
        });
      } catch (strikeErr) {
        args.log.warn({ task, err: strikeErr }, "inference: the credential strike-out failed (the call's own error is unaffected)");
      }
    }
    throw err;
  };

  const execute = async <T extends Task, Result>(
    captured: Resolved<T>,
    task: T,
    signal: AbortSignal,
    run: (connection: Resolved<T>) => Promise<Result>,
  ): Promise<Result> => {
    const current = await args.readOwnedConnection(captured.connectionId, captured.ownerId);
    if (!canFund(current, task)) {
      throw unavailableRefusal(task, "background-refused");
    }
    if (current.providerId !== captured.providerId || current.credentialId !== captured.credential.credentialId) {
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message: "the connection's credential authority changed before execution — resolve it again",
      });
    }
    const credential = await args.resolveCredential({
      ownerId: captured.ownerId,
      providerId: captured.providerId,
      credentialId: captured.credential.credentialId,
    });
    const connection: Resolved<T> = { ...captured, allowBackground: current.allowBackground, credential };
    try {
      return await run(connection);
    } catch (err) {
      return await settleFailure(connection, task, signal, err);
    }
  };

  return {
    runChatTurn: (req) =>
      execute(req.connection, "chat", req.signal, (connection) =>
        runTask({ span, registry, task: "chat", pick: (b) => b.runChatTurn, req: { ...req, connection } }),
      ),
    embed: (req): Promise<EmbedResult> =>
      execute(req.connection, "embed", req.signal, (connection) => {
        const embeddingAccounting = begin(connection, "embed");
        return accounted(embeddingAccounting, () =>
          runTask({ span, registry, task: "embed", pick: (b) => b.embed, req: { ...req, connection, embeddingAccounting } }),
        );
      }),
    rerank: (req) =>
      execute(req.connection, "rerank", req.signal, (connection) =>
        runTask({ span, registry, task: "rerank", pick: (b) => b.rerank, req: { ...req, connection } }),
      ),
    imageEmbed: (req): Promise<ImageEmbedResult> =>
      execute(req.connection, "imageEmbed", req.signal, (connection) => {
        const embeddingAccounting = begin(connection, "imageEmbed");
        return accounted(embeddingAccounting, () =>
          runTask({ span, registry, task: "imageEmbed", pick: (b) => b.imageEmbed, req: { ...req, connection, embeddingAccounting } }),
        );
      }),
    summarize: (req) =>
      execute(req.connection, "summarize", req.signal, (connection) =>
        runTask({ span, registry, task: "summarize", pick: (b) => b.summarize, req: { ...req, connection } }),
      ),
    structured: (req) =>
      execute(req.connection, "structured", req.signal, (connection) =>
        runTask({ span, registry, task: "structured", pick: (b) => b.structured, req: { ...req, connection } }),
      ),
    generateImage: (req) =>
      execute(req.connection, "generateImage", req.signal, (connection) =>
        runTask({ span, registry, task: "generateImage", pick: (b) => b.generateImage, req: { ...req, connection } }),
      ),
  };
}
