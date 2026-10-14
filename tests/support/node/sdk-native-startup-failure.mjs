// This physical Node preload fails before native initialization, without a replacement SDK decoder.
import process from "node:process";

// biome-ignore lint/style/noProcessEnv: this external Node preload reads its own canonically prepared subprocess credential, not application configuration.
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (token === undefined) {
  throw new Error("native startup fixture requires its actual prepared credential");
}
await new Promise((resolve) => process.stderr.write(`sdk-native-startup-failure: ${token} complete\n`, resolve));
process.exit(7);
