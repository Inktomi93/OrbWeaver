// The install shape — bare metal or a container — and the commands that tell an operator how to change a setting
// or read a boot secret on it. Every operator-facing refusal (the env parse, the Host allowlist page) names the fix
// through `settingInstruction`, so the two shapes' fix text has one home.

import { existsSync } from "node:fs";
import { BARE_METAL_ENV_FILE, COMPOSE_FILE, CONTAINER_ENV_FILE, SETUP_COMMAND } from "@orb/contracts/identity";

/** The marker files a container runtime writes: Docker (Engine and Desktop), then Podman. containerd and CRI-O write
 *  neither, which is why the image also declares itself. */
export const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"] as const;

// The service name in the shipped `docker-compose.yaml`; the entrypoint's first-boot banner names it too.
const COMPOSE_SERVICE = "orbweaver";

/** Whether this process runs in a container: the image's own declaration (`ORB_CONTAINER`, set by the Dockerfile),
 *  else a marker file the runtime writes. It picks which fix an operator-facing message names, and whether the
 *  machine's own name is a name this server answers to. */
export function runsInContainer(declared: boolean, exists: (path: string) => boolean = existsSync): boolean {
  return declared || CONTAINER_MARKER_FILES.some((path) => exists(path));
}

/** How to set `key` to `value` on this install, as one clause ending in the restart. A container leads with the
 *  compose `environment:` block (the container reads no `.env` from the checkout); bare metal leads with setup. */
export function settingInstruction(inContainer: boolean, key: string, value: string): string {
  return inContainer
    ? `add ${key}: ${value} under environment: in ${COMPOSE_FILE} (or ${key}=${value} in ${CONTAINER_ENV_FILE}), then restart the container`
    : `run ${SETUP_COMMAND}, or set ${key}=${value} in ${BARE_METAL_ENV_FILE}, then restart`;
}

/** The shell command that prints the file at absolute `path` on this install. A boot secret is named by this
 *  command, never printed, because operators paste container logs into public bug reports. */
export function fileReadCommand(inContainer: boolean, path: string): string {
  return inContainer ? `docker compose exec ${COMPOSE_SERVICE} cat ${path}` : `cat ${path}`;
}
