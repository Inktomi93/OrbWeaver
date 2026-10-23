// The anonymous HTTP bootstrap wire aggregates deployment capabilities and request-local auth facts.
// Identity remains the lower DAG root; upload caps derive from their own contract owner.

import { z } from "zod";
import { authConfigShareSchema, CLIENT_SCOPES, REQUEST_TRANSPORTS } from "#identity";
import { uploadCapsSchema } from "#uploads";

const authConfigFields = z.strictObject({
  discreetLogin: z.boolean(),
  defaultHandle: z.string().nullable(),
  oidcProviderName: z.string(),
  /** First-run admission is scoped to this request's TCP peer and relay headers. */
  localFirstRun: z.boolean(),
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
});
const authLoginSchema = z.discriminatedUnion("mode", [
  authConfigFields.extend({ mode: z.literal("local"), localEnabled: z.literal(true), oidcEnabled: z.literal(false) }),
  authConfigFields.extend({ mode: z.literal("oidc"), localEnabled: z.literal(false), oidcEnabled: z.literal(true) }),
  authConfigFields.extend({ mode: z.literal(["single-user", "forward-header"]), localEnabled: z.literal(false), oidcEnabled: z.literal(false) }),
]);
/** The complete `/api/auth/config` response. Missing fields refuse the read, never imply defaults. */
export const authConfigSchema = authLoginSchema
  .transform((config, ctx) => {
    if (config.discreetLogin) {
      if (config.defaultHandle !== null) {
        ctx.addIssue({ code: "custom", message: "Discreet login withholds the default handle", path: ["defaultHandle"] });
        return z.NEVER;
      }
      return { ...config, discreetLogin: true as const, defaultHandle: null };
    }
    return { ...config, discreetLogin: false as const };
  })
  .readonly();
export type AuthConfig = z.infer<typeof authConfigSchema>;
