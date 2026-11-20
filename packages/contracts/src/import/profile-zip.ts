// The wire of the SillyTavern profile zip upload: why the route refuses a file, and what its dry run answers.

import { z } from "zod";
import { personaCollisionReviewSchema } from "./persona-collision.ts";
import { importStartedSchema } from "./started.ts";

/**
 * Why the profile zip route refuses an upload, so the client can say what the file is and what to do with it.
 * The first six name a file that is not a zip at all, told apart by its first bytes; the rest name a zip the route
 * will not unpack.
 */
const PROFILE_ZIP_REFUSALS = [
  "empty",
  "truncated",
  "other-archive",
  "json",
  "html",
  "not-zip",
  "damaged",
  "unsupported",
  "unsafe",
  "too-large",
  "layout",
  "case-twins",
] as const;
export type ProfileZipRefusal = (typeof PROFILE_ZIP_REFUSALS)[number];

/** A refusal's body: the reason the client keys its words on, and the server's own line naming what it met. */
export const profileZipRefusalSchema = z.strictObject({ error: z.string(), reason: z.enum(PROFILE_ZIP_REFUSALS) });

/** A started profile zip import: its workload and, for a dry run, the personas whose answers it was judged under. */
export const profileZipStartedSchema = importStartedSchema.extend(personaCollisionReviewSchema.shape);
