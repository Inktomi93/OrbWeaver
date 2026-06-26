// The prompt-INJECTION placement primitive — "splice a block of text into the chat history at `depth`
// with `role`". The single shared shape for EVERY at-depth injector (ledger D32): world-info at-depth
// entries, the global author's note, the card's character-specific author's note (`depthPrompt`),
// persona description, summary/memory recall, and guided generations. They all share the `{depth, role}`
// shape + the role union + the depth bound; only the DEFAULT initial values differ per consumer (e.g.
// guided defaults depth 0; persona defaults depth 2 / role system) — and those defaults are passed IN,
// never baked here, so the systems are never tied together.
//
// Pure / isomorphic. The role union comes from `#message-role` (the canonical axis). Kit may use zod
// internally (purity ruling §0); the WIRE/write schemas that layer the assistant-at-depth-0 prefill
// guard etc. live in `@orb/contracts` and import this DOWN.

import { z } from "zod";
import type { MessageRole } from "#message-role";
import { MESSAGE_ROLES } from "#message-role";

// Read-side depth bound — generous; the assembler's splice clamps anyway. Mirrors the contracts write cap.
export const MAX_INJECTION_DEPTH = 100_000;

/** A resolved injection placement: a concrete depth + role. */
export interface InjectionPlacement {
  readonly depth: number;
  readonly role: MessageRole;
}

/** The raw `{depth, role?}` injection directive. `depth` is REQUIRED (a directive with no depth is not a
 *  directive — consumers that treat injection as opt-in-all-or-nothing, e.g. world-info, key off a failed
 *  parse to mean "no injection"); `role` is optional (the consumer's default fills it). The contracts
 *  write schema layers the prefill guard ON this, importing it down. */
export const injectionDirectiveSchema = z.object({
  depth: z.number().int().min(0).max(MAX_INJECTION_DEPTH),
  role: z.enum(MESSAGE_ROLES).optional(),
});

const depthSchema = z.number().int().min(0).max(MAX_INJECTION_DEPTH);
const roleSchema = z.enum(MESSAGE_ROLES);

/** Field-isolated resolve of a raw `{depth?, role?}` blob into a concrete placement, filling each missing
 *  or malformed field INDEPENDENTLY from `defaults` — a bad `role` never drops a valid `depth`, and vice
 *  versa. The `defaults` are the consumer's own initial values (depth + role); passing them keeps each
 *  injector's policy local while the shape stays shared. Use this for consumers that always inject with
 *  defaults (persona at-depth, guided); use {@link injectionDirectiveSchema} directly for opt-in-or-null
 *  consumers (world-info). */
export function resolveInjectionPlacement(
  raw: unknown,
  defaults: InjectionPlacement,
): InjectionPlacement {
  const obj = z.looseObject({}).safeParse(raw);
  const source = obj.success ? obj.data : {};
  const depth = depthSchema.safeParse(source["depth"]);
  const role = roleSchema.safeParse(source["role"]);
  return {
    depth: depth.success ? depth.data : defaults.depth,
    role: role.success ? role.data : defaults.role,
  };
}
