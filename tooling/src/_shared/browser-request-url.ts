// The only mint for request-summary URL identity. Raw credentials and sensitive query values are erased
// before the string can inhabit a map key or captured request value.
import { z } from "zod";

const SENSITIVE_QUERY_NAME = /(?:token|password|passwd|secret|api[_-]?key|authorization|credential|session|signature)/iu;
const SENSITIVE_PATH_SEGMENT_NAME = /^(?:token|password|passwd|secret|api[_-]?key|authorization|credential|session|signature)$/iu;
const redactedRequestUrlSchema = z.string().min(1).brand<"RedactedRequestUrl">();
export type RedactedRequestUrl = z.infer<typeof redactedRequestUrlSchema>;

export function redactedRequestUrl(raw: string): RedactedRequestUrl {
  // @orb-waive caught-failure-ownership(catch): an unparsable page-controlled URL becomes the branded explicit omission instead of leaking raw credentials/path/query bytes. Ends if the fallback stops being the only returned value.
  try {
    const url = new URL(raw);
    if (url.username !== "" || url.password !== "") {
      url.username = "[REDACTED]";
      url.password = "[REDACTED]";
    }
    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_NAME.test(name)) {
        url.searchParams.set(name, "[REDACTED]");
      }
    }
    const segments = url.pathname.split("/");
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (SENSITIVE_PATH_SEGMENT_NAME.test(decodeURIComponent(segments[index] ?? ""))) {
        segments[index + 1] = "%5BREDACTED%5D";
      }
    }
    url.pathname = segments.join("/");
    return redactedRequestUrlSchema.parse(url.toString());
  } catch {
    return redactedRequestUrlSchema.parse("[UNPARSEABLE URL OMITTED]");
  }
}
