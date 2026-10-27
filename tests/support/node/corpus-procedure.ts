// Only composed callers reach this lookup; capture and served routes invoke the same actual procedure.
type Procedure = (input: unknown) => Promise<unknown>;

export function procedureAt(caller: object, path: string): Procedure {
  const [namespace, name] = path.split(".");
  const group: unknown = namespace === undefined ? undefined : Reflect.get(caller, namespace);
  // A tRPC caller's namespaces are proxy functions.
  const reachable = (typeof group === "object" && group !== null) || typeof group === "function";
  const procedure: unknown = reachable && name !== undefined ? Reflect.get(group, name) : undefined;
  if (typeof procedure !== "function") {
    throw new Error(`The corpus root has no procedure ${path}`);
  }
  return (input) => Reflect.apply(procedure, group, [input]) as Promise<unknown>;
}
