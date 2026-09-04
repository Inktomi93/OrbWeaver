import { isAbsolute } from "node:path";

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export interface ReadCheckoutLocation {
  readonly name: string;
  readonly path: string;
  readonly rootRelativePath: string;
  readonly kind?: unknown;
}

export function checkoutLocation(value: unknown): ReadCheckoutLocation | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = value["name"];
  const path = value["path"];
  const rootRelativePath = value["rootRelativePath"];
  return typeof name === "string" && typeof path === "string" && isAbsolute(path) && typeof rootRelativePath === "string"
    ? { name, path, rootRelativePath, ...(value["kind"] === undefined ? {} : { kind: value["kind"] }) }
    : null;
}

export function validGitFailures(value: unknown): value is readonly { readonly field: string; readonly detail: string }[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (failure) =>
          isRecord(failure) &&
          typeof failure["field"] === "string" &&
          failure["field"] !== "" &&
          typeof failure["detail"] === "string" &&
          failure["detail"] !== "",
      ))
  );
}
