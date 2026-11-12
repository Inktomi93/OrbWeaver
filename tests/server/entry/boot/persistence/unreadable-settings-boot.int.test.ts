// Persistence: a settings row whose stored text is not JSON survives the real boot. The server entry boots once to lay
// down the schema and the owner, the row is planted on disk, and the entry boots again: every boot step must pass the
// row by, leave its bytes, and the settings read must then report it unreadable so the reset door is offered.
// @subject packages/server/src/entry/lifecycle.ts
// @subject packages/server/src/domain/settings/persistence/theme-queries.ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { createDb, userSettings, users } from "@orb/db";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { expect, test } from "@orb/testkit/node";
import { ownFileDb } from "@orb/testkit/node/composed";
import { freeLoopbackPort } from "@orb/testkit/node/helpers";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE_URL_KEY } from "#server/foundation/data-layout/contract.ts";

const ENTRY = fileURLToPath(new URL("../../../../../packages/server/src/entry/index.ts", import.meta.url));
const LISTENING = "boot: listening";
const NOT_JSON = '{"theme": {"selectedThemeId": tr';
const SETTINGS_READ = "/api/trpc/settings.getUserSettings";
const SETTINGS_RESET = "/api/trpc/settings.resetUserConfig";

const settingsReply = z.object({ result: z.object({ data: z.object({ configUnreadable: z.string().nullable() }) }) });

interface BootedEntry extends AsyncDisposable {
  readonly port: number;
  readonly output: () => string;
}

/** Boot the real server entry on `databaseUrl` and resolve once it listens; a boot that exits first fails the case. */
async function bootEntry(dataDir: string, databaseUrl: string): Promise<BootedEntry> {
  const port = await freeLoopbackPort();
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ["PATH"]: processEnvValue("PATH"),
      ["HOME"]: processEnvValue("HOME"),
      [ENV_NO_FILE_KEY]: "1",
      ["DATA_DIR"]: dataDir,
      [DATABASE_URL_KEY]: databaseUrl,
      ["PORT"]: String(port),
      [AUTH_MODE_KEY]: "single-user",
      ["LOCAL_LIGHT_PREFETCH"]: "off",
      ["CORPUS_AUTOINDEX"]: "false",
      ["EGRESS_FIREWALL"]: "false",
      ["LOG_LEVEL"]: "info",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const listening = Promise.withResolvers<"listening">();
  const exited = new Promise<"exited">((resolve) => child.once("exit", () => resolve("exited")));
  const closed = once(child, "close");
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listening.resolve("listening");
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  await using construction = new AsyncDisposableStack();
  construction.defer(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    await exited;
    await closed;
  });
  expect(await Promise.race([listening.promise, exited]), output).toBe("listening");
  const owned = construction.move();
  return { port, output: () => output, [Symbol.asyncDispose]: () => owned.disposeAsync() };
}

test("a settings row holding text that is not JSON passes every boot step untouched, reads as unreadable, and resets", { tags: "slow" }, async ({
  importStagingDir,
}) => {
  const databaseUrl = pathToFileURL(join(importStagingDir, "orb.db")).href;
  {
    await using first = await bootEntry(importStagingDir, databaseUrl);
    expect(first.output()).toContain(LISTENING);
  }
  {
    await using owned = ownFileDb(await createDb(databaseUrl));
    const [owner] = await owned.db.select({ id: users.id }).from(users).where(eq(users.role, "owner"));
    expect(owner).toBeDefined();
    await owned.db.run(
      sql`insert into user_settings (user_id, config) values (${owner?.id}, ${NOT_JSON}) on conflict(user_id) do update set config = excluded.config`,
    );
  }
  {
    await using second = await bootEntry(importStagingDir, databaseUrl);
    const response = await fetch(`http://127.0.0.1:${String(second.port)}${SETTINGS_READ}`, { headers: { host: "localhost" } });
    expect(response.status, second.output()).toBe(200);
    expect(settingsReply.parse(await response.json()).result.data.configUnreadable).toBe(VERSIONED_PARSE_FAILURES.notJson);
  }
  {
    await using owned = ownFileDb(await createDb(databaseUrl));
    const stored = await owned.db.select({ text: sql<string>`${userSettings.config}` }).from(userSettings);
    expect(stored).toEqual([{ text: NOT_JSON }]);
  }
  // The repair door the read offers works on the booted server.
  await using third = await bootEntry(importStagingDir, databaseUrl);
  const reset = await fetch(`http://127.0.0.1:${String(third.port)}${SETTINGS_RESET}`, {
    method: "POST",
    headers: { host: "localhost", [CSRF_HEADER]: "1", ["content-type"]: "application/json" },
  });
  expect(reset.status, third.output()).toBe(200);
  expect(settingsReply.parse(await reset.json()).result.data.configUnreadable).toBeNull();
});
