// THE MUTE-SOCKET PIN for the session client (#1508). `sessionRequest` settled only on the socket's own
// `close`/`error` or a `done` event, so a daemon that ACCEPTED the connection and then wrote nothing held
// its caller forever. `pingOk` awaits it UNWRAPPED inside `bootSession`'s poll, and the poll only rechecks
// `SESSION_BOOT_TIMEOUT_MS` after that await returns — so the boot ceiling was unreachable by construction.
//
// The fake daemon here is a plain unix socket server: no snap, no browser, no stage, no port.
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import type { SessionRequest } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import { sessionRequest } from "../../../../tooling/src/snap/ops/session-client.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SILENCE_MS = 1200;

// WALL CLOCK, through ONE door: the subject of the arms below is a real deadline settling on real time (a
// socket that says nothing, a child that hangs) — there is no clock to inject into the other side.
// @orb-gate-ignore test-determinism: the SUBJECT is a real deadline measured on real time — the far side (a mute socket / a hung child) has no injectable clock
const wallNowMs = (): number => Date.now();
/** The settle slack: how far past its own deadline the door may run before we call it a hang. */
const SETTLE_SLACK_MS = scaledBudget(20_000);

function pingRequest(): SessionRequest {
  return {
    v: SESSION_PROTOCOL_VERSION,
    kind: "ping",
    runId: "",
    slotDir: "",
    argv: [],
    cwd: process.cwd(),
    checkout: process.cwd(),
    boot: false,
    force: false,
    exportOut: null,
  };
}

/** One connection's half of the wire, as the fake daemon sees it. `end` matters: `sessionRequest` resolves
 *  on the socket's CLOSE, so a real daemon hangs up after its `done` line and a fixture that does not is
 *  indistinguishable from one that went mute (it is how this control first failed). */
interface FakeWire {
  readonly write: (line: string) => void;
  readonly end: () => void;
}

/** A daemon that accepts and then behaves as `onConnect` says. Returns its socket path + a closer. */
async function fakeDaemon(home: string, onConnect: (wire: FakeWire) => void): Promise<{ readonly socketPath: string; readonly server: Server }> {
  const socketPath = path.join(home, "daemon.sock");
  const server = createServer((socket) => {
    onConnect({ write: (line) => void socket.write(`${line}\n`), end: () => socket.end() });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return { socketPath, server };
}

function doneLine(exit: number): string {
  return JSON.stringify({ kind: "done", exit, pairs: [] });
}

test("sessionRequest: a daemon that accepts and then says NOTHING is refused at the silence deadline (#1508)", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-session-mute-"));
  const { socketPath, server } = await fakeDaemon(home, () => undefined);
  try {
    const started = wallNowMs();
    // The defect made this await never return. `rejects` is the contract: an unmeasurable call is the
    // caller's "I could not measure" (it prints SESSION ERROR and exits toolError), never a verdict.
    await expect(sessionRequest(socketPath, pingRequest(), () => undefined, SILENCE_MS)).rejects.toThrow(/sent nothing/u);
    expect(wallNowMs() - started, "the door must settle at its own deadline, not hang").toBeLessThan(SILENCE_MS + SETTLE_SLACK_MS);
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("sessionRequest: the clock measures SILENCE — a chatty long call is never cut off (#1508 planted control)", async () => {
  // The other direction, and the reason this is not a total-duration timeout: a session CALL drives a
  // browser and legitimately runs far longer than any one quiet stretch. Here the daemon talks for well
  // past the deadline in sub-deadline increments, then finishes — and must be allowed to.
  const home = mkdtempSync(path.join(tmpdir(), "orb-session-chatty-"));
  const beats = 4;
  const beatMs = Math.floor(SILENCE_MS / 2);
  const { socketPath, server } = await fakeDaemon(home, (wire) => {
    let sent = 0;
    const tick = setInterval(() => {
      sent += 1;
      if (sent > beats) {
        clearInterval(tick);
        wire.write(doneLine(0));
        wire.end();
        return;
      }
      wire.write(JSON.stringify({ kind: "line", text: `working ${sent}` }));
    }, beatMs);
  });
  try {
    const started = wallNowMs();
    const seen: string[] = [];
    const exit = await sessionRequest(socketPath, pingRequest(), (event) => seen.push(event.kind), SILENCE_MS);
    expect(exit).toBe(0);
    expect(seen.filter((kind) => kind === "line")).toHaveLength(beats);
    expect(wallNowMs() - started, "the call must have outlived the silence deadline while still talking").toBeGreaterThan(SILENCE_MS);
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
  }
});
