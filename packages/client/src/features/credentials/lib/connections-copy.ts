// The words the Connections list prints and a spec locates controls by. A zero-import leaf, so a spec reads them without the component graph.

/** The Connections group's list section: its settings row and its heading. It differs from the group's own name, so the group band and
 *  the row under it are two destinations with two names. */
export const CONNECTIONS_LIST_NAME = "Your connections";

/** The button that opens the add-connection dialog. */
export const ADD_CONNECTION_NAME = "Add connection";

/** The row rail's label for the Model roles a connection's model can serve: a statement about the model. */
export const CAN_SERVE_LABEL = "Can serve";

/** The row rail's label for the Model roles bound to the connection now: an assignment, not a capability. */
export const USED_FOR_LABEL = "Used for";

/** A rail group's name: its label, then the connection it describes, so each row's groups are told apart. */
export function connectionRailGroupName(label: string, connection: string): string {
  return `${label}: ${connection}`;
}

/** A connection row's background state; the switch that sets it is in the connection's editor. */
export function backgroundStateLabel(allowed: boolean): string {
  return allowed ? "Background work on" : "Background work off";
}

/** The connection forms' provider select. */
export const CONNECTION_PROVIDER_FIELD_NAME = "Provider";
