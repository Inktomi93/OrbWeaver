// The anonymous HTTP bootstrap wire aggregates deployment capabilities and request-local auth facts.
// Identity remains the lower DAG root; upload caps derive from their own contract owner.

import { z } from "zod";
import { authConfigShareSchema, authModeSchema, CLIENT_SCOPES, REQUEST_TRANSPORTS } from "#identity";
import { uploadCapsSchema } from "#uploads";

/** The complete `/api/auth/config` response. Missing fields refuse the read, never imply defaults. */
export const authConfigSchema = z
  .strictObject({
    mode: authModeSchema,
    localEnabled: z.boolean(),
    oidcEnabled: z.boolean(),
    oidcProviderName: z.string(),
    /** First-run admission is scoped to this request's TCP peer and relay headers. */
    localFirstRun: z.boolean(),
    discreetLogin: z.boolean(),
    /** Withheld when discreet login is enabled. */
    defaultHandle: z.string().nullable(),
    /** A UI capability hint; server admission remains authoritative. */
    multiHumanCapable: z.boolean(),
    /** Tighten-only deployment ceiling on external media. */
    forbidExternalMedia: z.boolean(),
    /** Deployment default; a character override may move it in either direction. */
    trustHtml: z.boolean(),
    /** Deployment ceiling; a character cannot enable scripts while this is off. */
    allowInteractiveCards: z.boolean(),
    uploads: uploadCapsSchema,
    transport: z.enum(REQUEST_TRANSPORTS),
    clientScope: z.enum(CLIENT_SCOPES),
    /** Live relay state; its URL is withheld from anonymous callers. */
    share: authConfigShareSchema,
  })
  .readonly();
export type AuthConfig = z.infer<typeof authConfigSchema>;
