// @subject packages/inference/src/roles/executor.ts
// @subject packages/server/src/domain/embeddings/verbs/record-usage.ts
import type { LibSqlWrap } from "@orb/db";
import { embeddingCalls } from "@orb/db";
import { expect } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { FUNDING_MODEL, fundingConnection, test } from "./runtime-funding.fixtures.ts";

const APPEND_WRITE = 'insert into "embedding_calls"';
const SETTLEMENT_WRITE = 'update "embedding_calls" set ';

type NativeDriver = Parameters<LibSqlWrap>[0];
type BatchStatement = Parameters<NativeDriver["batch"]>[0][number];
type DriverStatement = Parameters<Awaited<ReturnType<NativeDriver["transaction"]>>["execute"]>[0];

function statementSql(statement: BatchStatement): string {
  if (typeof statement === "string") {
    return statement;
  }
  return Array.isArray(statement) ? statement[0] : statement.sql;
}

test("the real executor attributes and settles each completed embedding batch under its owned connection", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
}) => {
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed" });
  const result = await app.runtime.executor.embed({ connection, input: "banana" });
  expect(result.usage.promptTokens).toBe(1);
  expect(result.vectors).toEqual([new Float32Array([1, 0, 0])]);
  expect(fundingProvider.calls).toEqual(["/v1/embeddings"]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, connection.connectionId))).toMatchObject([
    {
      ownerId: harness.ownerId,
      connectionId: connection.connectionId,
      provider: connection.providerId,
      model: FUNDING_MODEL,
      wire: connection.wire,
      task: "embed",
      inputCount: 1,
      promptTokens: 1,
      outcome: "completed",
    },
  ]);
});

test("durable batch append and settlement failures retain both causes without buying the embedding twice", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
  fundingDriver,
}) => {
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed" });
  const client = fundingDriver.client;
  if (client === null) {
    throw new Error("the native libSQL driver was not observed");
  }
  const appendError = new Error("controlled durable append refusal");
  const settlementError = new Error("controlled durable settlement refusal");
  const batch = client.batch.bind(client);
  const execute = client.execute.bind(client);
  const failedSettlementArgs: Parameters<NativeDriver["execute"]>[1][] = [];
  using append = vi.spyOn(client, "batch").mockImplementation((statements, mode) => {
    if (statements.some((statement) => statementSql(statement).startsWith(APPEND_WRITE))) {
      return Promise.reject(appendError);
    }
    return batch(statements, mode);
  });
  using settle = vi.spyOn(client, "execute").mockImplementation((statement: DriverStatement, args?: Parameters<NativeDriver["execute"]>[1]) => {
    if (statementSql(statement).startsWith(SETTLEMENT_WRITE)) {
      failedSettlementArgs.push(typeof statement === "string" ? args : statement.args);
      return Promise.reject(settlementError);
    }
    return typeof statement === "string" ? execute(statement, args) : execute(statement);
  });
  const failure = await app.runtime.executor.embed({ connection, input: "banana" }).then(
    () => {
      throw new Error("the controlled durable failures unexpectedly succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof AggregateError)) {
        throw error;
      }
      return error;
    },
  );
  expect(failure.cause).toBe(appendError);
  expect(failure.errors).toHaveLength(2);
  expect(failure.errors[0]).toBe(appendError);
  expect(failure.errors[1] instanceof Error && failure.errors[1].cause === settlementError).toBe(true);
  expect(append.mock.calls.filter(([statements]) => statements.some((statement) => statementSql(statement).startsWith(APPEND_WRITE)))).toHaveLength(1);
  const settlements = settle.mock.calls.filter(([statement]) => statementSql(statement).startsWith(SETTLEMENT_WRITE));
  expect(settlements).toHaveLength(1);
  expect(failedSettlementArgs[0]).toEqual(expect.arrayContaining(["failed", harness.ownerId]));
  expect(fundingProvider.calls).toEqual(["/v1/embeddings"]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, connection.connectionId))).toEqual([]);
});
