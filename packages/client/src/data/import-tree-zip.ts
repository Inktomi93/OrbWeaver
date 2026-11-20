// data/import-tree-zip — the SillyTavern profile zip POST helper. Raw fetch (a Hono raw-body handler, not tRPC): the
// whole zip rides as the request body, and the persona answers and the dry-run flag ride the query. The server reads
// the zip entry by entry and imports its profile as the folder door would; an Orbweaver backup zip is not its, and
// it answers that with no content so the caller sends the zip to the bundle door instead.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PersonaCollision, PersonaCollisionChoices, ProfileZipRefusal } from "@orb/contracts/import";
import {
  encodePersonaCollisionChoices,
  PERSONA_COLLISION_FIELD,
  profileZipRefusalSchema,
  profileZipStartedSchema,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { WorkloadId } from "@orb/kit/ids";
import { HttpError, readJsonBody, throwHttpError } from "./http-error.ts";

const ZIP_MIME = "application/zip";
const NO_CONTENT = 204;

/** A zip the profile door refused, with the reason the client chooses its words by. */
export class ProfileZipRefusedError extends HttpError {
  readonly reason: ProfileZipRefusal;

  constructor(reason: ProfileZipRefusal, message: string, status: number) {
    super(message, status);
    this.name = "ProfileZipRefusedError";
    this.reason = reason;
  }
}

/** What the door made of a zip: an Orbweaver backup it leaves to the bundle door, or the profile import it started. */
export type ProfileZipOutcome =
  | { readonly kind: "backup" }
  | { readonly kind: "started"; readonly workloadId: WorkloadId; readonly collisions: readonly PersonaCollision[] };

/** POST a zip to the profile zip door. Throws {@link ProfileZipRefusedError} for a refusal that names its reason, and
 *  an {@link HttpError} for any other non-OK answer (409 = an import is already running; 401/403 = auth/CSRF). */
export async function importTreeZip(
  file: File,
  personaCollisions: PersonaCollisionChoices,
  { dryRun = false, signal }: { readonly dryRun?: boolean; readonly signal?: AbortSignal } = {},
): Promise<ProfileZipOutcome> {
  const query = new URLSearchParams(encodePersonaCollisionChoices(personaCollisions).map((choice) => [PERSONA_COLLISION_FIELD, choice]));
  if (dryRun) {
    query.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  }
  const response = await fetch(`${PORTABILITY_ROUTES.importTreeZip}?${query.toString()}`, {
    method: "POST",
    body: file,
    headers: { [CSRF_HEADER]: "1", "Content-Type": ZIP_MIME },
    ...(signal === undefined ? {} : { signal }),
  });
  if (response.status === NO_CONTENT) {
    return { kind: "backup" };
  }
  if (!response.ok) {
    const refusal = profileZipRefusalSchema.safeParse(await readJsonBody(response.clone()));
    if (refusal.success) {
      throw new ProfileZipRefusedError(refusal.data.reason, refusal.data.error, response.status);
    }
    await throwHttpError("importTreeZip", response);
  }
  const started = profileZipStartedSchema.parse(await response.json());
  return { kind: "started", workloadId: started.workloadId, collisions: started.collisions };
}
