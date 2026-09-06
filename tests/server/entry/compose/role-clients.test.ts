// entry/compose/role-clients — THE single RoleClients binder. Pins the wiring the gold-standard composition
// seam depends on: the ASYNC per-user binder dispatches each derive-role through the executor with the
// RESOLVED credential+model (provenance correct on the `*Model` fields). There is no sync vLLM floor — a sync
// floor silently routed workload roles to vLLM, breaking providers.md invariant #6. Stub executor + stub
// resolveRole isolate the wiring.
//
// …and the SELECTOR HOT-RELOAD block in the middle pins the resolution TIMING: `connection.resolveRole` runs
// per CALL, not once at bind. Those are the defect proofs for the owner's 2026-08-13 dogfood report
// ("summarization and other selectors besides chat-completion require a server restart"), and they are red
// against the pre-fix source. Their double is INPUT-AWARE on purpose — a `resolveRole` stub that answers the
// same thing forever passes while the bug lives, which is exactly why the rest of this suite was green.
// Also pins the CANCELLATION forward: the bound `summarize` puts the caller's AbortSignal onto the provider
// request. `@orb/contracts` is DOM/node-free, so the signal rides `SummarizeCallOptions` (infra) and this
// binder is the only place it becomes `SummarizeRequest.signal` — a dropped forward would leave the chat
// turn's Stop unable to cut a side-LLM that hangs.
//
// D135 clause G — the PRINCIPAL-PROVENANCE block at the bottom is the security half: the binder must READ the
// subject's `users.role` through the one row→Principal home, never stamp one. Those pins drive the REAL
// `createHostPrincipalResolver` over a stubbed `users` row and the REAL `mintMaxProSub` owner gate, so they
// fail if the binder ever re-acquires a role literal.

import type { ChatApi, ResolvedConnection, RoutingRoleKey } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { StructuredOutputVehicle } from "@orb/contracts/role-clients";
import type { Handle, ModelId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireOwner } from "@orb/server/domain/admin";
import type { ConnectionService } from "@orb/server/domain/connection";
import type { SessionsService, UserPrincipalFields } from "@orb/server/domain/sessions";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { bindRoleClientsForUser } from "@orb/server/entry/compose";
import type { EmbedRequest, ProviderExecutor, StructuredRequest, SummarizeRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { makeModelCapability, makeOpenRouterCredential, makeResolvedConnection, makeResolvedCredential } from "../../../support/factories/index.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";

const OWNER = castId<UserId>("u_owner");

/** The deployment's structured-output vehicle floor (task #36). `auto` is the shipped default, so these
 *  bindings exercise the same resolution every deployment gets until an admin moves it. */
const autoVehicle = (): StructuredOutputVehicle => "auto";

/** The strike-out op for every pin that is not ABOUT the strike (#1800). Inert, not absent: the dep is
 *  required precisely so a future binder call site cannot bind a bundle whose failing role loses no key. */
const noStrike = (): Promise<void> => Promise.resolve();

/** The binder's deps, assembled in one place: every test but the vehicle-resolution trio wants the same
 *  stub connection, the REAL row→Principal resolver, and the shipped `auto` vehicle floor. */
function binderDeps(executor: ProviderExecutor): Parameters<typeof bindRoleClientsForUser>[0] {
  return { connection: stubConnection(), executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike };
}

/** The binder's deps over a CALLER-supplied connection — the principal-provenance pins need to watch
 *  what `resolveRole` was handed, so they bring their own recording connection. */
function customDeps(connection: Pick<ConnectionService, "resolveRole">): Parameters<typeof bindRoleClientsForUser>[0] {
  return {
    connection,
    executor: recordingExecutor().executor,
    resolvePrincipal: realResolver(),
    structuredOutputVehicle: autoVehicle,
    maybeRevokeOnAuthFailed: noStrike,
  };
}

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
      // A REAL minimal EmbedResult (the routing pin reads only which role fired, not the payload).
      return Promise.resolve({ vectors: [], model: req.model, usage: { promptTokens: null, totalTokens: null } } satisfies EmbedResult);
    },
    rerank: () =>
      // A REAL minimal RerankResult (see embed above).
      Promise.resolve({ hits: [], model: "unused", usage: { totalTokens: null } } satisfies RerankResult),
    imageEmbed: () =>
      // A REAL minimal ImageEmbedResult (see embed above).
      Promise.resolve({ vectors: [], model: "unused" } satisfies ImageEmbedResult),
    summarize: (req) => {
      summarizeCalls.push(req);
      // A REAL minimal SummarizeResult (see embed above).
      return Promise.resolve({ items: [], model: req.model } satisfies SummarizeResult);
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

/** A `resolveRole` that returns a distinct `model-<role>` + a marker credential per role. `structured` is the
 *  resolved model's structured-output capability — the bit the `auto` vehicle decision reads (task #36). */
function stubConnection(opts: { readonly structured?: boolean } = {}): Pick<ConnectionService, "resolveRole"> {
  const conn: Pick<ConnectionService, "resolveRole"> = {
    resolveRole: ({ role }) => {
      const resolved: ResolvedConnection = {
        api: "chat-completions" as ChatApi,
        model: castId<ModelId>(`model-${role}`),
        credential: makeResolvedCredential(),
        // The binder reads `capability.context.window` for the summarizer token-guard tag AND
        // `capability.output.structured` for the `auto` structured-output vehicle decision (task #36) —
        // supply BOTH. A double that omits a field the binder reads is a false green waiting to happen: the
        // vehicle arm read `undefined.structured` and threw, which is the double's bug, not the binder's.
        capability: makeModelCapability({
          context: { window: 32_000 },
          output: { maxTokens: { min: 1, max: 8192 }, structured: opts.structured ?? true },
        }),
      };
      return Promise.resolve(resolved);
    },
  };
  return conn;
}

test("bindRoleClientsForUser dispatches embed through the executor with the resolved credential+model", async () => {
  const { executor, embedCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(binderDeps(executor), OWNER);

  await clients.embed("hello", { inputType: "query" });

  expect(embedCalls).toHaveLength(1);
  const req = embedCalls[0];
  expect(req?.input).toBe("hello");
  expect(req?.inputType).toBe("query");
  expect(req?.model).toBe("model-embed");
  expect((req?.credential as { source: string }).source).toBe("vllm");
});

test("bindRoleClientsForUser carries provenance-correct *Model tags from the resolved connections", async () => {
  const clients = await bindRoleClientsForUser(binderDeps(recordingExecutor().executor), OWNER);

  expect(clients.embedModel).toBe("model-embed");
  expect(clients.rerankModel).toBe("model-rerank");
  expect(clients.imageEmbedModel).toBe("model-imageEmbed");
  expect(clients.summarizerModel).toBe("model-summarize");
});

test("bindRoleClientsForUser forwards the caller's AbortSignal onto the summarize request", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(binderDeps(executor), OWNER);
  const controller = new AbortController();

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { temperature: 0.2, signal: controller.signal });

  expect(summarizeCalls).toHaveLength(1);
  // Identity, not presence: a fresh controller would abort nothing.
  expect(summarizeCalls[0]?.signal).toBe(controller.signal);
  expect(summarizeCalls[0]?.temperature).toBe(0.2);
});

test("a summarize call with no signal sends none (no fabricated controller)", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(binderDeps(executor), OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls[0]?.signal).toBeUndefined();
});

// The role SPLIT (owner ruling 2026-07-27): the `summarize` facade routes by intent — a plain call is real
// summarization (→ the `summarize` role); a `responseFormat` call is schema-constrained generation (→ the
// `structured` role). Callers are unchanged; the WIRE role + its observability + firewall are now honest.
test("a summarize call with responseFormat routes to the STRUCTURED role, NOT summarize", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(binderDeps(executor), OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: { name: "x", schema: wireSchema({ type: "object" }) } });

  expect(structuredCalls).toHaveLength(1);
  // …carrying the vehicle the binder RESOLVED (task #36): the deployment floor is `auto`, and this model's
  // capability says its endpoints do structured output, so the enforcing wire is chosen here — not guessed
  // inside the sealed backend, which may not read a domain's capability.
  expect(structuredCalls[0]?.responseFormat).toEqual({ name: "x", schema: { type: "object" }, vehicle: "response-format" });
  expect(summarizeCalls).toHaveLength(0); // the summarize role did NOT fire
});

// The OTHER side of `auto` — the fence that keeps a model without structured-output endpoints on the
// forced-tool vehicle it has always used. Same request, same knob, one capability bit different.
test("auto resolves to the forced-tool vehicle when the resolved model has no structured-output capability", async () => {
  const { executor, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(
    {
      connection: stubConnection({ structured: false }),
      executor,
      resolvePrincipal: realResolver(),
      structuredOutputVehicle: autoVehicle,
      maybeRevokeOnAuthFailed: noStrike,
    },
    OWNER,
  );

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: { name: "x", schema: wireSchema({ type: "object" }) } });

  expect(structuredCalls[0]?.responseFormat?.vehicle).toBe("forced-tool");
});

// A DEPLOYMENT pin beats capability: an admin who forces the enforcing wire gets it on every model, and a
// provider that cannot compile the schema answers with its own 400 rather than a silent downgrade.
test("the deployment knob overrides the capability read when it is not `auto`", async () => {
  const { executor, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(
    {
      connection: stubConnection({ structured: false }),
      executor,
      resolvePrincipal: realResolver(),
      structuredOutputVehicle: (): StructuredOutputVehicle => "response-format",
      maybeRevokeOnAuthFailed: noStrike,
    },
    OWNER,
  );

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: { name: "x", schema: wireSchema({ type: "object" }) } });

  expect(structuredCalls[0]?.responseFormat?.vehicle).toBe("response-format");
});

// …and a PER-CALL ask beats both (the schema-forge asks for the enforcing wire: an author designing a schema
// wants the hard guarantee, not a deployment posture).
test("a per-call vehicle ask beats the deployment knob and the capability", async () => {
  const { executor, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(
    {
      connection: stubConnection({ structured: true }),
      executor,
      resolvePrincipal: realResolver(),
      structuredOutputVehicle: (): StructuredOutputVehicle => "forced-tool",
      maybeRevokeOnAuthFailed: noStrike,
    },
    OWNER,
  );

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], {
    responseFormat: { name: "x", schema: wireSchema({ type: "object" }), vehicle: "response-format" },
  });

  expect(structuredCalls[0]?.responseFormat?.vehicle).toBe("response-format");
});

test("a plain summarize call (no responseFormat) stays on the SUMMARIZE role", async () => {
  const { executor, summarizeCalls, structuredCalls } = recordingExecutor();
  const clients = await bindRoleClientsForUser(binderDeps(executor), OWNER);

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls).toHaveLength(1);
  expect(structuredCalls).toHaveLength(0);
});

// ── SELECTOR HOT-RELOAD ───────────────────────────────────────────────────────────────────────────────────
// Owner dogfood 2026-08-13: "summarization and other selectors besides chat-completion require a server
// restart to take effect". `connection.resolveRole` was already per-call hot (it reads the user's
// `routing.roleDefaults` off an uncached DB read), so chat re-routed live — but THIS binder called it four
// times, at boot, and baked `{credential, model}` into four closures for the process lifetime.
//
// These pins are DEFECT PROOFS, not fences: the double below is INPUT-AWARE (it answers from a mutable
// "stored settings" cell, exactly as `resolveRole` answers from the settings row). A stub that ignores the
// settings read passes while the bug lives, which is the whole reason the old suite was green.

/** A `resolveRole` double backed by a MUTABLE settings cell — the test's stand-in for the `roleDefaults`
 *  row. `pin(role, model)` is the settings WRITE; every subsequent resolve answers from the new value. */
function settingsBackedConnection(): {
  connection: Pick<ConnectionService, "resolveRole">;
  pin: (role: string, model: string) => void;
} {
  const pinned = new Map<string, string>();
  return {
    pin: (role: string, model: string): void => {
      pinned.set(role, model);
    },
    connection: {
      resolveRole: ({ role }): Promise<ResolvedConnection> => {
        const repointed = pinned.get(role);
        return Promise.resolve(
          makeResolvedConnection({
            model: castId<ModelId>(repointed ?? `model-${role}`),
            // The credential follows the selection too — a re-point that changes the SOURCE must change the
            // credential the executor is handed, not just the model string.
            credential: repointed === undefined ? makeResolvedCredential("vllm") : makeOpenRouterCredential(),
            capability: makeModelCapability({ context: { window: repointed === undefined ? 32_000 : 128_000 } }),
          }),
        );
      },
    },
  };
}

test("a settings re-point of the embed role governs the NEXT embed call — no restart", async () => {
  const { executor, embedCalls } = recordingExecutor();
  const { connection, pin } = settingsBackedConnection();
  const clients = await bindRoleClientsForUser(
    { connection, executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike },
    OWNER,
  );

  await clients.embed("before");
  pin("embed", "repointed-embed"); // the owner moves the embed role in Settings › Connections
  await clients.embed("after");

  expect(embedCalls.map((c) => c.model)).toEqual(["model-embed", "repointed-embed"]);
  // The credential moves with the selection — a model-only hot-reload would still send the OLD key.
  expect(embedCalls[1]?.credential.source).toBe("openrouter");
});

test("a settings re-point of the summarize role governs the NEXT summarize call — no restart", async () => {
  const { executor, summarizeCalls } = recordingExecutor();
  const { connection, pin } = settingsBackedConnection();
  const clients = await bindRoleClientsForUser(
    { connection, executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike },
    OWNER,
  );

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);
  pin("summarize", "repointed-summarize");
  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(summarizeCalls.map((c) => c.model)).toEqual(["model-summarize", "repointed-summarize"]);
});

test("the STRUCTURED arm of the summarize facade re-points too (it rides the summarize selection)", async () => {
  const { executor, structuredCalls } = recordingExecutor();
  const { connection, pin } = settingsBackedConnection();
  const clients = await bindRoleClientsForUser(
    { connection, executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike },
    OWNER,
  );
  const format = { name: "x", schema: wireSchema({ type: "object" }) };

  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: format });
  pin("summarize", "repointed-structured");
  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }], { responseFormat: format });

  expect(structuredCalls.map((c) => c.model)).toEqual(["model-summarize", "repointed-structured"]);
});

test("rerank and imageEmbed re-point on their next call — every derive role is hot, not just the two loud ones", async () => {
  const { executor } = recordingExecutor();
  const { connection, pin } = settingsBackedConnection();
  const clients = await bindRoleClientsForUser(
    { connection, executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike },
    OWNER,
  );

  pin("rerank", "repointed-rerank");
  pin("imageEmbed", "repointed-image-embed");
  await clients.rerank("q", [{ id: "d1", text: "t" }]);
  await clients.imageEmbed({ kind: "text", input: "t" });

  expect(clients.rerankModel).toBe("repointed-rerank");
  expect(clients.imageEmbedModel).toBe("repointed-image-embed");
});

test("the *Model provenance tags follow the re-point, so a vector row is stamped with the model that made it", async () => {
  const { executor } = recordingExecutor();
  const { connection, pin } = settingsBackedConnection();
  const clients = await bindRoleClientsForUser(
    { connection, executor, resolvePrincipal: realResolver(), structuredOutputVehicle: autoVehicle, maybeRevokeOnAuthFailed: noStrike },
    OWNER,
  );

  expect(clients.embedModel).toBe("model-embed"); // the bind seeds it — compose reads this synchronously
  pin("embed", "repointed-embed");
  pin("summarize", "repointed-summarize");
  await clients.embed("x");
  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(clients.embedModel).toBe("repointed-embed");
  expect(clients.summarizerModel).toBe("repointed-summarize");
  // The token guard's window is part of the same resolution — a re-point to a bigger model must not keep
  // trimming memory blocks to the old window.
  expect(clients.summarizerContextTokens).toBe(128_000);
});

test("one resolution pass reads ONE principal — a call never straddles two verdicts", async () => {
  const { connection, principals } = capturingConnection();
  const clients = await bindRoleClientsForUser(customDeps(connection), AUTHOR);
  const afterBind = principals.length;

  await clients.embed("x");

  // Exactly one additional resolveRole for the one role the call used — not a fan-out over all four.
  expect(principals.length).toBe(afterBind + 1);
  expect(principals[afterBind]?.userId).toBe(AUTHOR);
  expect(principals[afterBind]?.role).toBe("user");
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

  await bindRoleClientsForUser(customDeps(connection), AUTHOR);

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
  await bindRoleClientsForUser(customDeps(connection), userId);
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
  const deps = customDeps(ownerGatedConnection);

  await expect(bindRoleClientsForUser(deps, AUTHOR)).rejects.toThrow();
  // The same wiring under the real owner still binds — the gate discriminates on the ROW, not on the caller.
  await expect(bindRoleClientsForUser(deps, OWNER)).resolves.toBeDefined();
});

test("D135: an unknown id degrades to the fail-closed floor, never to owner", async () => {
  const { connection, principals } = capturingConnection();

  await bindRoleClientsForUser(customDeps(connection), castId<UserId>("u_ghost"));

  expect(principals[0]?.role).toBe("user");
});

// ── SIDE-ROLE CREDENTIAL STRIKE-OUT (#1800) ───────────────────────────────────────────────────────────────
// The second half of #1373, refused in-lane at the recall seam with a receipt and re-homed here. #1373 gave
// the CHAT turn a post-generation strike-out; #1603 then proved the other half was a hole with a name: a
// DERIVE role (embed/rerank/imageEmbed/summarize) resolves its OWN credential per call, so its 401 escaped
// the turn's catch, the chat's key was deliberately NOT charged for it (`credential-strikeout.suite.int`,
// "A SIDE-ROLE's auth failure inside the turn body strikes NOTHING"), and NOTHING revoked the key the
// provider had actually rejected. The user was told which role to fix and the dead key was re-spent forever.
//
// It could not be fixed at the recall seam: `RoleClients` exposes only `*Model` getters, so the failing
// role's `credentialId` is unreachable outside THIS binder's closure, and a fresh resolve afterwards is the
// rotate race #1373 bans by name. The strike therefore lives where the credential is already in hand.
//
// WHAT THESE PIN: the failing role's OWN credential is struck (never a sibling role's, never the chat's);
// the id is the one that call AUTHENTICATED with (never a re-resolve); the provider's own classification
// travels verbatim (the auth conditional is NOT re-spelled here — `domain/credentials/verbs/
// maybe-revoke-on-auth-failed.ts` is the one home of that policy, exhaustively pinned over every
// `PROVIDER_ERROR_KINDS` member by `tests/server/domain/credentials/verbs/maybe-revoke-on-auth-failed.int`);
// a non-provider fault classifies as nothing and strikes nothing; and the strike is a PASSENGER — it can
// never alter, mask or delay the failure the caller is about to see.

/** One recorded strike — exactly the argument object the binder handed the injected op. Derived from the
 *  DEPS TYPE, so a shape drift on either side is a `tsc` error here rather than a stale hand-copy. */
type StrikeCall = Parameters<Parameters<typeof bindRoleClientsForUser>[0]["maybeRevokeOnAuthFailed"]>[0];

/** A distinct STORED-ROW credential per derive role: "which role's key was struck" is only an answerable
 *  question when the four ids differ. Keyed by the ROUTING vocabulary (not `string`) so the lookup below is
 *  a mapped read rather than an index-signature one, and a renamed role breaks here. */
const ROLE_CREDENTIAL: Partial<Record<RoutingRoleKey, UserCredentialId>> = {
  embed: castId<UserCredentialId>("user_credential_embed"),
  rerank: castId<UserCredentialId>("user_credential_rerank"),
  imageEmbed: castId<UserCredentialId>("user_credential_image_embed"),
  summarize: castId<UserCredentialId>("user_credential_summarize"),
};

/** The CHAT turn's key (#1373 leg 3). This binder never resolves it and no derive-role failure may ever name
 *  it — charging it for a side role's 401 is a self-inflicted lockout plus a false product statement. */
const CHAT_CREDENTIAL = castId<UserCredentialId>("user_credential_chat");

/** A DIFFERENT live row: what a post-failure RE-RESOLVE would find after the user rotates/sets-active. No
 *  strike may name it — revoking it locks the user out of the key they just fixed. */
const ROTATED_CREDENTIAL = castId<UserCredentialId>("user_credential_rotated");

/** The capability every strike fixture resolves with (the binder reads `context.window` and
 *  `output.structured`; a double that omits either is a false green waiting to happen). */
const strikeCapability = (): ReturnType<typeof makeModelCapability> =>
  makeModelCapability({ context: { window: 32_000 }, output: { maxTokens: { min: 1, max: 8192 }, structured: true } });

/** A `resolveRole` whose every role answers with a KEYED credential carrying that role's own stored-row id,
 *  read off a MUTABLE cell so a test can rotate a role's key mid-flight (the race arm below). */
function keyedConnection(): { connection: Pick<ConnectionService, "resolveRole">; rotate: (role: RoutingRoleKey, id: UserCredentialId) => void } {
  const rotated = new Map<RoutingRoleKey, UserCredentialId>();
  return {
    rotate: (role: RoutingRoleKey, id: UserCredentialId): void => {
      rotated.set(role, id);
    },
    connection: {
      resolveRole: ({ role }): Promise<ResolvedConnection> =>
        Promise.resolve(
          makeResolvedConnection({
            model: castId<ModelId>(`model-${role}`),
            credential: makeOpenRouterCredential({ credentialId: rotated.get(role) ?? ROLE_CREDENTIAL[role] ?? null }),
            capability: strikeCapability(),
          }),
        ),
    },
  };
}

/** The recording executor with one or more role arms replaced by a rejecting one. */
function executorRejecting(over: Partial<ProviderExecutor>): ProviderExecutor {
  return { ...recordingExecutor().executor, ...over };
}

/** The binder's deps with a RECORDING strike op. `connection` is caller-supplied so the rotate arm can bring
 *  its own; `strikes` is the ledger every pin below reads. */
function strikeDeps(
  executor: ProviderExecutor,
  connection: Pick<ConnectionService, "resolveRole">,
  onStrike: (params: StrikeCall) => Promise<void> = () => Promise.resolve(),
): { deps: Parameters<typeof bindRoleClientsForUser>[0]; strikes: StrikeCall[] } {
  const strikes: StrikeCall[] = [];
  return {
    strikes,
    deps: {
      connection,
      executor,
      resolvePrincipal: realResolver(),
      structuredOutputVehicle: autoVehicle,
      maybeRevokeOnAuthFailed: (params: StrikeCall): Promise<void> => {
        strikes.push(params);
        return onStrike(params);
      },
    },
  };
}

/** The provider's own statement that it looked at the key and rejected it. */
const authFailure = (message = "the upstream rejected the key (401)"): ProviderError =>
  new ProviderError({ kind: "auth_failed", retryable: false, message, apiErrorStatus: 401 });

test("#1800 an auth-class EMBED failure strikes the EMBED role's own credential", async () => {
  const rejected = authFailure();
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(rejected) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  // The failure still reaches the caller UNCHANGED — identity, not just shape: the #1603 re-frame at the
  // recall seam reads this exact error object.
  await expect(clients.embed("hello")).rejects.toBe(rejected);

  expect(strikes).toHaveLength(1);
  expect(strikes[0]).toEqual({
    ownerId: OWNER,
    credentialId: ROLE_CREDENTIAL.embed,
    errorKind: "auth_failed",
    errorMessage: rejected.message,
  });
});

test("#1800 the RERANK arm mirrors embed — the recall seam's other side-role key is chargeable too", async () => {
  const rejected = authFailure("rerank key rejected");
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ rerank: () => Promise.reject(rejected) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.rerank("q", [{ id: "d1", text: "t" }])).rejects.toBe(rejected);

  expect(strikes.at(0)).toMatchObject({ credentialId: ROLE_CREDENTIAL.rerank, errorKind: "auth_failed" });
});

test("#1800 the imageEmbed and summarize arms strike too — every role that spends a key can lose it", async () => {
  const imageRejected = authFailure("imageEmbed key rejected");
  const summarizeRejected = authFailure("summarize key rejected");
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(
    executorRejecting({ imageEmbed: () => Promise.reject(imageRejected), summarize: () => Promise.reject(summarizeRejected) }),
    connection,
  );
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.imageEmbed({ kind: "text", input: "t" })).rejects.toBe(imageRejected);
  await expect(clients.summarize([{ systemPrompt: "s", userPrompt: "u" }])).rejects.toBe(summarizeRejected);

  expect(strikes.map((s) => s.credentialId)).toEqual([ROLE_CREDENTIAL.imageEmbed, ROLE_CREDENTIAL.summarize]);
});

test("#1800 ONLY the failing role's credential is charged — no sibling role's key, and never the chat's", async () => {
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(authFailure()) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toThrow();
  // …and the healthy roles keep working on the same bundle afterwards, striking nothing.
  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);
  await clients.rerank("q", [{ id: "d1", text: "t" }]);

  const charged = strikes.map((s) => s.credentialId);
  expect(charged).toEqual([ROLE_CREDENTIAL.embed]);
  expect(charged).not.toContain(CHAT_CREDENTIAL);
  expect(charged).not.toContain(ROLE_CREDENTIAL.rerank);
  expect(charged).not.toContain(ROLE_CREDENTIAL.summarize);
});

test("#1800 THE ROTATE RACE: the struck id is the one that call AUTHENTICATED with, never a fresh resolve", async () => {
  const { connection, rotate } = keyedConnection();
  const { deps, strikes } = strikeDeps(
    executorRejecting({
      embed: () => {
        // The user notices the failure and sets a NEW key active while this call is still in flight.
        rotate("embed", ROTATED_CREDENTIAL);
        return Promise.reject(authFailure());
      },
    }),
    connection,
  );
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toThrow();

  expect(strikes.at(0)?.credentialId).toBe(ROLE_CREDENTIAL.embed);
  expect(strikes.at(0)?.credentialId).not.toBe(ROTATED_CREDENTIAL);
});

test("#1800 a NON-provider fault (a bug, a DB error) strikes NOTHING — there is no classification to act on", async () => {
  const bug = new TypeError("cannot read properties of undefined");
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(bug) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toBe(bug);

  expect(strikes).toEqual([]);
});

test("#1800 a NON-auth provider failure reaches the op with its OWN kind — the policy lives in the verb, not here", async () => {
  // A 503 or a 429 must NEVER cost a user their key (revoking on a rate limit turns a minute's wait into a
  // lockout). That decision is NOT re-spelled at this seam: the provider's kind travels verbatim and
  // `domain/credentials/verbs/maybe-revoke-on-auth-failed.ts` short-circuits on it — pinned over EVERY
  // `PROVIDER_ERROR_KINDS` member in `tests/server/domain/credentials/verbs/maybe-revoke-on-auth-failed.int`.
  const upstreamDown = new ProviderError({ kind: "server", retryable: true, message: "upstream 503" });
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(upstreamDown) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toBe(upstreamDown);

  expect(strikes.at(0)?.errorKind).toBe("server");
  expect(strikes.at(0)?.errorKind).not.toBe("auth_failed");
});

test("#1800 a WRAPPED provider fault still classifies — the cause chain, not a single deref", async () => {
  const rejected = authFailure();
  const wrapped = new Error("embedding the recall query failed", { cause: rejected });
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(wrapped) }), connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toBe(wrapped);

  expect(strikes.at(0)).toMatchObject({ credentialId: ROLE_CREDENTIAL.embed, errorKind: "auth_failed" });
});

test("#1800 a KEYLESS role strikes with a null id — vllm/local-light own no row to revoke", async () => {
  const keyless: Pick<ConnectionService, "resolveRole"> = {
    resolveRole: ({ role }): Promise<ResolvedConnection> =>
      Promise.resolve(
        makeResolvedConnection({ model: castId<ModelId>(`model-${role}`), credential: makeResolvedCredential("vllm"), capability: strikeCapability() }),
      ),
  };
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(authFailure()) }), keyless);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await expect(clients.embed("x")).rejects.toThrow();

  // The null is the whole guard (the verb no-ops on it): the binder does not re-derive "is this keyless?".
  expect(strikes.at(0)?.credentialId).toBeNull();
});

test("#1800 THE STRIKE IS A PASSENGER: a throwing revoke never replaces the failure the caller sees", async () => {
  const rejected = authFailure();
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(executorRejecting({ embed: () => Promise.reject(rejected) }), connection, () =>
    Promise.reject(new Error("the credentials db is down")),
  );
  const clients = await bindRoleClientsForUser(deps, OWNER);

  // The caller sees the PROVIDER's failure, not the revoke's — a swap here would misreport which system broke.
  await expect(clients.embed("x")).rejects.toBe(rejected);

  expect(strikes).toHaveLength(1);
});

test("#1800 a SUCCESSFUL call strikes nothing — the strike is on the failure path only", async () => {
  const { connection } = keyedConnection();
  const { deps, strikes } = strikeDeps(recordingExecutor().executor, connection);
  const clients = await bindRoleClientsForUser(deps, OWNER);

  await clients.embed("x");
  await clients.rerank("q", [{ id: "d1", text: "t" }]);
  await clients.summarize([{ systemPrompt: "s", userPrompt: "u" }]);

  expect(strikes).toEqual([]);
});
