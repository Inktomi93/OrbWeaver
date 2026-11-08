// `pnpm dev`'s pure decisions: which source trees restart the server, and which port and proxy target vite gets.
import { join } from "node:path";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { DEV_PORTS, MAX_TCP_PORT } from "@orb/tooling/floor/host/ports";
import type { WorkspacePackage } from "../../../../tooling/src/dev/index.ts";
import {
  childExitLine,
  devChildEnv,
  resolveVitePort,
  SERVER_PACKAGE,
  serverSpawnPlan,
  serverWatchRoots,
  servesBuiltClient,
  tailLines,
  VITE_API_TARGET_ENV,
  VITE_PORT_ENV,
} from "../../../../tooling/src/dev/index.ts";

function pkg(name: string, workspaceDeps: readonly string[] = []): WorkspacePackage {
  return { name, dir: join("/repo", "packages", name), workspaceDeps };
}

test("the server watches its own source and every workspace package it reaches, transitively, and nothing else", () => {
  const packages = [
    pkg("client", ["ui", SERVER_PACKAGE]),
    pkg("ui", ["kit"]),
    pkg(SERVER_PACKAGE, ["db", "inference"]),
    pkg("db", ["contracts"]),
    pkg("inference", ["contracts"]),
    pkg("contracts", ["kit"]),
    pkg("kit"),
  ];
  expect(serverWatchRoots(packages)).toEqual([SERVER_PACKAGE, "db", "inference", "contracts", "kit"].map((name) => join("/repo", "packages", name, "src")));
});

test("an unset vite port is the registry's dev default; a malformed one is refused, never defaulted", () => {
  expect(resolveVitePort(undefined)).toEqual({ ok: true, port: DEV_PORTS.vite });
  expect(resolveVitePort("")).toEqual({ ok: true, port: DEV_PORTS.vite });
  expect(resolveVitePort("5190")).toEqual({ ok: true, port: 5190 });
  for (const bad of ["abc", "0", "-1", "51.5", String(MAX_TCP_PORT + 1)]) {
    const parsed = resolveVitePort(bad);
    expect(parsed.ok, bad).toBe(false);
  }
});

test("vite's proxy follows the server's resolved port unless the env already names a target", () => {
  const followed = devChildEnv(Object.fromEntries([["PATH", "/bin"]]), { server: 9100, vite: 5190 });
  expect(followed[VITE_API_TARGET_ENV]).toBe("http://127.0.0.1:9100");
  expect(followed[VITE_PORT_ENV]).toBe("5190");
  expect(followed["PATH"]).toBe("/bin");

  const pinned = devChildEnv(Object.fromEntries([[VITE_API_TARGET_ENV, "http://10.0.0.5:8788"]]), { server: 9100, vite: 5190 });
  expect(pinned[VITE_API_TARGET_ENV]).toBe("http://10.0.0.5:8788");
});

test("Windows filters actual imported files while other platforms retain explicit source roots", () => {
  const roots = [join("/repo", "packages", "server", "src")];
  const options = { nodePath: "node", server: pkg(SERVER_PACKAGE), watchRoots: roots, watch: true, cwd: "/repo", env: {} };
  const windows = serverSpawnPlan({ ...options, platform: "win32" });
  expect(windows.args).toContain("--watch");
  expect(nonEmpty(windows.args).some((arg) => arg.startsWith("--watch-path="))).toBe(false);
  for (const platform of ["linux", "darwin"] as const) {
    expect(serverSpawnPlan({ ...options, platform }).args).toContain(`--watch-path=${roots[0]}`);
  }
});

test("a server planned without watch carries no watch flag, so a source edit cannot restart or stop it", () => {
  const roots = [join("/repo", "packages", "server", "src")];
  const options = { platform: "linux", nodePath: "node", server: pkg(SERVER_PACKAGE), watchRoots: roots, cwd: "/repo", env: {} } as const;
  const watched = serverSpawnPlan({ ...options, watch: true }).args;
  const fixed = serverSpawnPlan({ ...options, watch: false }).args;
  // POSITIVE CONTROL: the watched plan really does carry the flags the fixed plan must not.
  expect(watched.some((arg) => arg.startsWith("--watch"))).toBe(true);
  expect(nonEmpty(fixed).some((arg) => arg.startsWith("--watch"))).toBe(false);
  expect(fixed.at(-1)).toBe(watched.at(-1));
});

test("only a harness stack that names a built client skips vite", () => {
  expect(servesBuiltClient({ e2eHarness: "on", clientDistDir: "/run/client" })).toBe(true);
  // The dev-target drive boots the operator's own stack, whose origin is vite.
  expect(servesBuiltClient({ e2eHarness: "on", clientDistDir: undefined })).toBe(false);
  expect(servesBuiltClient({ e2eHarness: "on", clientDistDir: "" })).toBe(false);
  expect(servesBuiltClient({ e2eHarness: "off", clientDistDir: "/run/client" })).toBe(false);
});

test("an unasked exit says why with the tail of the child's log, colour removed", () => {
  const log = ["boot", "", "\u001B[31mError: Port 5173 is already in use\u001B[39m", "  ", "exit"].join("\n");
  expect(tailLines(log, 2)).toEqual(["Error: Port 5173 is already in use", "exit"]);
  expect(tailLines("", 2)).toEqual([]);
  expect(childExitLine("vite", "code 1", tailLines(log, 2), "server")).toBe(
    "dev: vite exited (code 1): Error: Port 5173 is already in use | exit; stopping server.",
  );
  expect(childExitLine("vite", "code 1", [], "server")).toBe("dev: vite exited (code 1); stopping server.");
  expect(childExitLine("server", "code 1", [], null)).toBe("dev: server exited (code 1).");
});
