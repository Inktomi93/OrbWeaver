// infra/plugin-host/cascade-scope — the cause a plugin's host call hands the domain work it runs. The app opens it around
// each bridge call with that command's authority, and it follows that work across every await, so a domain event the
// work raises, delivered later on the automation fan-out, still names the plugin command that caused it. One scope per
// root, minted at compose, which hands its `run` to the plugin host and its `current` to the plugin domain's event
// delivery: the two sides never import each other.
//
// Work the call starts and leaves running, such as a turn it requests, carries the cause too, which is the point: what
// it raises was caused by that command. The cause names its installer, and only that installer's plugins read it.

import { AsyncLocalStorage } from "node:async_hooks";
import type { PluginCascadeScope } from "./contract/port.ts";

/** Mint one root's cascade scope. */
export function createPluginCascadeScope(): PluginCascadeScope {
  const causes = new AsyncLocalStorage<Parameters<PluginCascadeScope["run"]>[0]>();
  return {
    run: (cause, work) => causes.run(cause, work),
    current: () => causes.getStore(),
  };
}
