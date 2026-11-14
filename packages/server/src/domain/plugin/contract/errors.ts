// domain/plugin/contract/errors — the lifecycle error taxonomy, extending the kit domain-error base
// so the transport boundary maps them. Coded refusals (BAD_REQUEST) for the install/upgrade validation gates;
// PluginCrashedError (SERVICE_UNAVAILABLE) for the auto-disable crash policy. Distinct from the
// membrane's guest-observable `PluginCapabilityError`/`HostVersionError` (`@orb/contracts/plugin`) — these are
// host-side lifecycle failures a CALLER sees, never a guest.

import type { PluginSlug, PluginUiHostCallCode } from "@orb/contracts/plugin";
import { PLUGIN_KV_MAX_KEYS, PLUGIN_UI_HOST_CALL_CODES } from "@orb/contracts/plugin";
import { DomainConflictError, DomainError, DomainNotFoundError, DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";
import type { CharacterId, PluginId } from "@orb/kit/ids";

/** The bundle failed unzip/validation: a bad zip, extra/unknown entries, a decompression-bomb over the caps,
 *  malformed `manifest.json`, or a manifest that fails `pluginManifestSchema` (bad slug/version/hostVersion shape/
 *  netHosts). Thrown BEFORE anything persists — a 400/415-class refusal, never retried. */
export class ManifestInvalidError extends DomainOperationError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super("plugin_manifest_invalid", message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** A URL install/upgrade/preview could not FETCH the bundle bytes (U8, seam 15 —
 *  `installFromUrl`/`previewFromUrl`/`upgradeFromStoredUrl`). It is deliberately ONE generic, LEAK-FREE error for
 *  EVERY fetch failure — an SSRF block (the URL resolved to a private/reserved address), a scheme/redirect
 *  refusal, a non-2xx, or a network error — and that is the security property, not laziness: `safeFetch`'s own
 *  `EgressBlockedError.reason` distinguishes "private-address" from "host-not-allowed", and surfacing that
 *  distinction to the caller would turn this into an SSRF ORACLE (an attacker learns their URL resolved private).
 *  The domain never branches on the reason (the `fetchWebDocument`→`ScrapeFailedError` precedent — infra performs
 *  the guarded fetch and THROWS; `domain/plugin/context.ts` wraps the injected fetch to collapse every throw here). The message
 *  names the caller-supplied URL and nothing about what it resolved to. Thrown BEFORE anything persists.
 *  Maps to BAD_REQUEST. */
export class PluginBundleFetchError extends DomainOperationError {
  constructor(url: string, options?: { readonly cause?: unknown }) {
    super("plugin_bundle_fetch_failed", `could not fetch a plugin bundle from ${url} (unreachable, refused, or not a permitted destination)`);
    // The cause is forwarded for SERVER-SIDE observability only (safeFetch's `EgressBlockedError` carries the
    // block reason). It never reaches the client: the tRPC error formatter serializes `{message, code, data}`,
    // never `cause` — so the leak-free MESSAGE above is what a caller sees while the reason stays in the logs.
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** Leak-free collapse for every guarded Git transport/clone/ref failure. */
export class PluginGitSourceError extends DomainOperationError {
  constructor(options?: { readonly cause?: unknown }) {
    // Never echo the supplied URL: the refusal class includes embedded credentials, and errors are a durable
    // log/client surface. The server-side cause retains the operational reason without retaining the secret.
    super("plugin_git_source_failed", "could not read that plugin repository (unreachable, refused, changed, or not a permitted destination)");
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** Remote HEAD moved after the consent preview or update check. No bytes persist; the owner must review again. */
export class PluginGitPreviewStaleError extends DomainConflictError {
  constructor() {
    super("the Git repository changed after review — check it again and review the current permissions before continuing");
  }
}

/** The URL served different bytes after the consent preview or update check. No lifecycle mutation ran. */
export class PluginBundlePreviewStaleError extends DomainConflictError {
  constructor() {
    super("the plugin bundle changed since it was fetched — fetch it or check for updates again before continuing");
  }
}

export class PluginNoGitSourceError extends DomainOperationError {
  constructor(pluginId: PluginId) {
    super("plugin_no_git_source", `plugin ${pluginId} was not installed from Git — choose an update source that matches its provenance`);
  }
}

/** A one-click `upgradeFromStoredUrl` on a plugin that has NO remembered source URL — a file (`upload`-origin)
 *  install (U8 2b). DISTINCT from `PluginNotFoundError`: the plugin exists and is the
 *  caller's own; what is absent is a URL to re-fetch from, and the honest answer is "this one was installed from a
 *  file — upload a new bundle to update it", not "not found". Thrown AFTER the owner-scoped load (so it never
 *  leaks across tenants — a stranger gets NOT_FOUND first) and BEFORE any fetch. Maps to BAD_REQUEST. */
export class PluginNoSourceUrlError extends DomainOperationError {
  constructor(
    // echoes the caller's OWN pluginId (owner-scoped load ran first) into an operator-facing message; no foreign existence is oracled — a stranger's id NOT_FOUNDs before this throws.
    pluginId: PluginId,
  ) {
    super(
      "plugin_no_source_url",
      `plugin ${pluginId} was installed from a file, not a URL — upload a new bundle to update it (there is no remembered source to re-fetch)`,
    );
  }
}

/** A one-click `upgradeFromShowcase` on a plugin this build ships NO bundle for — a hand-installed
 *  plugin, or a slug the shipped set dropped. DISTINCT from `PluginNotFoundError` for the same reason its
 *  stored-url sibling above is: the plugin exists and is the caller's own; what is absent is a shipped bundle to
 *  upgrade FROM. Thrown AFTER the owner-scoped load (so a stranger gets NOT_FOUND first and this can never oracle
 *  a foreign row) and before anything is packed. Maps to BAD_REQUEST.
 *
 *  It is also the SWEEP's teeth: A's seeded probe row is not a showcase slug, so a dropped ownership pre-check
 *  would surface this distinguishable BAD_REQUEST instead of the leak-free NOT_FOUND the probe pins. */
export class PluginNotShowcaseError extends DomainOperationError {
  constructor(
    // echoes the caller's OWN pluginId (owner-scoped load ran first) into an operator-facing message; no foreign existence is oracled — a stranger's id NOT_FOUNDs before this throws.
    pluginId: PluginId,
  ) {
    super(
      "plugin_not_showcase",
      `plugin ${pluginId} is not one of the examples this build ships — there is no bundled copy to update it from (upload a new bundle instead)`,
    );
  }
}

/** The manifest pins a `hostVersion` this build does not serve. Separate from a generic manifest
 *  fault so the caller can be told to rebuild against the served major, not "fix your manifest". */
export class HostVersionUnservedError extends DomainOperationError {
  readonly requested: number;
  readonly served: readonly number[];
  constructor(requested: number, served: readonly number[]) {
    super("plugin_host_version_unserved", `plugin host version ${requested} not served (served: ${served.join(", ")})`);
    this.requested = requested;
    this.served = served;
  }
}

/** The confirmed grant is NOT ⊆ the manifest's declared capabilities — the install/upgrade refuses
 *  a grant the manifest never asked for. */
export class CapabilityNotGrantedError extends DomainOperationError {
  constructor(ungrantable: readonly string[]) {
    super("plugin_capability_not_granted", `grant includes capabilities the manifest does not declare: ${ungrantable.join(", ")}`);
  }
}

/** A `setGrant` that would arm `net.fetch` against a host the caller never acknowledged — the anti-TOCTOU pin
 *  on the re-consent act.
 *
 *  WHY IT EXISTS, precisely. A grant is a list of capability NAMES the owner types, so a manifest that changes
 *  under a rendered consent screen cannot make the owner grant a name they did not choose. `net.fetch` is the
 *  one capability that breaks that property: its REACH is the manifest's `netHosts`, which the owner never
 *  names. Without this pin, an `upgrade` landing between "the screen rendered `api.vendor.example`" and "the
 *  owner clicked allow" would arm the egress wall at whatever the NEW manifest declares — the host-swap hole,
 *  re-opened at the consent act rather than at the upgrade. So the caller echoes the exact host list it
 *  displayed, and a manifest host missing from that echo is a typed refusal. Fail-closed: an empty echo with
 *  `net.fetch` in the grant refuses every declared host. */
export class PluginNetHostsUnacknowledgedError extends DomainOperationError {
  constructor(unacknowledged: readonly string[]) {
    super(
      "plugin_net_hosts_unacknowledged",
      `this plugin's manifest declares net.fetch hosts you have not confirmed: ${unacknowledged.join(", ")} — re-read the permissions and grant again`,
    );
  }
}

/** An install/upgrade whose bundle version is LOWER than the currently-installed version for the same plugin
 *  id (owner-ruled). Refused so a re-uploaded old bundle can never silently
 *  roll a plugin back. */
export class PluginDowngradeRefusedError extends DomainOperationError {
  constructor(candidate: string, installed: string) {
    super("plugin_downgrade_refused", `cannot install version ${candidate} over the newer installed ${installed} (downgrades are refused)`);
  }
}

/** A plugin's own UI-action handler threw. The owner's guest failed, not the host, so the caller gets a coded
 *  refusal (BAD_REQUEST) carrying the guest's message instead of a bare server error. */
class PluginActionFailedError extends DomainOperationError {
  constructor(message: string) {
    super("plugin_action_failed", message);
  }
}

/** A `plugin.uiHostCall` the relay refuses because the call was wrong: the plugin is off, the function is not
 *  proxyable or not granted, the arguments are not JSON or fail their schema, a chat scope is missing, or the answer
 *  is over the cap. The plugin author's mistake, not the server's: BAD_REQUEST with `data.reason` set to the code.
 *  The storage write refuses a server guest's oversized key or value with it too, so a guest reads this `name`
 *  where the relay answers the invalid-arguments code. */
export class PluginUiHostCallRefusedError extends DomainOperationError {
  constructor(message: string, options: { readonly code: PluginUiHostCallCode; readonly cause?: unknown }) {
    super(options.code, message);
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** A `storage.kv` write that would create a key past {@link PLUGIN_KV_MAX_KEYS}. A server guest contains it as a
 *  caught error; through `plugin.uiHostCall` it reaches the caller as BAD_REQUEST with the storage-cap code. */
export class PluginKvCapError extends DomainOperationError {
  constructor() {
    super(PLUGIN_UI_HOST_CALL_CODES.storageCap, `plugin storage.kv cap: at most ${PLUGIN_KV_MAX_KEYS} keys per plugin`);
  }
}

/** The error a guest invoke's rejection surfaces as: a guest's own throw becomes {@link PluginActionFailedError};
 *  a host DomainError keeps its own mapping. An internal fault passes through too, on purpose: the transport answers
 *  it with a fixed sentence, whereas wrapping it would put its text in a client-facing message. */
export function asPluginActionError(error: unknown): DomainError {
  return error instanceof DomainError ? error : new PluginActionFailedError(`plugin action failed: ${error instanceof Error ? error.message : String(error)}`);
}

/** The instance auto-disabled after the crash threshold. Maps to SERVICE_UNAVAILABLE. */
export class PluginCrashedError extends DomainUnavailableError {}

/** `setCardData` on a character whose stored extensions nest past what the database's JSON functions accept: the
 *  character is the installer's own and nothing was written. */
export class PluginCardDataUnwritableError extends DomainOperationError {
  constructor() {
    super("plugin_card_data_unwritable", "this character's extension data is nested too deeply to hold per-card plugin state");
  }
}

/** An owned-plugin verb (upgrade/setEnabled/uninstall/getLog) was handed a pluginId that is missing OR not the
 *  caller's — collapsed leak-free (no foreign-existence oracle; the owner-scoped read returns undefined either
 *  way). D148 uses the same refusal for unavailable character card data. Maps to NOT_FOUND. */
export class PluginNotFoundError extends DomainNotFoundError {
  constructor(target: PluginId | { readonly characterId: CharacterId }) {
    super("plugin", typeof target === "string" ? target : target.characterId);
  }
}

/** `uninstallForAllUsers` for a slug the server has not published (D147 clause (d)). DISTINCT from
 *  `PluginNotFoundError` on purpose: the plugin may well exist — several users may have installed it
 *  themselves — what is absent is the DISTRIBUTION RECORD, and an admin who mistypes a slug needs to be told
 *  which of those two things is missing. Maps to NOT_FOUND. No leak concern: the published set is deployment
 *  policy the caller is already admin over, not an owned entity whose existence could be oracled. */
export class PluginNotDistributedError extends DomainNotFoundError {
  constructor(slug: PluginSlug) {
    super("plugin distribution", slug);
  }
}

/** `runSnippet` while the caller already holds the maximum number of concurrently-running snippets. A snippet is
 *  a personal REPL — one at a time is the real usage shape — and each concurrent run pins a whole
 *  `QuickJSContext` (32 MiB ceiling) for up to its settlement wall. Maps to CONFLICT: retryable the moment the
 *  caller's own run finishes, and it says so. */
export class PluginSnippetBusyError extends DomainConflictError {
  constructor(max: number) {
    super(`you already have ${max} snippet${max === 1 ? "" : "s"} running — wait for one to finish before running another`);
  }
}

/** `installPlugin` for a slug the caller already has installed — install is create-only; changing the bundle is
 *  `upgradePlugin` (the `(owner, slug)` UNIQUE, checked before the write for a clean message). Maps to CONFLICT. */
export class PluginAlreadyInstalledError extends DomainConflictError {
  constructor(slug: string) {
    // "Update", not "upgrade": the client forwards this sentence VERBATIM as a single-homing choice
    // (`features/plugin/lib/plugin-mutations.ts`), and its button says Update — so the server string is the
    // one home where the two can be made to agree. Naming an affordance the product does not have is a
    // defect one screen over, even when the sentence is otherwise true.
    super(`a plugin with slug "${slug}" is already installed — use Update to change its bundle`);
  }
}
