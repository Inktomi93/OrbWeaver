import type { ToastPortalProps as BasePortalProps, ToastProviderProps as BaseProviderProps, ToastRootProps as BaseRootProps } from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { AlertTriangle, Check, CircleAlert, Icon, X } from "#primitives/icons";
import { toastVariants } from "./variants.ts";

const slots = toastVariants();

/** The viewport is TOP-anchored (see `variants.ts`), so the natural flick-away is UP — Base UI's own
 *  default (`['down','right']`) would ask the user to drag a top-edge toast toward the page. */
const TOP_ANCHORED_SWIPE: BaseRootProps["swipeDirection"] = ["up", "right"];

/**
 * The glyph half of a toast's identity. Base UI stamps `data-type` from the toast's `type`, and each
 * MEANING-BEARING type pairs its border tint with a shape — a tint alone is a colour-only signal
 * (WCAG 1.4.1), and `error`'s tint is the weakest of the set (4.59:1 measured), so it needs the shape most.
 *
 * `type` is Base UI's own OPEN string (`string | undefined`), not one of our unions, so there is no
 * exhaustive dispatch to owe here and no `assertNever` that could ever fire — an `if` chain, not a
 * `switch` (which `switch-exhaustiveness-check` correctly refuses to believe is total over `string`).
 * `loading` and the plain info toast stay glyph-less deliberately: neither asserts a state a reader
 * could mis-read from colour.
 */
function TypeGlyph({ type }: { readonly type: string | undefined }): ReactElement | null {
  if (type === "error") {
    return <Icon className={slots.errorIcon()} icon={CircleAlert} size="sm" />;
  }
  if (type === "success") {
    return <Icon className={slots.successIcon()} icon={Check} size="sm" />;
  }
  if (type === "warning") {
    return <Icon className={slots.warningIcon()} icon={AlertTriangle} size="sm" />;
  }
  return null;
}

/** App-wide toast state — seals the Base UI Toast manager. Mount ONCE near the root. */
export function ToastProvider(props: BaseProviderProps): ReactElement {
  return <BaseToast.Provider {...props} />;
}

interface ToastItemsProps {
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * A TRANSIENT NOTICE IS A LIVE-REGION ROLE, NEVER A DIALOG (side-eye home re-score, 2026-08-18).
 * Base UI's `ToastRoot` defaults to `role="alertdialog"` for a high-priority toast and `role="dialog"` for
 * the rest. Both are wrong for what this app renders: an `alertdialog` promises a MODAL awaiting a
 * response with managed focus, and these are dismissible, non-modal toasts that never take focus — a
 * screen-reader user was told "dialog" and then found focus elsewhere with no way back. A `dialog` inside
 * the viewport's `aria-live="polite"` region is the same contradiction one notch quieter (two content
 * models for the same node: announcement vs. a window you are supposed to be IN).
 *
 * So the role follows the SEVERITY the notice already declares: `notify.error` is the only channel that
 * ships `priority: "high"` (`lib/toast-notify.ts`), and `alert` is exactly "assertive, no focus contract".
 * Everything else is `status` — polite, announced, still not a window.
 *
 * `aria-modal` goes with the dialog roles that licensed it: it is only allowed on `dialog`/`alertdialog`,
 * so leaving Base UI's `aria-modal={false}` on an `alert` would be an `aria-allowed-attr` violation. It is
 * overridden to `undefined` rather than deleted upstream — the root still takes `tabIndex`, which is what
 * makes the toast keyboard-dismissible, and that part is correct.
 */
function toastRole(priority: string | undefined): "alert" | "status" {
  return priority === "high" ? "alert" : "status";
}

/** REMOVES Base UI's `aria-modal={false}` — its prop merge enumerates explicitly-`undefined` keys, so React
 *  omits the attribute. A const rather than an inline `aria-modal={undefined}`: biome's `useValidAriaValues`
 *  reads the inline form as SETTING an invalid value, which is the opposite of what this does, and a
 *  suppression for a false positive is worse than naming the intent once. */
const ARIA_MODAL_UNSET = { "aria-modal": undefined } as const;

function ToastItems({ swipeDirection = TOP_ANCHORED_SWIPE }: ToastItemsProps): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        // `aria-hidden={false}` OVERRIDES Base UI: `ToastRoot.mjs` hides a `priority: "high"` root from the
        // accessibility tree until it is focused (`isHighPriority && !focused`), which on a `tabIndex: 0`
        // element is an axe `aria-hidden-focus` violation AND silences our loudest toasts — every
        // `notify.error` is high-priority, so the errors that most need announcing announced nothing. The
        // Viewport is `aria-live="polite"`, so the toast is announced exactly once with this restored.
        <BaseToast.Root
          {...ARIA_MODAL_UNSET}
          aria-hidden={false}
          className={slots.root()}
          data-slot="toast-root"
          key={toast.id}
          role={toastRole(toast.priority)}
          swipeDirection={swipeDirection}
          toast={toast}
        >
          <TypeGlyph type={toast.type} />
          <BaseToast.Content className={slots.content()}>
            {/* NOT an `<h2>` (same finding). Base UI's Title renders one, so three transient notices
                injected three headings into the document outline that belong to no section of the page —
                a heading-navigation user landed on "Too many tabs are open" between the page's own h2s.
                The title still NAMES the toast: `aria-labelledby` points at this node whatever it renders
                as, which is where the name belongs on an `alert`/`status`. */}
            <BaseToast.Title className={slots.title()} data-slot="toast-title" render={<div />} />
            <BaseToast.Description className={slots.description()} />
            {/* Renders null unless the toast carries `actionProps`; do NOT hand-roll a <button>. */}
            <BaseToast.Action className={slots.action()} data-slot="toast-action" />
          </BaseToast.Content>
          {/* Same override, same reason (`ToastClose.mjs`: `aria-hidden: !expanded && !hasFocus`) — the only
              dismiss affordance was outside the accessibility tree until it already had focus, so a screen
              reader user could never find it. The `aria-label` below is the name it then reports. */}
          <BaseToast.Close aria-hidden={false} aria-label="Close notification" className={slots.close()}>
            <Icon icon={X} size="xs" />
          </BaseToast.Close>
        </BaseToast.Root>
      ))}
    </>
  );
}

export interface ToasterProps extends VariantProps<typeof toastVariants> {
  className?: string;
  /** Portal target — render the toast viewport into a specific container (default: document.body). */
  container?: BasePortalProps["container"];
  /* `placement` rides in from VariantProps: `overlay` (default) is the fixed top-right float, for a
     surface with nothing to reflow; `band` renders the viewport IN FLOW and is only correct when
     `container` names a host that is itself a layout row — pass the two together (`variants.ts`). */
  /** Override when a consumer repositions the Viewport away from the default top-right anchor. */
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * The toast outlet — bundles Portal → Viewport and renders every managed toast with
 * title/description/close. Mount ONCE inside `<ToastProvider>`. Every toast shares ONE stack, so
 * `Toast.Positioner`/`Toast.Arrow` (per-toast anchored placement) are not wrapped here.
 */
export function Toaster(props: ToasterProps): ReactElement {
  const { className, container, placement, swipeDirection } = props;
  const viewport = toastVariants({ placement }).viewport({ className });
  return (
    <BaseToast.Portal container={container}>
      {/* NAMED "Alerts", not Base UI's default (side-eye rail sweep P3-15, 2026-08-17). The viewport is a
          `role="region"` and Base UI labels it "Notifications" out of the box — which is the accessible
          name of this app's NOTIFICATION BELL and of its inbox popover, so every screen carried two
          unrelated "Notifications" landmarks and a rotor/landmark jump was a coin flip. The bell owns the
          word (it is a durable per-user inbox); this stack is transient app alerts, and says so. */}
      <BaseToast.Viewport aria-label="Alerts" className={viewport} data-slot="toast-viewport">
        <ToastItems swipeDirection={swipeDirection} />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
