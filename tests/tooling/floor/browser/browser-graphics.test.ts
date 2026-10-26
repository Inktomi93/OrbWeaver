import type { Stats } from "node:fs";
import { expect, test } from "@orb/testkit/tooling";
import { browserLaunchEnvironment } from "@orb/tooling/floor/browser/browser";
import type { GraphicalSessionDeps } from "@orb/tooling/floor/host/platform";
import type { RunNicedSyncResult } from "@orb/tooling/floor/process/proc";
import { RUN_LEASE_ENV, RUN_MARKER_ENV } from "@orb/tooling/floor/process/run-marker";

const ACCOUNT = { uid: 42, homedir: "/home/desktop-user" };
const AUTHORITY = `${ACCOUNT.homedir}/.Xauthority`;
const ENVIRONMENT = { ["HOME"]: "/untrusted-home", ["PATH"]: "/bin", [RUN_MARKER_ENV]: "outer-run", [RUN_LEASE_ENV]: "owned-lease" };
const SESSION = "User=42\nActive=yes\nRemote=no\nType=x11\nSeat=seat7\nDisplay=:9.0\n";

type FileInfo = ReturnType<NonNullable<GraphicalSessionDeps["stat"]>>;
function metadata(kind: "file" | "socket" | "symlink", uid = ACCOUNT.uid, mode = 0o600): FileInfo {
  return { uid, mode, isFile: (): boolean => kind === "file", isSocket: (): boolean => kind === "socket" };
}

function host(
  options: {
    readonly sessions?: readonly string[];
    readonly replies?: ReadonlyMap<string, string>;
    readonly auth?: FileInfo;
    readonly socket?: FileInfo;
    readonly readable?: boolean;
    readonly failed?: boolean;
  } = {},
): { readonly deps: GraphicalSessionDeps; readonly commands: string[][]; readonly files: string[] } {
  const commands: string[][] = [];
  const files: string[] = [];
  return {
    commands,
    files,
    deps: {
      platform: "linux",
      account: ACCOUNT,
      run: (command, args, limits): RunNicedSyncResult => {
        commands.push([command, ...args]);
        expect(limits.timeout).toBeGreaterThan(0);
        expect(limits.maxBuffer).toBeGreaterThan(0);
        if (options.failed) {
          return { status: null, errorCode: "ENOENT", stdout: "", stderr: "missing" };
        }
        const stdout = args[0] === "show-user" ? (options.sessions ?? ["c7"]).join(" ") : (options.replies?.get(args[1] ?? "") ?? SESSION);
        return { status: 0, stdout, stderr: "" };
      },
      stat: (path): FileInfo => {
        files.push(path);
        return path === AUTHORITY ? (options.auth ?? metadata("file")) : (options.socket ?? metadata("socket"));
      },
      readable: () => options.readable ?? true,
    },
  };
}

test("missing graphics context discovers the sole own local X11 session and preserves launch identities", () => {
  const native = host();
  expect(browserLaunchEnvironment(ENVIRONMENT, [], native.deps)).toEqual({ ...ENVIRONMENT, ["DISPLAY"]: ":9.0", ["XAUTHORITY"]: AUTHORITY });
  expect(native.commands[0]).toEqual(["loginctl", "show-user", "42", "--property=Sessions", "--value", "--no-pager"]);
  expect(native.commands[1]?.slice(0, 3)).toEqual(["loginctl", "show-session", "c7"]);
  expect(native.files).toEqual([AUTHORITY, "/tmp/.X11-unix/X9"]);
});

test("every explicit graphics selector, including an empty value, prevents automatic discovery", () => {
  for (const key of ["DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY"]) {
    for (const value of ["", "explicit-value"]) {
      const native = host();
      const env = { ...ENVIRONMENT, [key]: value };
      expect(browserLaunchEnvironment(env, [], native.deps)).toBe(env);
      expect(native.commands).toEqual([]);
    }
  }
  for (const args of [["--ozone-platform=wayland"], ["--ozone-platform", "headless"], ["--headless"], ["--headless=new"]]) {
    const native = host();
    expect(browserLaunchEnvironment(ENVIRONMENT, args, native.deps)).toBe(ENVIRONMENT);
    expect(native.commands).toEqual([]);
  }
  const native = host();
  const env = { ...ENVIRONMENT, ["XDG_SESSION_TYPE"]: "wayland" };
  expect(browserLaunchEnvironment(env, [], native.deps)).toBe(env);
  expect(native.commands).toEqual([]);
});

test("foreign, remote, inactive, non-X11, seatless and nonlocal displays never become an automatic desktop", () => {
  for (const [from, to] of [
    ["User=42", "User=43"],
    ["Remote=no", "Remote=yes"],
    ["Active=yes", "Active=no"],
    ["Active=yes", "Active=invalid"],
    ["Type=x11", "Type=wayland"],
    ["Seat=seat7", "Seat="],
    ["Display=:9.0", "Display=remote:9"],
    ["Display=:9.0", "Display=localhost:10.0"],
    ["Display=:9.0", "Display="],
  ]) {
    const native = host({ replies: new Map([["c7", SESSION.replace(from ?? "", to ?? "")]]) });
    expect(browserLaunchEnvironment(ENVIRONMENT, [], native.deps)).toBe(ENVIRONMENT);
  }
});

test("ambiguous sessions are rejected before file filtering and malformed IDs never reach loginctl", () => {
  const ambiguous = host({ sessions: ["c7", "c8"], replies: new Map([["c8", SESSION.replace(":9.0", ":10")]]) });
  expect(browserLaunchEnvironment(ENVIRONMENT, [], ambiguous.deps)).toBe(ENVIRONMENT);
  expect(ambiguous.files).toEqual([]);
  const malformed = host({ sessions: ["--host=foreign"] });
  expect(browserLaunchEnvironment(ENVIRONMENT, [], malformed.deps)).toBe(ENVIRONMENT);
  expect(malformed.commands).toHaveLength(1);
});

test("unavailable or malformed metadata and unsupported platforms leave the environment unchanged", () => {
  for (const options of [
    { failed: true },
    { sessions: [] },
    { replies: new Map([["c7", "User=42\n"]]) },
    { replies: new Map([["c7", `${SESSION}User=42\n`]]) },
  ]) {
    const native = host(options);
    expect(browserLaunchEnvironment(ENVIRONMENT, [], native.deps)).toBe(ENVIRONMENT);
  }
  for (const platform of ["darwin", "win32", "freebsd"] as const) {
    const native = host();
    expect(browserLaunchEnvironment(ENVIRONMENT, [], { ...native.deps, platform })).toBe(ENVIRONMENT);
    expect(native.commands).toEqual([]);
  }
});

test("auth and socket metadata cannot select a foreign, public, unreadable or symlinked credential", () => {
  for (const options of [
    { auth: metadata("file", 43) },
    { auth: metadata("file", ACCOUNT.uid, 0o644) },
    { auth: metadata("file", ACCOUNT.uid, 0o200) },
    { auth: metadata("symlink") },
    { readable: false },
    { socket: metadata("file") },
    { socket: metadata("socket", 43) },
  ]) {
    const native = host(options);
    expect(browserLaunchEnvironment(ENVIRONMENT, [], native.deps)).toBe(ENVIRONMENT);
  }
  const rootSocket = host({ socket: metadata("socket", 0) });
  expect(browserLaunchEnvironment(ENVIRONMENT, [], rootSocket.deps)["DISPLAY"]).toBe(":9.0");
  const gone = host();
  expect(
    browserLaunchEnvironment(ENVIRONMENT, [], {
      ...gone.deps,
      stat: (): Stats => {
        throw new Error("unreadable metadata");
      },
    }),
  ).toBe(ENVIRONMENT);
});
