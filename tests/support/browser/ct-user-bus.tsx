import { useInvalidation, useOrbSocket, useUserBus } from "@orb/client/data";
import type { ReactElement, ReactNode } from "react";

/** The socket and the user bus the app root wires beside its surfaces, so a server event reaches the rows it changes. Mount it
 *  inside `CtClientProviders`, around the subject. */
export function CtUserBus({ children }: { readonly children: ReactNode }): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  return <>{children}</>;
}
