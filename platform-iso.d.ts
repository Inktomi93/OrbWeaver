// ISO-only instance types needed by portable dependency declarations.
import type { URL as WhatwgURL } from "whatwg-url";

declare global {
  type URL = WhatwgURL;
}
