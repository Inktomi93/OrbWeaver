// Error-shape normalizer for the bound fields: function validators put STRINGS in `meta.errors`,
// Standard-Schema (zod) validators put `{ message }` ISSUE OBJECTS (UI-Lib-TanStack-Form.md §6) —
// every bound field renders through this so both shapes display, standardized on the zod path.

interface MessageShaped {
  readonly message: string;
}

function hasMessage(e: unknown): e is MessageShaped {
  return typeof e === "object" && e !== null && "message" in e && typeof e.message === "string";
}

/** Join a field's `meta.errors` (strings and/or `{message}` issues) into one display line; null when clean. */
export function fieldErrorText(errors: readonly unknown[]): string | null {
  const parts: string[] = [];
  for (const e of errors) {
    if (typeof e === "string") {
      parts.push(e);
    } else if (hasMessage(e)) {
      parts.push(e.message);
    }
  }
  return parts.length === 0 ? null : parts.join(", ");
}

interface TouchGatedMeta {
  readonly errors: readonly unknown[];
  readonly isTouched: boolean;
}

/** The bound-fields' repeated when-to-show-errors policy: `fieldErrorText` gated on touch, in one
 *  place so the policy is a 1-file edit instead of a 9-file one. */
export function touchedFieldError(meta: TouchGatedMeta): string | null {
  return meta.isTouched ? fieldErrorText(meta.errors) : null;
}
