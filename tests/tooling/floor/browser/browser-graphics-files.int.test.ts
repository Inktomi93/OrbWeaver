// The graphical-session file checks against real files: the default metadata read is the subject, so no `stat` is injected.
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { browserLaunchEnvironment } from "@orb/tooling/floor/browser/browser";
import type { GraphicalSessionDeps } from "@orb/tooling/floor/host/platform";
import type { RunNicedSyncResult } from "@orb/tooling/floor/process/proc";

const SESSION = "User=1\nActive=yes\nRemote=no\nType=x11\nSeat=seat0\nDisplay=:9.0\n";
const ENVIRONMENT = { ["HOME"]: "/untrusted-home", ["PATH"]: "/bin" };

function loginctl(uid: number): NonNullable<GraphicalSessionDeps["run"]> {
  return (_command, args): RunNicedSyncResult => ({
    status: 0,
    stdout: args[0] === "show-user" ? "c1" : SESSION.replace("User=1", `User=${String(uid)}`),
    stderr: "",
  });
}

test("the default metadata read refuses a symlinked .Xauthority and admits the same file when it is not a link", async ({ scratch }) => {
  const uid = process.getuid?.() ?? 0;
  const sockets = join(scratch, "x11");
  mkdirSync(sockets);
  const cookie = join(scratch, "cookie");
  writeFileSync(cookie, "cookie");
  chmodSync(cookie, 0o600);
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(join(sockets, "X9"), resolve));
  try {
    const deps = (homedir: string): GraphicalSessionDeps => ({ platform: "linux", account: { uid, homedir }, run: loginctl(uid), socketDirectory: sockets });

    const direct = join(scratch, "direct");
    mkdirSync(direct);
    writeFileSync(join(direct, ".Xauthority"), "cookie");
    chmodSync(join(direct, ".Xauthority"), 0o600);
    expect(browserLaunchEnvironment(ENVIRONMENT, [], deps(direct))).toEqual({
      ...ENVIRONMENT,
      ["DISPLAY"]: ":9.0",
      ["XAUTHORITY"]: join(direct, ".Xauthority"),
    });

    const linked = join(scratch, "linked");
    mkdirSync(linked);
    symlinkSync(cookie, join(linked, ".Xauthority"));
    expect(browserLaunchEnvironment(ENVIRONMENT, [], deps(linked))).toBe(ENVIRONMENT);
  } finally {
    server.close();
  }
});
