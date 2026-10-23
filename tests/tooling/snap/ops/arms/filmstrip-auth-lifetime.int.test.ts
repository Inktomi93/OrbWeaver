// The filmstrip cookie-isolation fixture owns its real child through readiness refusal and close.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { startFilmstripAuthFixture } from "@orb/testkit/node/helpers";
import { expect, test } from "@orb/testkit/tooling";
import { listProcesses } from "@orb/tooling/floor/host/platform";
import { killPidGroup } from "@orb/tooling/floor/process/proc";

function fixtureChildren(scratch: string): readonly number[] {
  const script = join(scratch, "filmstrip-auth-fixture.mjs");
  return listProcesses()
    .filter((entry) => entry.ppid === process.pid && entry.cmdline.includes(script))
    .map((entry) => entry.pid);
}

test("the cookie-isolation fixture serves distinct sessions and close observes child completion", async ({ scratch }) => {
  const fixture = await startFilmstripAuthFixture(scratch);
  try {
    expect(fixtureChildren(scratch)).toHaveLength(1);
    expect((await fetch(`${fixture.base}/healthz`)).status).toBe(200);
    expect((await fetch(`${fixture.base}/api/whoami`)).status).toBe(401);
    const rejected = await fetch(`${fixture.base}/api/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ handle: "owner", password: "wrong" }),
    });
    expect(rejected.status).toBe(401);
    expect(rejected.headers.getSetCookie()).toEqual([]);
    const cookies: string[] = [];
    for (const handle of ["owner", "member"]) {
      const login = await fetch(`${fixture.base}/api/auth/login`, {
        method: "POST",
        body: new URLSearchParams({ handle, password: `${handle}-dev-pass` }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.getSetCookie()[0]?.split(";")[0];
      expect(cookie).toBeDefined();
      if (cookie === undefined) {
        throw new Error("fixture login did not publish a session cookie");
      }
      cookies.push(cookie);
      const viewer = await fetch(`${fixture.base}/api/whoami`, { headers: { cookie } });
      expect(viewer.status).toBe(200);
      expect(await viewer.json()).toEqual({ handle });
    }
    expect(new Set(cookies).size).toBe(2);
  } finally {
    await fixture.close();
  }
  expect(fixtureChildren(scratch)).toEqual([]);
  await fixture.close();
  await expect(fetch(`${fixture.base}/healthz`)).rejects.toThrow();
});

test.runIf(process.platform !== "win32")("close reaps a suspended owned child instead of crediting a signal and delay", async ({ scratch }) => {
  const fixture = await startFilmstripAuthFixture(scratch);
  try {
    const children = fixtureChildren(scratch);
    expect(children).toHaveLength(1);
    for (const child of children) {
      killPidGroup(child, "SIGSTOP");
    }
    await fixture.close();
    expect(fixtureChildren(scratch)).toEqual([]);
  } finally {
    for (const child of fixtureChildren(scratch)) {
      killPidGroup(child, "SIGKILL");
    }
    await expect.poll(() => fixtureChildren(scratch)).toEqual([]);
  }
});

test.for([
  { name: "invalid-json", content: "{", refusal: { name: "SyntaxError" } },
  {
    name: "wrong-port-kind",
    content: JSON.stringify({ port: "not-a-port" }),
    refusal: { message: 'filmstrip auth fixture published malformed readiness: {"port":"not-a-port"}' },
  },
  { name: "read-error", content: null, refusal: { code: "EISDIR" } },
])("readiness $name refuses without leaving the spawned child behind", async ({ content, refusal }, { scratch }) => {
  const ready = join(scratch, "filmstrip-auth-fixture.ready.json");
  if (content === null) {
    await mkdir(ready);
  } else {
    await writeFile(ready, content);
  }
  try {
    await expect(startFilmstripAuthFixture(scratch)).rejects.toMatchObject(refusal);
    expect(fixtureChildren(scratch)).toEqual([]);
  } finally {
    for (const child of fixtureChildren(scratch)) {
      killPidGroup(child, "SIGKILL");
    }
    await expect.poll(() => fixtureChildren(scratch)).toEqual([]);
  }
});
