// The boot refusal a misconfigured environment raises: one line per refused key, never the parser's dump. The entry
// point prints the message alone, because a stack trace would bury the key the operator has to fix. This module parses
// nothing at load, so the entry point can import it before the env module runs.

import type { z } from "zod";

// The line an issue with no key path belongs to: a refusal of the environment as a whole.
const WHOLE_ENVIRONMENT = "environment";

/** The refused keys of one env parse, each with the schema's own sentence for it. */
export function formatEnvRefusal(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const key = issue.path.length === 0 ? WHOLE_ENVIRONMENT : issue.path.map(String).join(".");
      return `env refused ${key}: ${issue.message}`;
    })
    .join("\n");
}

/** Thrown by the env module's parse. The entry point catches it by class and prints only its message. */
export class EnvRefusedError extends Error {
  constructor(error: z.ZodError) {
    super(formatEnvRefusal(error));
    this.name = "EnvRefusedError";
  }
}
