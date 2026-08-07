// entry/compose/role-clients — THE single RoleClients binder. Pins the wiring the gold-standard composition
// seam depends on: the ASYNC per-user binder resolves each derive-role via `connection.resolveRole` and binds
// a thunk that dispatches through the executor with the RESOLVED credential+model (provenance correct on the
// `*Model` fields). There is no sync vLLM floor — a sync floor silently routed workload roles to vLLM,
// breaking providers.md invariant #6. Stub executor + stub resolveRole isolate the wiring.
// Also pins the CANCELLATION forward: the bound `summarize` puts the caller's AbortSignal onto the provider
// request. `@orb/contracts` is DOM/node-free, so the signal rides `SummarizeCallOptions` (infra) and this
// binder is the only place it becomes `SummarizeRequest.signal` — a dropped forward would leave the chat
// turn's Stop unable to cut a side-LLM that hangs.
//
// D135 clause G — the PRINCIPAL-PROVENANCE block at the bottom is the security half: the binder must READ the
// subject's `users.role` through the one row→Principal home, never stamp one. Those pins drive the REAL
// `createHostPrincipalResolver` over a stubbed `users` row and the REAL `mintMaxProSub` owner gate, so they
// fail if the binder ever re-acquires a role literal.

import type { ChatApi, ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireOwner } from "@orb/server/domain/admin";
import type { ConnectionService } from "@orb/server/domain/connection";
import type { SessionsService, UserPrincipalFields } from "@orb/server/domain/sessions";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { bindRoleClientsForUser } from "@orb/server/entry/compose";
import type { EmbedRequest, ProviderExecutor, StructuredRequest, SummarizeRequest } from "@orb/server/infra/providers";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("u_owner");
/** The rule AUTHOR: a plain `user` row that holds D18 ROOM host authority in its own chat — the subject the
 *  `/autobg` arm binds a bundle for (`automation-plugin.ts` → `bindRoleClients(authorUserId)`). */
const AUTHOR = castId<UserId>("u_author");

/** The `users` table the resolver reads: the author is `user`, the owner is `owner`. */
const ROWS: Record<string, UserPrincipalFields> = {
  [OWNER]: { role: "owner", handle: castId<Handle>("boxowner"), externalId: null, enabled: true },
  [AUTHOR]: { role: "user", handle: castId<Handle>("author"), externalId: null, enabled: true },
};

/** The REAL row→`Principal` mint over a stub `loadUserById` — the same function the auth seam and the
 *  frozen-host bridge use, so these pins can't pass against a look-alike. */
function realResolver(): (userId: UserId) => Promise<Principal> {
  const sessions: Pick<SessionsService, "loadUserById"> = {
    loadUserById: (userId: UserId): Promise<UserPrincipalFields | null> => Promise.resolve(ROWS[userId] ?? null),
  };
  return createHostPrincipalResolver(sessions);
}

/** A `ProviderExecutor` that records `embed` + the two batch roles; the rest are inert. The `summarize` vs
 *  `structured` split lets a test assert the facade routes a `responseFormat` call to the structured role. */
function recordingExecutor(): {
  executor: ProviderExecutor;
  embedCalls: EmbedRequest[];
  summarizeCalls: SummarizeRequest[];
  structuredCalls: StructuredRequest[];
} {
  const embedCalls: EmbedRequest[] = [];
  const summarizeCalls: SummarizeRequest[] = [];
  const structuredCalls: StructuredRequest[] = [];
  const executor: ProviderExecutor = {
    embed: (req) => {
      embedCalls.push(req);
      return Promise.resolve({} as unknown as EmbedResult);
    },
    rerank: () => Promise.resolve({} as unknown as RerankResult),
    imageEmbed: () => Promise.resolve({} as unknown as ImageEmbedResult),
    summarize: (req) => {
      summarizeCalls.push(req);
      return Promise.resolve({} as unknown as SummarizeResult);
    },
    structured: (req) => {
      structuredCalls.push(req);
      // A REAL minimal SummarizeResult (the split-routing pin reads only which role fired, not the payload).
      return Promise.resolve({ items: [], model: req.model } satisfies SummarizeResult);
    },
    runChatTurn: () => Promise.reject(new Error("unused")),
    runAgentTurn: () => Promise.reject(new Error("unused")),
    generateImage: () => Promise.reject(new Error("unused")),
  };
  return { executor, embedCalls, summarizeCalls, structuredCalls };
}

/** A `resolveRole` that returns a distinct `model-<role>` + a marker credential per role. */
function stubConnection(): Pick<ConnectionService, "resolveRole"> {
  const conn: Pick<ConnectionService, "resolveRole"> = {
    resolveRole: ({ role }) => {
      const resolved: ResolvedConnection = {
        api: "chat-completions" as ChatApi,
        model: castId<ModelId>(`model-${role}`),
        credential: { source: "vllm" } as unknown as ResolvedCredential,
        // The binder reads `capability.context.window` for the summarizer token-guard tag — supply a minimal one.
        capability: { context: { window: 32_000 } } as unknown as ModelCapability,
      };
      return Promise.resolve(resolved);
    },
  };
  return conn;
}

test("bindRoleClientsForUser dispatches embed through the executor with the resolved credential+model", async () => {
  const { executor, embedCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor, resolvePrincipal: realResolver() }, OWNER);

  await clients.embed("hello", { inputType: "query" });

  expect(embedCalls).toHaveLength(1);
  const req = embedCalls[0];
  expect(req?.input).toBe("hello");
  expect(req?.inputType).toBe("query");
  expect(req?.model).toBe("model-embed");
  expect((req?.credential as { source: string }).source).toBe("vllm");
});

test("bindRoleClientsForUser carries provenance-correct *Model tags from the resolved connections", async () => {
  const clients = await bindRoleClientsForUser(
    { connection: stubConnection(), executor: recordingExecutor().executor, resolvePrincipal: realResolver() },
    OWNER,
  );

  expect(clients.embedModel).toBe("model-embed");
  expect(clients.rerankModel).toBe("model-rerank");
  expect(clients.imageEmbedModel).toBe("model-imageEmbed");
  expect(clients.summarizerModel).toBe("model-summarize");
});

test("bindRoleClientsForUser forwards the caller's AbortSignal onto the summarize request", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor, resolvePrincipal: realResolver() }, OWNER);
  const controller = new AbortController();

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { temperature: 0.2, signal: controller.signal });

  expect(summarizeCalls).toHaveLength(1);
  // Identity, not presence: a fresh controller would abort nothing.
  expect(summarizeCalls[0]?.signal).toBe(controller.signal);
  expect(summarizeCalls[0]?.temperature).toBe(0.2);
});

test("a summarize call with no signal sends none (no fabricated controller)", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor, resolvePrincipal: realResolver() }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls[0]?.signal).toBeUndefined();
});

// The role SPLIT (owner ruling 2026-07-27): the `summarize` facade routes by intent — a plain call is real
// summarization (→ the `summarize` role); a `responseFormat` call is schema-constrained generation (→ the
// `structured` role). Callers are unchanged; the WIRE role + its observability + firewall are now honest.
test("a summarize call with responseFormat routes to the STRUCTURED role, NOT summarize", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor, resolvePrincipal: realResolver() }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: { name: "x", schema: { type: "object" } } });

  expect(structuredCalls).toHaveLength(1);
  expect(structuredCalls[0]?.responseFormat).toEqual({ name: "x", schema: { type: "object" } });
  expect(summarizeCalls).toHaveLength(0); // the summarize role did NOT fire
});

test("a plain summarize call (no responseFormat) stays on the SUMMARIZE role", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser({ connection: stubConnection(), executor, resolvePrincipal: realResolver() }, OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls).toHaveLength(1);
  expect(structuredCalls).toHaveLength(0);
});

// ── D135 clause G — PRINCIPAL PROVENANCE ─────────────────────────────────────────────────────────────────
// The binder is reached at REQUEST time with a non-owner id: `automation-plugin.ts`'s `/autobg` arm calls
// `bindRoleClients(authorUserId)`, and a rule author only needs D18 ROOM host authority
// (`automation/verbs/create-rule.ts` → `requireChatHost`). Before this fix the binder stamped `role:"owner"`
// on whatever id it got, so the author reached `connection.resolveRole` — and every gate downstream of it —
// wearing the box owner's role.

/** Captures the `Principal` each `resolveRole` call receives. */
function capturingConnection(): { connection: Pick<ConnectionService, "resolveRole">; principals: Principal[] } {
  const principals: Principal[] = [];
  const base = stubConnection();
  return {
    principals,
    connection: {
      resolveRole: (params): Promise<ResolvedConnection> => {
        principals.push(params.principal);
        return base.resolveRole(params);
      },
    },
  };
}

test("D135: the binder's Principal is READ off the users row — a non-owner author stays `user`", async () => {
  const { connection, principals } = capturingConnection();

  await bindRoleClientsForUser({ connection, executor: recordingExecutor().executor, resolvePrincipal: realResolver() }, AUTHOR);

  expect(principals).toHaveLength(4); // embed · rerank · imageEmbed · summarize
  for (const principal of principals) {
    expect(principal.role).toBe("user");
    expect(principal.userId).toBe(AUTHOR);
    // Read, not fabricated: the retired stamp carried the raw id as the handle.
    expect(principal.handle).toBe("author");
  }
});

/** The binder's principal for `userId`, as the four `resolveRole` calls saw it. */
async function boundPrincipal(userId: UserId): Promise<Principal | undefined> {
  const { connection, principals } = capturingConnection();
  await bindRoleClientsForUser({ connection, executor: recordingExecutor().executor, resolvePrincipal: realResolver() }, userId);
  return principals[0];
}

test("D135: the binder AGREES with the frozen-host bridge for the same caller (both roles)", async () => {
  // The agreement shape D135 clause E names: not two independent role assertions, but "these two mints
  // produce the same Principal" — exactly what no single-surface test could see. Both roles, because a
  // stamped `owner` agrees with the bridge for the OWNER by luck and diverges for everyone else.
  const [ownerBound, authorBound, ownerRow, authorRow] = await Promise.all([
    boundPrincipal(OWNER),
    boundPrincipal(AUTHOR),
    realResolver()(OWNER),
    realResolver()(AUTHOR),
  ]);

  expect(ownerBound).toEqual(ownerRow);
  expect(authorBound).toEqual(authorRow);
});

test("D135: the owner gate the binder can reach REFUSES the non-owner author (real requireOwner)", async () => {
  // The exploit path, driven with the REAL guard: `resolveRole` → `credentials.resolve` →
  // `mintMaxProSub(principal, requireOwner)`. That mint gates on `principal.role`, and `SUMMARIZE_SOURCES`
  // lets any user pin `roleDefaults.summarize.source = "max-pro-sub"` — so with a stamped principal the
  // owner-only mint was constructable by a rule author. The credential firewall refuses the resulting CALL,
  // but a firewall row is not this gate.
  const ownerGatedConnection: Pick<ConnectionService, "resolveRole"> = {
    resolveRole: (params) => {
      if (params.role === "summarize") {
        requireOwner(params.principal); // throws for a `user` principal — the whole point
      }
      return stubConnection().resolveRole(params);
    },
  };
  const deps = { connection: ownerGatedConnection, executor: recordingExecutor().executor, resolvePrincipal: realResolver() };

  await expect(bindRoleClientsForUser(deps, AUTHOR)).rejects.toThrow();
  // The same wiring under the real owner still binds — the gate discriminates on the ROW, not on the caller.
  await expect(bindRoleClientsForUser(deps, OWNER)).resolves.toBeDefined();
});

test("D135: an unknown id degrades to the fail-closed floor, never to owner", async () => {
  const { connection, principals } = capturingConnection();

  await bindRoleClientsForUser({ connection, executor: recordingExecutor().executor, resolvePrincipal: realResolver() }, castId<UserId>("u_ghost"));

  expect(principals[0]?.role).toBe("user");
});
