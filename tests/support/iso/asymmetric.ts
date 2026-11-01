// Vitest types every asymmetric matcher `any`; nested in a fixture the `any` spreads into the surrounding object.

/** Hand an asymmetric matcher on as the opaque value it is: only `toEqual`-family matchers read it. */
export function asymmetric(matcher: unknown): unknown {
  return matcher;
}
