// Shared scaffolding for the stop tests (NOT a test file): a REAL process group on a listening port. The leader
// creates the listening socket and forks the other holders from it with the socket passed over IPC, so each holds
// the same port. The socket table names the LAST pid forked as the port's owner, so that is the holder a stop judges
// and signals; it always exits on TERM. The leader is started through a shell that exits, so no test process owns
// it as a child and an exited process is reaped by init while the test blocks. `member-holds-port` leaves the TERM-ignoring leader in its group holding the
// port; `outsider-holds-port` leaves a TERM-ignoring holder in its own session while the whole group exits.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { z } from "zod";
import { killPidGroup } from "../../tooling/src/floor/process/proc.ts";

const MEMBER_SCRIPT = `
if (process.argv[2] === "ignore") process.on("SIGTERM", () => {});
process.on("message", (message, server) => {
  if (message === "server") {
    server.on("connection", (socket) => socket.destroy());
    process.send("held");
  }
});
`;

const LEADER_SCRIPT = `
import { fork } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

const shape = process.argv[2];
if (shape === "member-holds-port") process.on("SIGTERM", () => {});
const server = createServer((_request, response) => response.end());
const plant = (mode, detached) => new Promise((resolve) => {
  const child = fork(join(import.meta.dirname, "member.mjs"), [mode], { detached, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  child.once("message", () => resolve(child.pid));
  child.send("server", server, { keepOpen: true });
});
server.listen(0, "127.0.0.1", async () => {
  const outsider = shape === "outsider-holds-port" ? await plant("ignore", true) : null;
  const member = await plant("exit", false);
  process.stdout.write(JSON.stringify({ leader: process.pid, port: server.address().port, member, outsider }) + "\\n");
});
`;

const plantedSchema = z.object({
  leader: z.number().int().positive(),
  port: z.number().int().positive(),
  member: z.number().int().positive(),
  outsider: z.number().int().positive().nullable(),
});

export interface SplitGroup {
  /** The checkout the scripts live in, so a command line names it. */
  readonly checkout: string;
  /** The group id: the pid of the shell that started the leader. The group outlives that shell. */
  readonly groupId: number;
  /** The TERM-ignoring (or, when the outsider holds the port, TERM-exiting) leader process. */
  readonly leaderPid: number;
  /** The port's named owner, in the leader's group, and the process a stop judges. */
  readonly memberPid: number;
  readonly outsiderPid: number | null;
  readonly port: number;
  /** Reap the whole fixture: the leader's group, then the outsider. */
  readonly dispose: () => void;
}

export async function plantSplitGroup(scratch: string, shape: "member-holds-port" | "outsider-holds-port"): Promise<SplitGroup> {
  const checkout = join(scratch, "checkout");
  mkdirSync(checkout, { recursive: true });
  writeFileSync(join(checkout, "member.mjs"), MEMBER_SCRIPT);
  writeFileSync(join(checkout, "leader.mjs"), LEADER_SCRIPT);
  const shell: ChildProcess = spawn("sh", ["-c", '"$@" &', "sh", process.execPath, join(checkout, "leader.mjs"), shape], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (shell.stdout === null || shell.pid === undefined) {
    throw new Error("the leader shell has no stdout or pid");
  }
  const groupId = shell.pid;
  const [bytes] = (await once(shell.stdout, "data")) as [Buffer];
  const planted = plantedSchema.parse(JSON.parse(String(bytes)));
  return {
    checkout,
    groupId,
    leaderPid: planted.leader,
    memberPid: planted.member,
    outsiderPid: planted.outsider,
    port: planted.port,
    dispose: (): void => {
      killPidGroup(groupId, "SIGKILL");
      if (planted.outsider !== null) {
        killPidGroup(planted.outsider, "SIGKILL");
      }
    },
  };
}
