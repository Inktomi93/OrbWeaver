// Checked entry for the container assembler's version stamp. The package script is the external launch
// authority; this ordinary import keeps the server reader visible to TypeScript and the AST liveness graph.

import process from "node:process";
import { buildVersionStamp } from "@orb/server/foundation/version";

function requiredEnvironment(name: "ORB_STAMP_ROOT" | "ORB_STAMP_BUILT_AT"): string {
  // biome-ignore lint/style/noProcessEnv: these two values are the package script's explicit shell contract.
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`build-version-stamp: ${name} is required`);
  }
  return value;
}

const root = requiredEnvironment("ORB_STAMP_ROOT");
const builtAt = requiredEnvironment("ORB_STAMP_BUILT_AT");
process.stdout.write(JSON.stringify(buildVersionStamp(root, builtAt)));
