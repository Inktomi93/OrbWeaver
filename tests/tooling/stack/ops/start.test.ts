// `pnpm start`'s SIGNAL half (tooling/src/stack/ops/start.ts, through the tool front door). The launcher
// runs the production server in the FOREGROUND, so Ctrl-C must reach the server's own bounded drain
// rather than killing the launcher out from under it — and a launcher that registers no handler, or
// registers one for a signal it never forwards, looks identical from outside until a real Ctrl-C leaves
// an orphaned server holding the port.
//
// The registrar is injected, so the wiring is asserted without signalling this vitest worker (a real
// SIGTERM here would take the runner down). The end-to-end half — Ctrl-C on a live boot exiting 130 — is
// the lane's live receipt; `childExitCode` pins the 128+N arithmetic in ../lib/start-plan.test.ts.
import { FORWARDED_SIGNALS, forwardSignalsTo } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function fakeChild(): { readonly killed: NodeJS.Signals[]; readonly kill: (signal: NodeJS.Signals) => void } {
  const killed: NodeJS.Signals[] = [];
  return { killed, kill: (signal) => killed.push(signal) };
}

test("every forwarded signal is registered, and each one forwards ITSELF to the child", () => {
  const child = fakeChild();
  const registered: NodeJS.Signals[] = [];
  const handlers = new Map<NodeJS.Signals, () => void>();
  forwardSignalsTo(child, (signal, handler) => {
    registered.push(signal);
    handlers.set(signal, handler);
  });

  expect(registered).toEqual([...FORWARDED_SIGNALS]);
  // A Ctrl-C (SIGINT), the supervisor's SIGTERM and a closed terminal (SIGHUP) all have to reach the
  // server: the launcher owns no pidfile and no process group, so the child's own handler IS the drain.
  expect([...FORWARDED_SIGNALS]).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);

  for (const signal of FORWARDED_SIGNALS) {
    handlers.get(signal)?.();
  }
  expect(child.killed).toEqual([...FORWARDED_SIGNALS]);
});

test("registering does NOT signal the child — the kill happens only when a handler actually fires", () => {
  const child = fakeChild();
  forwardSignalsTo(child, () => {
    // registered, never fired
  });
  expect(child.killed).toEqual([]);
});
