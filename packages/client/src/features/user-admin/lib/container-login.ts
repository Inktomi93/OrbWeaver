// The container's switch to the local sign-in mode, as the admin surfaces print it. The lines come from
// `CONTAINER_LOCAL_LOGIN_ENV`, which a server env test boots over the shipped container env.

import { CONTAINER_LOCAL_LOGIN_ENV } from "@orb/contracts/identity";

// An empty value prints as `""`: in YAML that sets the key to nothing, where a bare key would leave the file's value.
function yamlLine([key, value]: readonly [string, string]): string {
  return `${key}: ${value === "" ? '""' : value}`;
}

/** The lines to paste into the `environment:` block of `docker-compose.yaml`. */
export const CONTAINER_LOGIN_LINES = CONTAINER_LOCAL_LOGIN_ENV.map(yamlLine).join("\n");

/** The step both surfaces print, without its end: each surface adds the step that follows it there. */
export const CONTAINER_LOGIN_STEP = `In Docker, set ${CONTAINER_LOCAL_LOGIN_ENV.map(yamlLine).join(", ")} in the environment: block of docker-compose.yaml`;
