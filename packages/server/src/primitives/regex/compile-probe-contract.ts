// What the find-pattern compile probe worker and its parent agree on. Both sides read these; the worker's input is
// parsed, never trusted, because it crosses a thread boundary.
import { SubstituteFindRegex } from "@orb/kit/regex";
import { z } from "zod";

/** The text each pattern's first run reads. Compile cost lives in the pattern, not the subject, but V8 compiles a
 *  pattern to native code only after it has run a few times, so a global replace over a short line of ordinary
 *  prose triggers the compile a turn would pay without letting the subject's length add cost of its own. */
export const COMPILE_PROBE_SUBJECT = "The rain had not stopped; she counted the lamps along the canal.";

export const compileProbeRequestSchema = z.strictObject({
  patterns: z.array(
    z.strictObject({
      findRegex: z.string(),
      substituteRegex: z.literal([SubstituteFindRegex.none, SubstituteFindRegex.raw, SubstituteFindRegex.escaped]).optional(),
    }),
  ),
});

export const compileProbeResultSchema = z.strictObject({ cpuMs: z.number() });
