import type {
  ToastPortalProps as BasePortalProps,
  ToastProviderProps as BaseProviderProps,
  ToastRootProps as BaseRootProps,
} from "@base-ui/react/toast";
import { Toast as BaseToast } from "@base-ui/react/toast";
import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine.
import { Icon, X } from "#primitives/icons";
import { toastVariants } from "./variants";

const slots = toastVariants();

/**
 * App-wide toast state — seals the Base UI Toast manager (auto-dismiss timers, hover/focus pause,
 * stacking limit, F6 viewport focus, and a11y announcements come free). Mount ONCE near the root.
 * `<ToastProvider><App /><Toaster /></ToastProvider>`
 * Spec: ui-package-design §6.1 dictate — the app-wide toast seal (D54: Base UI native, no sonner).
 */
export function ToastProvider(props: BaseProviderProps): ReactElement {
  return <BaseToast.Provider {...props} />;
}

interface ToastItemsProps {
  swipeDirection?: BaseRootProps["swipeDirection"];
}

function ToastItems({ swipeDirection }: ToastItemsProps): ReactElement {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root
          className={slots.root()}
          data-slot="toast-root"
          key={toast.id}
          swipeDirection={swipeDirection}
          toast={toast}
        >
          <BaseToast.Content className={slots.content()}>
            <BaseToast.Title className={slots.title()} />
            <BaseToast.Description className={slots.description()} />
            {/* Native action part: renders null unless the toast carries `actionProps` (label +
                onClick supplied at `manager.add({ actionProps })`), so it is always mounted here and
                self-hides when absent — the "Open character"/"Undo" affordance (hub-browse-design/03
                §6). Base UI reads `actionProps.children` for the label; do NOT hand-roll a <button>. */}
            <BaseToast.Action className={slots.action()} data-slot="toast-action" />
          </BaseToast.Content>
          <BaseToast.Close aria-label="Close notification" className={slots.close()}>
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
  /**
   * Swipe direction(s) that dismiss a toast (Base UI default: `['down', 'right']`, matching this
   * seal's bottom-right viewport). Override when a consumer repositions the Viewport (e.g. a
   * top-anchored toast stack wants `swipeDirection="up"`).
   */
  swipeDirection?: BaseRootProps["swipeDirection"];
}

/**
 * The toast outlet — bundles Portal → Viewport (`--z-toast`, bottom-right stack) and renders every
 * managed toast with title/description/close. Mount ONCE inside `<ToastProvider>`. `container` targets
 * the Portal (e.g. a fullscreen element that must own its own stacking context).
 *
 * `Toast.Positioner`/`Toast.Arrow` are NOT wrapped here (R2 cut, documented): those parts anchor a
 * toast against a specific trigger element for per-toast anchored placement, but this seal's
 * structural mode is the single stacked Viewport (every toast shares one bottom-right stack) — no
 * toast carries an `anchor`, so the anchored-positioning parts don't apply to this design.
 * `<Toaster />`
 * Spec: ui-package-design §6.1 dictate — the Provider/Viewport wrap (UI-Gates §8 meta-toast
 * consumers arrive Phase 6).
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
