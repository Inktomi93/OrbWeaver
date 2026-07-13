import { Toast as BaseToast } from "@base-ui/react/toast";

/** Imperative toast API — must be called under `<ToastProvider>`. */
export const useToastManager = BaseToast.useToastManager;

/** Creates a global toast manager for use outside React (pass it to `<ToastProvider toastManager>`). */
export const createToastManager = BaseToast.createToastManager;
