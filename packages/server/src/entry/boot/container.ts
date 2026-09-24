import { existsSync } from "node:fs";

/** The marker files a container runtime writes into every container: Docker (Engine and Desktop), then Podman. */
export const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"] as const;

/** Whether this process runs in a container, read from the runtime's own marker files. It only picks which fix an
 *  operator-facing message names; no control keys on it. */
export function runsInContainer(exists: (path: string) => boolean = existsSync): boolean {
  return CONTAINER_MARKER_FILES.some((path) => exists(path));
}
