// The dev supervisor's pure decisions: a host export wins over a pin, a relative run dir resolves against
// the repo root from any cwd, and the ports follow the server's own `.env`-over-shell precedence.
import { join, resolve } from "node:path";
import { DEV_PORTS } from "../../../../tooling/src/_shared/ports.ts";
import { devStackPins, printablePins, stackContext, stackPorts, stackRunDir } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a host export wins over a pin, an empty export does not, and every source is named", () => {
  const pins = devStackPins(
    Object.fromEntries([
      ["AUTH_MODE", "local"],
      ["SESSION_SECRET", ""],
    ]),
  );
  expect(pins.env.AUTH_MODE).toBe("local");
  expect(pins.sources.AUTH_MODE).toBe("host");
  expect(pins.env.SESSION_SECRET.length).toBeGreaterThan(0);
  expect(pins.sources.SESSION_SECRET).toBe("pinned");
  expect(pins.env.DEV_SEED).toBe("on");
  expect(pins.sources.DEV_SEED).toBe("pinned");
});

test("the supervisor's pin verdict travels to the leader, where every pin arrives as an export", () => {
  // The supervisor fills two pins from a shell that set the rest; the leader's env then carries all six.
  const supervisor = devStackPins(
    Object.fromEntries([
      ["AUTH_MODE", "local"],
      ["SESSION_SECRET", "s".repeat(40)],
    ]),
  );
  const ctx = stackContext(
    "/repo",
    Object.fromEntries([
      ["AUTH_MODE", "local"],
      ["SESSION_SECRET", "s".repeat(40)],
    ]),
    null,
  );
  const leader = devStackPins(ctx.ambient);
  expect(leader.sources).toEqual(supervisor.sources);
  expect(leader.env).toEqual(supervisor.env);
  expect(printablePins(leader)).toEqual(
    Object.fromEntries([
      ["AUTH_FALLBACK", "owner"],
      ["AUTH_MODE", "local"],
      ["DEV_SEED", "on"],
    ]),
  );
});

test("STACK_RUN_DIR is resolved against the repo root, never the caller's cwd", () => {
  expect(stackRunDir("/repo", undefined)).toBe(join("/repo", ".cache", "stack"));
  expect(stackRunDir("/repo", "")).toBe(join("/repo", ".cache", "stack"));
  // The e2e modes and the fixture pass a dotted relative path; it must land under the repo.
  expect(stackRunDir("/repo", "./.cache/e2e/single/stack")).toBe(resolve("/repo", ".cache/e2e/single/stack"));
  expect(stackRunDir("/repo", "/elsewhere/stack")).toBe("/elsewhere/stack");
});

test("the ports follow `.env` over the shell, unless the launch skips the file", () => {
  expect(stackPorts({}, null)).toEqual(DEV_PORTS);
  expect(stackPorts(Object.fromEntries([["PORT", "9000"]]), "PORT=9100\nVITE_PORT=5200\n")).toEqual({ server: 9100, vite: 5200 });
  expect(
    stackPorts(
      Object.fromEntries([
        ["PORT", "9000"],
        ["ORB_ENV_NO_FILE", "1"],
      ]),
      "PORT=9100\n",
    ),
  ).toEqual({ server: 9000, vite: DEV_PORTS.vite });
  // A port the OS cannot bind falls back to the registry default rather than poisoning every probe.
  expect(stackPorts(Object.fromEntries([["PORT", "70000"]]), null).server).toBe(DEV_PORTS.server);
});

test("the context threads one run dir and one port pair into the leader env and the log paths", () => {
  const ctx = stackContext(
    "/repo",
    Object.fromEntries([
      ["PATH", "/bin"],
      ["STACK_RUN_DIR", "./.cache/side/stack"],
      ["PORT", "8790"],
      ["VITE_PORT", "5175"],
    ]),
    null,
  );
  expect(ctx.runDir).toBe(resolve("/repo", ".cache/side/stack"));
  expect(ctx.ports).toEqual({ server: 8790, vite: 5175 });
  expect(ctx.launchEnv["STACK_RUN_DIR"]).toBe(ctx.runDir);
  expect(ctx.launchEnv["VITE_PORT"]).toBe("5175");
  expect(ctx.launchEnv["VITE_API_TARGET"]).toBe("http://127.0.0.1:8790");
  expect(ctx.launchEnv["AUTH_MODE"]).toBe("single-user");
  expect(ctx.ambient["PATH"]).toBe("/bin");
  expect(ctx.ambient["STACK_RUN_DIR"]).toBe(ctx.runDir);
  expect(ctx.logs).toEqual({ stack: join(ctx.runDir, "stack.log"), server: join(ctx.runDir, "server.log"), client: join(ctx.runDir, "client.log") });
});
