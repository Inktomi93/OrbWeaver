// verb: addExternalBackground — the DISCRETE server action behind the Appearance surface's
// "add a background from a URL" affordance. A pasted external URL can never paint (CSP `img-src`), so the
// server materializes it: fetch through the SSRF-safe egress belt → magic-verify it is a real image → store
// under the caller's CAS (the injected `materializeBackground` op), then return a ready `BackgroundLibraryEntry`
// the client appends to `appearance.backgroundLibrary` via its autosave form. NO paintable external URL is ever
// persisted; a failure throws a leak-free coded refusal the client toasts. This verb WRITES no settings — the
// library entry lands through the same autosave path an uploaded background does (the `uploadAsset` twin).

import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { BACKGROUND_UNAVAILABLE_OP_CODE, backgroundMaterializeMessage } from "@orb/contracts/theme";
import { DomainOperationError } from "@orb/kit/errors";
import type { AddExternalBackgroundParams } from "../contract/params.ts";
import type { SettingsContext, SettingsService } from "../contract/service.ts";

const BACKGROUND_NAME = "Background";

/** A human name for the entry, from the URL's last path segment (minus extension); "Background" otherwise. */
function deriveName(url: string): string {
  // A display NAME only: an unparseable URL or a malformed percent-escape falls back to the same generic "Background"
  // the empty-basename arm returns.
  const path = URL.parse(url)?.pathname;
  if (path === undefined) {
    return BACKGROUND_NAME;
  }
  try {
    const last = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
    const dot = last.lastIndexOf(".");
    const base = (dot > 0 ? last.slice(0, dot) : last).trim();
    return base.length > 0 ? base : BACKGROUND_NAME;
  } catch (error) {
    if (!(error instanceof URIError)) {
      throw error;
    }
    return BACKGROUND_NAME;
  }
}

export function createAddExternalBackground(ctx: SettingsContext): SettingsService["addExternalBackground"] {
  return async ({ principal, url }: AddExternalBackgroundParams): Promise<BackgroundLibraryEntry> => {
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      throw new DomainOperationError("background_url_empty", "A background image URL is required.");
    }
    const result = await ctx.materializeBackground(principal, trimmed);
    if (!result.ok) {
      throw new DomainOperationError(BACKGROUND_UNAVAILABLE_OP_CODE, backgroundMaterializeMessage(result.reason));
    }
    return {
      entryId: ctx.newBackgroundEntryId(),
      assetId: result.asset.assetId,
      assetHash: result.asset.assetHash,
      mime: result.asset.mime,
      name: deriveName(trimmed),
      provenanceUrl: trimmed,
    };
  };
}
