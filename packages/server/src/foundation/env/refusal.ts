// The boot refusal a misconfigured environment raises: each refused key with its path, never the parser's dump. The
// entry point prints the message alone, because a stack trace would bury the key the operator has to fix. This module
// parses nothing at load, so the entry point can import it before the env module runs.

import { z } from "zod";

/** The refused keys of one env parse, each with the schema's own sentence and the path that names the key. */
export function formatEnvRefusal(error: z.ZodError): string {
  return `The environment was refused:\n${z.prettifyError(error)}`;
}

/** Thrown by the env module's parse. The entry point catches it by class and prints only its message. */
export class EnvRefusedError extends Error {
  constructor(error: z.ZodError) {
    super(formatEnvRefusal(error));
    this.name = "EnvRefusedError";
  }
}
