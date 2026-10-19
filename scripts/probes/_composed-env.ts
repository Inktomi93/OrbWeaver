// The first import of every probe that composes the server graph. A later static import runs the server
// env loader, which copies `.env` into process.env, so a check after it, or one that reads `.env` itself,
// is satisfied by the operator's file. This one runs first and reads only the launcher's environment.
import { processEnvKey } from "./openrouter/_kit.ts";

/** The refusal a composed probe raises when its own process did not set `ORB_ENV_NO_FILE=1`. */
export const COMPOSED_ENV_REFUSAL = "A composed probe requires ORB_ENV_NO_FILE=1 in its process environment so its graph cannot load production configuration";

if (processEnvKey("ORB_ENV_NO_FILE") !== "1") {
  throw new Error(COMPOSED_ENV_REFUSAL);
}
