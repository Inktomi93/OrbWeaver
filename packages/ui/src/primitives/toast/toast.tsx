import type { ToastPortalProps as BasePortalProps, ToastProviderProps as BaseProviderProps, ToastRootProps as BaseRootProps } from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
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
  // @orb-gate-ignore no-context-provider: Base UI's Toast.Provider is a namespace COMPONENT, not a React Context — the React-19 `<Context.Provider>` deprecation the gate targets doesn't apply.
  return <BaseToast.Provider {...props} />;
}

interface ToastItemsProps {
  swipeDirection?: BaseRootProps["swipeDirection"];
}

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
        <BaseToast.Root aria-hidden={false} className={slots.root()} data-slot="toast-root" key={toast.id} swipeDirection={swipeDirection} toast={toast}>
          <TypeGlyph type={toast.type} />
          <BaseToast.Content className={slots.content()}>
            <BaseToast.Title className={slots.title()} />
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

export interface ToasterProps {
  className?: string;
  /** Portal target — render the toast viewport into a specific container (default: document.body). */
  container?: BasePortalProps["container"];
  /** Override when a consumer repositions the Viewport away from the default top-right anchor. */
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * The toast outlet — bundles Portal → Viewport and renders every managed toast with
 * title/description/close. Mount ONCE inside `<ToastProvider>`. Every toast shares one top-right stack
 * (`variants.ts` states why it is not bottom-right), so `Toast.Positioner`/`Toast.Arrow` (per-toast
 * anchored placement) are not wrapped here.
 */
export function Toaster(props: ToasterProps): ReactElement {
  const { className, container, swipeDirection } = props;
  return (
    <BaseToast.Portal container={container}>
      <BaseToast.Viewport className={slots.viewport({ className })} data-slot="toast-viewport">
        <ToastItems swipeDirection={swipeDirection} />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
