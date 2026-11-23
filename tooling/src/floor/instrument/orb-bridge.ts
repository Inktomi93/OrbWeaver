// The probes' one door onto the client's dev bridge types. The client declares `globalThis.__orb` in
// `packages/client/src/lib/agent-bridge-contract.ts`; importing that file puts the global in this program, so a
// `page.evaluate` closure that reads `globalThis.__orb` is checked against the real handle and a renamed accessor fails tsc.
// The contract stays DOM-free, and so does every module it imports, because this program carries no DOM lib.
import type { OrbDebugHandle } from "@orb/client/agent-bridge-contract";

/** The bridge as an in-page closure or an in-page census global sees it. */
export type OrbBridge = OrbDebugHandle;

/** The SPA-navigation half of the bridge. */
export type OrbNav = OrbDebugHandle["nav"];
