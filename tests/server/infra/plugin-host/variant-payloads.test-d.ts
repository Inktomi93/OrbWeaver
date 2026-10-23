import { expectTypeOf, test } from "vitest";
import type { BundleImportFileOutcome } from "#server/domain/import/contract/bundle.ts";
import type { RpcResult } from "#server/infra/plugin-host/contract/process-protocol.ts";
import type { EvalOutcome } from "#server/infra/plugin-host/sandbox.ts";

test("guest results require the branch payload and RPC success still permits void", () => {
  expectTypeOf<{ ok: false; logs: [] }>().not.toExtend<EvalOutcome>();
  expectTypeOf<{ ok: true; logs: [] }>().not.toExtend<EvalOutcome>();
  expectTypeOf<{ ok: true; value: string; logs: [] }>().toExtend<EvalOutcome>();
  expectTypeOf<{ ok: false }>().not.toExtend<RpcResult>();
  expectTypeOf<{ ok: true }>().toExtend<RpcResult>();
  expectTypeOf<{ ok: true; value: undefined }>().toExtend<RpcResult>();
  expectTypeOf<{ ok: true; error: { name: string; message: string } }>().not.toExtend<RpcResult>();
});

test("bundle routing and aborted work cannot be reported as successful imports", () => {
  expectTypeOf<{ kind: null; path: string; ok: true }>().not.toExtend<BundleImportFileOutcome>();
  expectTypeOf<{ kind: "chat"; path: string; ok: true; notAttempted: true }>().not.toExtend<BundleImportFileOutcome>();
  expectTypeOf<{ kind: "chat"; path: string; ok: false; error: string; notAttempted: true }>().toExtend<BundleImportFileOutcome>();
});
