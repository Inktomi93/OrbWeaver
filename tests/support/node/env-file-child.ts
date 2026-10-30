// Loads the production process env module in its own process and prints what it resolved. The `.env` load runs once
// at module load from the working directory and the process environment, so a case needs a fresh process to vary them.

import process from "node:process";

const outcome = await import("@orb/server/foundation/env").then(
  ({ env }) => ({ env }),
  (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }),
);
process.stdout.write(JSON.stringify(outcome));
