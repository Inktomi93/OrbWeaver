// Run inside the production image by the install workflow's docker job, beside _broker-permission-probe.ts. A broker
// started with the shipped flags, from its private directory as the watchdog starts it, must be denied the
// credentials key directly and through every workspace-package link, from its main thread and from a Worker.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, relative, sep } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const DENIED = "ERR_ACCESS_DENIED";
const PRIVATE_FILE_MODE = 0o600;
const PROBE = join(import.meta.dirname, "_broker-permission-probe.ts");
const root = process.argv.find((value) => value.startsWith("--root="))?.slice("--root=".length) ?? process.cwd();
const credentialsKey = join(root, "data", "secrets", "credentials_key");
const { pluginBrokerExecArgv } = (await import(join(root, "packages/server/src/infra/plugin-host/process-permission.ts"))) as {
  readonly pluginBrokerExecArgv: (brokerDirectory: string) => string[];
};

// Each link, then enough `..` to climb from its target back to the workspace root, then the key. The kernel applies
// the `..` to the target; Node's check applies it to the link path. `join` would normalize it, so it is built by hand.
function walksThroughLinks(): string[] {
  const scopes = [join(root, "node_modules", "@orb"), join(parse(root).root, "node_modules", "@orb")].filter((scope) => existsSync(scope));
  return scopes.flatMap((scope) =>
    readdirSync(scope).map((name) => {
      const link = join(scope, name);
      const climb = relative(root, realpathSync(link)).split(sep).length;
      return [link, ...Array.from({ length: climb }, () => ".."), "data", "secrets", "credentials_key"].join(sep);
    }),
  );
}

interface ProbeReport {
  readonly reads: Readonly<Record<string, string>>;
  readonly sqlite: Readonly<Record<string, string>>;
  readonly workerReads: Readonly<Record<string, string>>;
  readonly workerSqlite: Readonly<Record<string, string>>;
}

const directory = mkdtempSync(join(tmpdir(), "orb-broker-containment-"));
const brokerDirectory = join(directory, "broker");
mkdirSync(brokerDirectory, { mode: 0o700 });
const tokenPath = join(brokerDirectory, "token");
writeFileSync(tokenPath, randomBytes(32).toString("base64url"), { mode: PRIVATE_FILE_MODE, flag: "wx" });
const walks = walksThroughLinks();
// `node:sqlite` bypasses the fs gate. The proof opens a real db under the temp root (granted to neither process) and,
// when the app has booted, the shipped db under the data dir. Removing the builtin must deny both.
const plantedDb = join(directory, "app.db");
const seed = new DatabaseSync(plantedDb);
seed.exec("create table t(v text); insert into t values ('secret')");
seed.close();
const shippedDb = join(root, "data", "db", "orbweaver.db");
const sqliteTargets = [plantedDb, ...(existsSync(shippedDb) ? [shippedDb] : [])];
const denied = [credentialsKey, ...walks];
const allowed = [tokenPath, join(root, "packages", "server", "package.json")];
const probePaths = [...new Set([...denied, ...allowed, ...sqliteTargets])];
const broker: ChildProcess = spawn(
  process.execPath,
  [
    ...pluginBrokerExecArgv(brokerDirectory),
    `--allow-fs-read=${PROBE}`,
    `--import=${PROBE}`,
    join(root, "packages/server/src/infra/plugin-host/broker-entry.ts"),
    join(brokerDirectory, "broker.sock"),
    tokenPath,
    "1",
    "production",
  ],
  {
    cwd: brokerDirectory,
    env: { ["NODE_ENV"]: "production", ["ORB_BROKER_PROBE_READS"]: JSON.stringify(probePaths) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  },
);
const [report] = (await once(broker, "message")) as [ProbeReport];
broker.kill("SIGKILL");
rmSync(directory, { recursive: true, force: true });

const failures = [
  ...(existsSync(credentialsKey) ? [] : [`the credentials key ${credentialsKey} does not exist, so no denial proves anything`]),
  ...(walks.length > 0 ? [] : ["no workspace-package link was found to walk through"]),
  ...[
    { thread: "main thread", reads: report.reads, sqlite: report.sqlite },
    { thread: "Worker", reads: report.workerReads, sqlite: report.workerSqlite },
  ].flatMap(({ thread, reads, sqlite }) => [
    ...denied.filter((path) => reads[path] !== DENIED).map((path) => `${thread} read ${path}: ${String(reads[path])}`),
    ...allowed.filter((path) => reads[path] !== "allowed").map((path) => `${thread} could not read ${path}: ${String(reads[path])}`),
    ...sqliteTargets.filter((path) => sqlite[path] === "allowed").map((path) => `${thread} opened ${path} through node:sqlite`),
  ]),
];
process.stdout.write(
  `${JSON.stringify({ walks, sqliteTargets, reads: report.reads, sqlite: report.sqlite, workerReads: report.workerReads, workerSqlite: report.workerSqlite, failures }, null, 2)}\n`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
