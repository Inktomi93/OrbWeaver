// `useRegexPreview` — the tester's and the pipeline's read of a preview run in the display-pass Worker, through the
// query cache the way `useDisplayText` reads a row's pass: the subject is the key, so the same sample and scripts
// read the answer back synchronously, and a keystroke's new key drops the job the last one left waiting. The last
// answer stays on screen while the next one runs, so each answer is read in the query function against the
// subject it was asked for, never against the one on screen now.

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import type { RegexPreviewOutcome, RegexPreviewRequest } from "#lib";
import { runRegexPreview } from "#src/lib/display-pass-runner.ts";

const REGEX_PREVIEW_KEY = "regex-preview";

export interface RegexPreviewRead<T> {
  /** The answer, or `undefined` before the first one lands. */
  readonly answer: T | undefined;
  /** True while the subject on screen has no answer yet; `answer` is then the last subject's. */
  readonly pending: boolean;
}

/** Run `subject`'s request in the Worker and read its outcomes with `read`. `subject` is plain data and is the
 *  cache key; it carries every value `read` reads. */
export function useRegexPreview<S extends { readonly request: RegexPreviewRequest }, T>(
  subject: S,
  read: (subject: S, outcomes: readonly RegexPreviewOutcome[]) => T,
): RegexPreviewRead<T> {
  // Local work, not a tRPC read: no server procedure owns this key and nothing invalidates it.
  const queryKey = [REGEX_PREVIEW_KEY, subject] as const;
  const query = useQuery(
    queryOptions({
      queryKey,
      queryFn: async ({ signal }): Promise<T> => read(subject, await runRegexPreview(subject.request, signal)),
      // Local work: it must run offline, and a script that failed once fails the same way again.
      networkMode: "always",
      retry: false,
      placeholderData: keepPreviousData,
    }),
  );
  return { answer: query.data, pending: query.isPlaceholderData || query.data === undefined };
}
