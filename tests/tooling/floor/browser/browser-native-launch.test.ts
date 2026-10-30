import { expect, test } from "@orb/testkit/tooling";
import { browserLaunchEnvironment, nativeBrowserLaunchOptions } from "@orb/tooling/floor/browser/browser";
import type { GraphicalSessionDeps } from "@orb/tooling/floor/host/platform";
import { inheritedProcessEnv, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { inheritedRunMarker, mintRunMarker, RUN_LEASE_ENV, RUN_MARKER_ENV, runLeaseArg, runMarkerArg } from "@orb/tooling/floor/process/run-marker";

test("native Chromium preserves explicit graphics and caller launch choices beside inherited ownership", async () => {
  const marker = mintRunMarker(41, 1000);
  const lease = mintRunMarker(42, 1000);
  await withProcessEnv(RUN_MARKER_ENV, marker, async () => {
    await withProcessEnv(RUN_LEASE_ENV, lease, () => {
      const options = nativeBrowserLaunchOptions("chromium", {
        args: ["--disable-gpu", "--ozone-platform=wayland"],
        env: { ["DISPLAY"]: "", ["XAUTHORITY"]: "/caller/authority" },
        headless: true,
        timeout: 1234,
      });
      expect(options.args).toEqual(["--enable-gpu", "--disable-gpu", "--ozone-platform=wayland", runMarkerArg(marker), runLeaseArg(lease)]);
      expect(options.env).toMatchObject({ ["DISPLAY"]: "", ["XAUTHORITY"]: "/caller/authority", [RUN_MARKER_ENV]: marker, [RUN_LEASE_ENV]: lease });
      expect(options.headless).toBe(true);
      expect(options.timeout).toBe(1234);
      expect(inheritedRunMarker()).toBe(marker);
      return Promise.resolve();
    });
  });
});

test("native non-Chromium launch retains caller arguments without Chromium switches or identity mutation", () => {
  const marker = inheritedRunMarker();
  for (const browserName of ["firefox", "webkit"] as const) {
    const options = nativeBrowserLaunchOptions(browserName, { args: ["caller-argument"], env: { ["DISPLAY"]: "caller-display" }, headless: false });
    expect(options.args).toEqual(["caller-argument"]);
    expect(options.env?.["DISPLAY"]).toBe("caller-display");
    expect(options.headless).toBe(false);
    expect(inheritedRunMarker()).toBe(marker);
  }
});

test("native config construction cannot mint an owner when no run identity was inherited", async () => {
  await withProcessEnv(RUN_MARKER_ENV, "", async () => {
    await withProcessEnv(RUN_LEASE_ENV, "", () => {
      const options = nativeBrowserLaunchOptions("chromium", { env: { ["DISPLAY"]: "" } });
      expect(options.args).toEqual(["--enable-gpu"]);
      expect(inheritedRunMarker()).toBeNull();
      return Promise.resolve();
    });
  });
});

test("macOS and Windows native launch profiles do not depend on Linux sessions or credential files", () => {
  const inherited = inheritedProcessEnv();
  for (const platform of ["darwin", "win32"] as const) {
    const reads: string[] = [];
    const deps: GraphicalSessionDeps = {
      platform,
      run: (command) => {
        reads.push(command);
        throw new Error("Non-Linux launch must not invoke a Linux session command");
      },
      stat: (path) => {
        reads.push(path);
        throw new Error("Non-Linux launch must not inspect X11 credentials or sockets");
      },
    };
    const base = { ["PATH"]: "native-path" };
    expect(browserLaunchEnvironment(base, [], deps)).toBe(base);
    const options = nativeBrowserLaunchOptions("chromium", { headless: true }, deps);
    expect(options.args).toContain("--enable-gpu");
    expect(options.env?.["DISPLAY"]).toBe(inherited["DISPLAY"]);
    expect(options.env?.["XAUTHORITY"]).toBe(inherited["XAUTHORITY"]);
    expect(options.env?.["WAYLAND_DISPLAY"]).toBe(inherited["WAYLAND_DISPLAY"]);
    expect(options.headless).toBe(true);
    expect(reads).toEqual([]);
  }
});

test("headless Linux without session discovery keeps the ordinary browser fallback", () => {
  const calls: string[] = [];
  const deps: GraphicalSessionDeps = {
    platform: "linux",
    account: { uid: 41, homedir: "/headless-account" },
    run: (command) => {
      calls.push(command);
      return { status: null, errorCode: "ENOENT", stdout: "", stderr: "" };
    },
    stat: () => {
      throw new Error("Missing session discovery must not require credential files");
    },
  };
  const base = { ["PATH"]: "native-path" };
  expect(browserLaunchEnvironment(base, [], deps)).toBe(base);
  expect(calls).toEqual(["loginctl"]);
  const options = nativeBrowserLaunchOptions("chromium", { args: ["--disable-gpu"], headless: true }, deps);
  expect(options.args?.slice(0, 2)).toEqual(["--enable-gpu", "--disable-gpu"]);
  expect(options.headless).toBe(true);
});

test("WebKit and Firefox never invoke the Chromium graphics discovery path", () => {
  const deps: GraphicalSessionDeps = {
    platform: "linux",
    run: () => {
      throw new Error("Non-Chromium launch must not discover a graphics session");
    },
  };
  for (const browserName of ["firefox", "webkit"] as const) {
    const options = nativeBrowserLaunchOptions(browserName, {}, deps);
    expect(options.args).toBeUndefined();
    expect(options.env).toMatchObject(inheritedProcessEnv());
  }
});
