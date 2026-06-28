// domain/sessions — read-model views. `SessionView` (the admin device-list projection) is a cross-boundary
// DTO whose canonical home is `@orb/contracts/session` (produced here by `toSessionView`, consumed by
// `admin` via the injected port + the client device table). Re-exported type-only here so domain callers
// name it through the feature's contract surface — NEVER re-declared (one home, §7.4).

export type { SessionView } from "@orb/contracts/session";
