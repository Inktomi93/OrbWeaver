// The words the Connections list prints and a spec locates controls by. A zero-import leaf, so a spec reads them without the component graph.

/** The button that opens the add-connection dialog. */
export const ADD_CONNECTION_NAME = "Add connection";

/** A connection row's background state; the switch that sets it is in the connection's editor. */
export function backgroundStateLabel(allowed: boolean): string {
  return allowed ? "Background work on" : "Background work off";
}

/** The connection forms' provider select. */
export const CONNECTION_PROVIDER_FIELD_NAME = "Provider";
