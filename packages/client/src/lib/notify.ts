// The ONE user-notification seam (UI-Arch §2.1 `lib/` — the `notify` seam). Query/mutation global
// error toasts (`data/query-client.ts` QueryCache/MutationCache onError) and any imperative "tell the
// user" call route through HERE, never a toast lib directly — the toast impl binds ONCE at the
// composition root when the `@orb/ui/toast` provider mounts, so swapping the surface never touches a
// call site. Until bound, the console fallback keeps notifications observable (client noConsole
// allowlist: info/warn/error).
//
// A notice is `{ title, description?, action? }`, not one string (side-eye INFRA-WARN-DEAF). One string
// forced every notice into a single bold line: three wrapped lines of undifferentiated bold that no one
// scans, with nowhere to put the next step. A bare string is still accepted and IS the title — that is
// the shape most call sites want and it stays honest, because a title-only notice is exactly a notice
// with nothing more to say. THE TITLE MUST SCAN IN UNDER A SECOND; the detail belongs in `description`.
//
// FOUR CHANNELS, and `warn` is not `info`: an honest-degrade ("we did the thing, but not the part you
// asked for") is neither neutral news nor a failure, and rendering it as info left it with no identity
// at all. The channel picks the toast's `type`, which is what the surface tints and glyphs.
//
// NO CLIENT-SIDE COALESCING, deliberately: the same notice fired three times stacks three toasts. The
// producers dedupe upstream (the chat engine dedupes runner warnings per turn before they ever reach the
// bus), so the observed duplicate rate is zero and a client-side de-dup window would be an unproven
// mechanism guarding nothing. If a producer that does NOT dedupe is ever added, that is the moment to
// build it — here, keyed on the rendered notice, not at the call site.

export interface NotifyAction {
  /** The button's label — a verb phrase naming where it goes ("Open Connections"). */
  readonly label: string;
  readonly onClick: () => void;
}

export interface NotifyNotice {
  /** The scannable one-liner. Rendered bold; keep it short enough to read at a glance. */
  readonly title: string;
  /** The full explanation, normal weight under the title. */
  readonly description?: string;
  /** The single next step this notice offers. */
  readonly action?: NotifyAction;
}

/** A bare string is a title-only notice — the shape most call sites want. */
export type NotifyInput = string | NotifyNotice;

export interface Notify {
  readonly info: (notice: NotifyInput) => void;
  readonly success: (notice: NotifyInput) => void;
  /** An honest degrade: it worked, but not the part the user asked for. */
  readonly warn: (notice: NotifyInput) => void;
  readonly error: (notice: NotifyInput) => void;
}

/** Normalize either accepted shape to the notice the surface renders. */
export function toNotice(notice: NotifyInput): NotifyNotice {
  return typeof notice === "string" ? { title: notice } : notice;
}

/** The console fallback's single line — the description is not dropped just because there are no pixels. */
function consoleLine(notice: NotifyInput): string {
  const { title, description } = toNotice(notice);
  return description === undefined ? title : `${title} — ${description}`;
}

const consoleNotify: Notify = {
  info: (notice) => console.info(consoleLine(notice)),
  success: (notice) => console.info(consoleLine(notice)),
  warn: (notice) => console.warn(consoleLine(notice)),
  error: (notice) => console.error(consoleLine(notice)),
};

let current: Notify = consoleNotify;

/** Composition-root-only: bind the real toast impl (main.tsx, once the toast provider mounts). */
export function bindNotify(impl: Notify): void {
  current = impl;
}

/** The stable facade every call site imports — delegates to whatever is currently bound. */
export const notify: Notify = {
  info: (notice) => current.info(notice),
  success: (notice) => current.success(notice),
  warn: (notice) => current.warn(notice),
  error: (notice) => current.error(notice),
};
