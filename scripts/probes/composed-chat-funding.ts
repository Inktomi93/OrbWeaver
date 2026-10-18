// A probe's chat turn funded the way production funds one: a disposable composed graph seals the probe key, persists
// the owner's connection and resolves it, so the executor re-reads owned connection and credential authority per call.
// It boots only under ORB_ENV_NO_FILE=1, so the operator's `.env` never configures the graph or its data paths.

import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeclaredCapability } from "@orb/contracts/inference";
import { closeDb } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { Resolved, WireCaptureSink } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { createRunChatTurnBridge } from "@orb/server/entry/compose";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { readEnvKey } from "./openrouter/_kit.ts";

const SECRET_BOX_BYTES = 32;
const SESSION_SECRET = "composed-chat-funding-probe-session-secret";

function isChatResolved(resolved: Resolved): resolved is Resolved<"chat"> {
  return resolved.task === "chat";
}

/** Fund `model` on `providerId` with `key` for a fresh `user`-role row `ownerId`; dispose to settle the graph. */
export async function composeChatFunding(args: {
  readonly ownerId: UserId;
  readonly providerId: string;
  readonly model: string;
  readonly key: string;
  readonly declared: DeclaredCapability | null;
  readonly fetch: typeof fetch;
  readonly captureWire: WireCaptureSink;
}): Promise<AsyncDisposable & { readonly connection: Resolved<"chat">; readonly runChatTurn: ReturnType<typeof createRunChatTurnBridge> }> {
  if (readEnvKey("ORB_ENV_NO_FILE") !== "1") {
    throw new Error("A composed probe requires ORB_ENV_NO_FILE=1 so its graph cannot load production configuration");
  }
  const compose = await import("@orb/server/entry/compose");
  const { createHostPrincipalResolver } = await import("@orb/server/entry/auth");
  await using construction = new AsyncDisposableStack();
  const db = await freshDb();
  construction.defer(() => closeDb(db));
  const dir = await mkdtemp(join(tmpdir(), "orb-composed-chat-funding-"));
  construction.defer(() => rm(dir, { recursive: true, force: true }));
  await seedUser(db, { id: args.ownerId });
  const app = construction.use(
    await compose.createServices({
      db: databaseHandle(db),
      now: () => Date.now(),
      ownerId: args.ownerId,
      secretBoxKey: randomBytes(SECRET_BOX_BYTES),
      sessionSecret: SESSION_SECRET,
      casDir: join(dir, "cas"),
      variantDir: join(dir, "variants"),
      importStagingDir: join(dir, "staging"),
      userRuntimeDir: join(dir, "user-runtime"),
      stProfileDir: join(dir, "st-profile"),
      serverRestart: compose.UNSUPERVISED_RESTART,
      share: compose.NO_SHARE_RELAY,
      providerSeams: { sdkFetch: args.fetch, captureWire: args.captureWire },
    }),
  );
  const principal = await createHostPrincipalResolver(app.sessions)(args.ownerId);
  const credential = await app.services.credentials.add({ principal, provider: args.providerId, key: args.key });
  const stored = await app.services.connection.create({
    principal,
    providerId: args.providerId,
    model: args.model,
    credentialId: credential.id,
    baseUrl: null,
    declared: args.declared,
  });
  const { resolved } = await app.runtime.resolve({ task: "chat", principal, connectionId: stored.id });
  if (!isChatResolved(resolved)) {
    throw new Error(`the chat resolve returned a ${resolved.task} connection`);
  }
  const lifetime = construction.move();
  return {
    connection: resolved,
    runChatTurn: compose.createRunChatTurnBridge({ runChatTurn: app.runtime.executor.runChatTurn }),
    [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync(),
  };
}
