// domain/credentials/substrate/egress-admission — re-derive the SSRF egress belt's OWNER-SAVED ENDPOINT
// admissions from the store. Credentials owns `user_credentials`, so the read lives here; the BELT
// (`infra/network/egress.ts`, the `publishOwnerSavedEndpoints` block) owns every admission decision — this
// file hands it declared baseUrl STRINGS and never a key, so the domain cannot widen egress by itself.
//
// THE SCOPE IS THE OWNER ROW, NOT THE CALLER. `ctx.ownerUserId()` resolves the single `users.role='owner'`
// row (DDL-unique, D17/D40) server-side, and the list is scoped to THAT id. A member calling `add` with
// `baseUrl: "http://169.254.169.254/"` therefore republishes the OWNER's set, which does not contain their
// row — widening egress is not expressible from a non-owner principal, rather than merely refused. (No
// `role` comparison lives here: invariant #6 keeps privilege comparison in `can()`, and this derivation
// needs none.)
//
// WHOLE-SET REPUBLISH, ALWAYS. Every call replaces the belt's set, so a removed or re-pointed connection
// closes by its ABSENCE from the next publish — there is no incremental add/remove path that could drift,
// and nothing is persisted into env. No owner row yet (a fresh OIDC box before the first owner login) ⇒ the
// empty set, i.e. the pre-change posture.

import { publishOwnerSavedEndpoints } from "#infra/network";
import type { CredentialContext } from "../contract/service.ts";
import { listOwnedCredentialMetadata } from "../persistence/queries.ts";
import { parseCustomOpenAiEndpoint } from "./parse-metadata.ts";

/** Re-derive and publish the owner-saved endpoint admissions. Called at boot (the `refreshEgressAdmission`
 *  verb) and by every write verb that can change the saved endpoint set (`add`, `remove`). */
export async function republishOwnerSavedEndpoints(ctx: CredentialContext): Promise<void> {
  const ownerId = await ctx.ownerUserId();
  if (ownerId === undefined) {
    publishOwnerSavedEndpoints([]);
    return;
  }
  const rows = await listOwnedCredentialMetadata(ctx.db, ownerId);
  // Only the `custom_openai` metadata arm carries a declared endpoint; every other provider row parses to
  // null and contributes nothing (the same seam that keeps an undefined URL off the wire in test-health).
  const baseUrls: string[] = [];
  for (const row of rows) {
    const endpoint = parseCustomOpenAiEndpoint(row.metadata);
    // biome-ignore lint/suspicious/noUnnecessaryConditions: `parseCustomOpenAiEndpoint` returns `CustomOpenAiEndpoint | null` and tsc rejects the `.baseUrl` read without this guard; biome's cross-package zod-union inference drops the `z.null()` arm — the SAME false positive documented inside `substrate/parse-metadata.ts`. Ends when biome resolves the zod union across packages.
    if (endpoint !== null) {
      baseUrls.push(endpoint.baseUrl);
    }
  }
  publishOwnerSavedEndpoints(baseUrls);
}
