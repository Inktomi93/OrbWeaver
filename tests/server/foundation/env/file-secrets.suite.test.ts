// Starts the real image entrypoint and env parser; the child's kernel environment must contain paths, not secrets.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { APP_SECRET_ENV_KEYS, processEnvSnapshot } from "../../../../packages/server/src/foundation/env/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const PROBE = `import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const { env, APP_SECRET_ENV_KEYS } = await import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, "packages/server/src/foundation/env/index.ts")).href)});
const child = spawnSync(process.execPath, ["-e", 'process.stdout.write(require("node:fs").readFileSync("/proc/' + process.pid + '/environ"))']);
if (child.status !== 0) throw new Error("same-uid child could not read parent environ");
const original = child.stdout.toString();
const parsed = APP_SECRET_ENV_KEYS.filter(key => env[key] !== undefined);
const leaked = APP_SECRET_ENV_KEYS.filter(key => original.includes(key + "=") || (env[key] !== undefined && original.includes(env[key])));
const inherited = APP_SECRET_ENV_KEYS.filter(key => process.env[key] !== undefined);
const matchesFiles = parsed.every(key => process.env[key + "_FILE"] !== undefined && env[key] === readFileSync(process.env[key + "_FILE"], "utf8").replace(/\\n+$/u, ""));
process.stdout.write(JSON.stringify({ parsed, leaked, inherited, matchesFiles }));
`;

for (const kind of ["mounted", "generated", "empty-mounted"] as const) {
  test(`${kind} file secrets parse without exposing any value through parent /proc/environ`, ({ skip }) => {
    if (process.platform !== "linux") {
      skip("the image entrypoint and /proc environment proof require Linux");
    }
    const root = mkdtempSync(join(tmpdir(), "orb-file-secrets-"));
    try {
      const data = join(root, "data");
      mkdirSync(data);
      const probe = join(root, "probe.mjs");
      writeFileSync(probe, PROBE);
      const launchEnv = Object.fromEntries(
        Object.entries(processEnvSnapshot()).filter(([key]) => !APP_SECRET_ENV_KEYS.some((secret) => key === secret || key === `${secret}_FILE`)),
      );
      Object.assign(
        launchEnv,
        Object.fromEntries([
          ["DATA_DIR", data],
          ["AUTH_MODE", "local"],
          ["AUTH_FALLBACK", "deny"],
          ["ORB_ENV_NO_FILE", "1"],
          ["NODE_ENV", "production"],
        ]),
      );
      if (kind !== "generated") {
        for (const key of APP_SECRET_ENV_KEYS) {
          const file = join(root, key);
          writeFileSync(file, kind === "mounted" ? `mounted-${key.toLowerCase()}-secret-long-enough-for-session-validation\n` : "\n\n", { mode: 0o600 });
          launchEnv[`${key}_FILE`] = file;
        }
      }
      const run = (): string => {
        const child = spawnSync("sh", [join(REPO_ROOT, "docker/entrypoint.sh"), process.execPath, probe], {
          env: launchEnv,
          encoding: "utf8",
          timeout: 15_000,
        });
        expect(child.status, "entrypoint and env parser must boot").toBe(0);
        return child.stdout;
      };
      const expected = {
        parsed: kind === "mounted" ? [...APP_SECRET_ENV_KEYS] : ["SESSION_SECRET", "LOCAL_INITIAL_PASSWORD"],
        leaked: [],
        inherited: [],
        matchesFiles: true,
      };
      expect(JSON.parse(run())).toEqual(expected);
      const persistedFiles =
        kind !== "mounted" ? [join(data, "secrets/session_secret"), join(data, "secrets/initial_password")] : APP_SECRET_ENV_KEYS.map((key) => join(root, key));
      const persisted = persistedFiles.map((file) => readFileSync(file, "utf8"));
      expect(JSON.parse(run())).toEqual(expected);
      expect(persistedFiles.every((file, index) => readFileSync(file, "utf8") === persisted[index])).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const [key, generatedName] of [
  ["SESSION_SECRET", "session_secret"],
  ["LOCAL_INITIAL_PASSWORD", "initial_password"],
] as const) {
  test(`${key}_FILE pointing at a readable directory refuses boot without replacing the declared path`, ({ skip }) => {
    if (process.platform !== "linux") {
      skip("the image entrypoint requires Linux");
    }
    const root = mkdtempSync(join(tmpdir(), "orb-secret-directory-"));
    try {
      const data = join(root, "data");
      const directory = join(root, "declared-secret-directory");
      mkdirSync(data);
      mkdirSync(directory);
      const probe = join(root, "refusal.mjs");
      writeFileSync(
        probe,
        `try {
  await import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, "packages/server/src/foundation/env/index.ts")).href)});
  process.stdout.write(JSON.stringify({ namedRefusal: false, declaredPathPreserved: false }));
} catch (error) {
  process.stdout.write(JSON.stringify({ namedRefusal: error instanceof Error && error.message.includes(${JSON.stringify(`${key}_FILE`)}), declaredPathPreserved: process.env[${JSON.stringify(`${key}_FILE`)}] === ${JSON.stringify(directory)} }));
  process.exitCode = 1;
}
`,
      );
      const launchEnv = Object.fromEntries(
        Object.entries(processEnvSnapshot()).filter(([name]) => !APP_SECRET_ENV_KEYS.some((secret) => name === secret || name === `${secret}_FILE`)),
      );
      Object.assign(
        launchEnv,
        Object.fromEntries([
          ["DATA_DIR", data],
          ["AUTH_MODE", "local"],
          ["AUTH_FALLBACK", "deny"],
          ["ORB_ENV_NO_FILE", "1"],
          ["NODE_ENV", "production"],
          [`${key}_FILE`, directory],
        ]),
      );
      const child = spawnSync("sh", [join(REPO_ROOT, "docker/entrypoint.sh"), process.execPath, probe], { env: launchEnv, encoding: "utf8", timeout: 15_000 });
      expect(child.status, "a failed read must not become a generated replacement").toBe(1);
      expect(JSON.parse(child.stdout)).toEqual({ namedRefusal: true, declaredPathPreserved: true });
      expect(existsSync(join(data, "secrets", generatedName))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
