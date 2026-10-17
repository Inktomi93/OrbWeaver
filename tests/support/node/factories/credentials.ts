// Sealed material stays Node-only; the real credential producer owns encryption, admission and its wire projection.
import type { Db } from "@orb/db";
import { auditLogs, userCredentials } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type CredentialsService = ServicesResult["services"]["credentials"];

export type UserCredentialRow = typeof userCredentials.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;

export interface SeededUserCredential {
  readonly view: Awaited<ReturnType<CredentialsService["add"]>>;
  readonly row: UserCredentialRow;
  readonly audit: readonly AuditLogRow[];
}

/** Capture the returned credential identity and its emitted audit, never a fixture-side seal or secret witness. */
export async function seedUserCredential(
  db: Db,
  add: CredentialsService["add"],
  params: Parameters<CredentialsService["add"]>[0],
): Promise<SeededUserCredential> {
  const view = await add(params);
  const ownerId = params.principal.userId;
  const row = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.id, view.id), eq(userCredentials.ownerId, ownerId)))
    .get();
  if (row === undefined) {
    throw new Error("production credential add left no canonical owned row");
  }
  const audit = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.actorUserId, ownerId), eq(auditLogs.entityId, view.id)))
    .orderBy(auditLogs.id);
  if (audit.length === 0) {
    throw new Error("production credential add left no canonical audit record");
  }
  return { view, row, audit };
}

/** Resolve through the caller-owned public credential service, preserving ownership and AAD refusal. */
export async function makeResolvedSecret(
  resolve: CredentialsService["resolve"],
  params: Parameters<CredentialsService["resolve"]>[0],
): ReturnType<CredentialsService["resolve"]> {
  return await resolve(params);
}

/** Persist and resolve an API key through its real owner; never manufacture execution evidence. */
export async function makeApiKeySecret(
  db: Db,
  credentials: Pick<CredentialsService, "add" | "resolve">,
  params: Omit<Parameters<CredentialsService["add"]>[0], "metadata">,
): ReturnType<CredentialsService["resolve"]> {
  const captured = await seedUserCredential(db, credentials.add, { ...params, metadata: { auth: "apiKey" } });
  return await makeResolvedSecret(credentials.resolve, {
    ownerId: params.principal.userId,
    credentialId: captured.row.id,
    providerId: captured.row.provider,
  });
}
