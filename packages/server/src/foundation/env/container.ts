// The install shape — bare metal or a container — and the one sentence that tells an operator how to change a
// setting on it. Every operator-facing refusal (the env parse, the Host allowlist page) names the fix through
// `settingInstruction`, so the two shapes' fix text has one home.

import { existsSync } from "node:fs";
import { SETUP_COMMAND } from "@orb/contracts/identity";

/** The marker files a container runtime writes into every container: Docker (Engine and Desktop), then Podman. */
export const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"] as const;

const BARE_METAL_ENV_FILE = ".env";
const COMPOSE_FILE = "docker-compose.yaml";
const CONTAINER_ENV_FILE = "docker/orbweaver.local.env";

/** Whether this process runs in a container, read from the runtime's own marker files. It picks which fix an
 *  operator-facing message names, and whether the machine's own name is a name this server answers to. */
export function runsInContainer(exists: (path: string) => boolean = existsSync): boolean {
  return CONTAINER_MARKER_FILES.some((path) => exists(path));
}

/** How to set `key` to `value` on this install, as one clause ending in the restart. A container leads with the
 *  compose `environment:` block (the container reads no `.env` from the checkout); bare metal leads with setup. */
export function settingInstruction(inContainer: boolean, key: string, value: string): string {
  return inContainer
    ? `add ${key}: ${value} under environment: in ${COMPOSE_FILE} (or ${key}=${value} in ${CONTAINER_ENV_FILE}), then restart the container`
    : `run ${SETUP_COMMAND}, or set ${key}=${value} in ${BARE_METAL_ENV_FILE}, then restart`;
}
