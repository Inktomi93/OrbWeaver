// A mutation names exactly one failure surface (client-architecture-state-and-gates.md §11): none, or two, fails to compile.
// @subject packages/client/src/data/create-entity-mutation.ts

import type { createEntityMutation } from "@orb/client/data";

type Config = Parameters<typeof createEntityMutation<{ readonly label: string }, unknown>>[0];
declare const options: Config["options"];

export const toasted = { options, busDriven: true, errorToast: "Couldn't do that." } satisfies Config;
export const logged = { options, busDriven: true, backgroundFailure: "The sweep failed." } satisfies Config;
export const inline = { options, busDriven: true, failureShownInline: "the dialog's alert" } satisfies Config;

// @ts-expect-error a mutation with no failure class shows the person nothing
export const silent: Config = { options, busDriven: true };

// @ts-expect-error a background failure the person did not start never toasts
export const toastedAndLogged: Config = { options, busDriven: true, errorToast: "Couldn't do that.", backgroundFailure: "The sweep failed." };

// @ts-expect-error a failure stated inline on screen is not repeated in a toast
export const toastedAndInline: Config = { options, busDriven: true, errorToast: "Couldn't do that.", failureShownInline: "the dialog's alert" };
