import { z } from "zod";

/** An unpersisted impersonation delta appended to the composer as generation progresses. */
export const impersonateStreamDeltaSchema = z.object({ delta: z.string() });

export type ImpersonateStreamDelta = Readonly<z.infer<typeof impersonateStreamDeltaSchema>>;
