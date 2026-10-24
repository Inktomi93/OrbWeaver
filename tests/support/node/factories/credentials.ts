// Credential seeds run the production verbs and return their outcomes; rows-tier twins in `rows/credentials.ts` read the rows.

import type { auditLogs, userCredentials } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type CredentialsService = ServicesResult["services"]["credentials"];

type UserCredentialRow = typeof userCredentials.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;

export interface SeededUserCredential {
  readonly view: Awaited<ReturnType<CredentialsService["add"]>>;
  readonly row: UserCredentialRow;
  readonly audit: readonly AuditLogRow[];
}

/** Resolve through the caller-owned public credential service, preserving ownership and AAD refusal. */
export async function makeResolvedSecret(
  root: ServerProducerRoot,
  params: Parameters<CredentialsService["resolve"]>[0],
): ReturnType<CredentialsService["resolve"]> {
  const resolve = root.services.credentials.resolve;
  return await resolve(params);
}
