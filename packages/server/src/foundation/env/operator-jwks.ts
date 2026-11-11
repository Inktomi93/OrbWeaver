// The forward-header signing keys the operator names in `FORWARD_AUTH_JWKS`: an https URL or a JWKS JSON literal.
// SECURITY: this env value is the only key source. A key, key set or key URL a request carries never reaches a verifier.

import { parseJsonText } from "@orb/kit/json";
import { z } from "zod";

// The set's own shape (RFC 7517 section 5). Members stay loose: jose owns what a key must hold.
const jwksLiteralSchema = z.object({ keys: z.array(z.looseObject({})).min(1) });

export type OperatorJwks = { readonly kind: "url"; readonly url: URL } | { readonly kind: "literal"; readonly jwks: z.infer<typeof jwksLiteralSchema> };

const LITERAL_START = "{";
const REQUIRED_PROTOCOL = "https:";
const REFUSAL = "FORWARD_AUTH_JWKS must be an https URL or a JWKS JSON object with at least one key.";

function literalFrom(text: string): OperatorJwks | null {
  const parsed = jwksLiteralSchema.safeParse(parseJsonText(text));
  return parsed.success ? { kind: "literal", jwks: parsed.data } : null;
}

function urlFrom(text: string): OperatorJwks | null {
  const url = URL.parse(text);
  return url?.protocol === REQUIRED_PROTOCOL ? { kind: "url", url } : null;
}

/** Parse the operator's key source once at boot, so a bad value refuses the boot instead of every later sign-in. */
export const operatorJwksSchema = z.string().transform((raw, ctx): OperatorJwks => {
  const text = raw.trim();
  const source = text.startsWith(LITERAL_START) ? literalFrom(text) : urlFrom(text);
  if (source === null) {
    ctx.addIssue({ code: "custom", message: REFUSAL });
    return z.NEVER;
  }
  return source;
});
