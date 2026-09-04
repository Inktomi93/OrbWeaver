// Rendering keeps absolute, protocol-relative, root-relative, and path-relative URL evidence useful
// after the URL parser has normalized and scrubbed its authority/query/fragment.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export function renderParsedUrl(raw: string, parsed: URL): string {
  const suffix = `${parsed.search}${parsed.hash}`;
  if (URL.canParse(raw)) {
    return parsed.toString();
  }
  if (raw.startsWith("//")) {
    return parsed.toString().replace(/^http:/, "");
  }
  if (raw.startsWith("/")) {
    return `${parsed.pathname}${suffix}`;
  }
  if (raw.startsWith("?")) {
    return suffix;
  }
  if (raw.startsWith("#")) {
    return parsed.hash;
  }
  return `${parsed.pathname.replace(/^\//, "")}${suffix}`;
}
