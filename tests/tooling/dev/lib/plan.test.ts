// `pnpm dev`'s pure decisions: which source trees restart the server, and which port and proxy target vite gets.
import { join } from "node:path";
import { DEV_PORTS, MAX_TCP_PORT } from "@orb/tooling/_shared/ports";
import type { WorkspacePackage } from "../../../../tooling/src/dev/index.ts";
import { devChildEnv, resolveVitePort, SERVER_PACKAGE, serverWatchRoots, VITE_API_TARGET_ENV, VITE_PORT_ENV } from "../../../../tooling/src/dev/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
