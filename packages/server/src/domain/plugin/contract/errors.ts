// domain/plugin/contract/errors — the lifecycle error taxonomy, extending the kit domain-error base
// so the transport boundary maps them. Coded refusals (BAD_REQUEST) for the install/upgrade validation gates;
// PluginCrashedError (SERVICE_UNAVAILABLE) for the auto-disable crash policy. Distinct from the
// membrane's guest-observable `PluginCapabilityError`/`HostVersionError` (`@orb/contracts/plugin`) — these are
// host-side lifecycle failures a CALLER sees, never a guest.

import { DomainConflictError, DomainNotFoundError, DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/** The bundle failed unzip/validation: a bad zip, extra/unknown entries, a decompression-bomb over the caps,
 *  malformed `manifest.json`, or a manifest that fails `pluginManifestSchema` (bad slug/version/hostVersion/
 *  netHosts). Thrown BEFORE anything persists — a 400/415-class refusal, never retried. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — this is the sibling
// lifecycle-error taxonomy (host-side, a CALLER sees it), never the guest-observable membrane error the
// contracts shape is (file header above). Expected subclass kinship across the whole taxonomy, not drift.
export class ManifestInvalidError extends DomainOperationError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super("plugin_manifest_invalid", message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** The manifest pins a `hostVersion` this build does not serve. Separate from a generic manifest
 *  fault so the caller can be told to rebuild against the served major, not "fix your manifest".
 *
 *  @public future: the hostVersion gate (unbuilt) — a member of the built lifecycle error taxonomy; zero throw sites because that gate is not built yet. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class HostVersionUnservedError extends DomainOperationError {
  constructor(requested: number, served: readonly number[]) {
    super("plugin_host_version_unserved", `plugin host version ${requested} not served (served: ${served.join(", ")})`);
  }
}

/** The confirmed grant is NOT ⊆ the manifest's declared capabilities — the install/upgrade refuses
 *  a grant the manifest never asked for. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
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
 *  owner clicked allow" would arm the egress wall at whatever the NEW manifest declares — the P3-H hole,
 *  re-opened at the consent act rather than at the upgrade. So the caller echoes the exact host list it
 *  displayed, and a manifest host missing from that echo is a typed refusal. Fail-closed: an empty echo with
 *  `net.fetch` in the grant refuses every declared host. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
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
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class PluginDowngradeRefusedError extends DomainOperationError {
  constructor(candidate: string, installed: string) {
    super("plugin_downgrade_refused", `cannot install version ${candidate} over the newer installed ${installed} (downgrades are refused)`);
  }
}

/** The instance auto-disabled after the crash threshold. Maps to SERVICE_UNAVAILABLE. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class PluginCrashedError extends DomainUnavailableError {}

/** An owned-plugin verb (upgrade/setEnabled/uninstall/getLog) was handed a pluginId that is missing OR not the
 *  caller's — collapsed leak-free (no foreign-existence oracle; the owner-scoped read returns undefined either
 *  way). Maps to NOT_FOUND. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class PluginNotFoundError extends DomainNotFoundError {
  // @foreign-id-ok(pluginId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
  constructor(pluginId: string) {
    super("plugin", pluginId);
  }
}

/** `runSnippet` while the caller already holds the maximum number of concurrently-running snippets. A snippet is
 *  a personal REPL — one at a time is the real usage shape — and each concurrent run pins a whole
 *  `QuickJSContext` (32 MiB ceiling) for up to its settlement wall. Maps to CONFLICT: retryable the moment the
 *  caller's own run finishes, and it says so. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class PluginSnippetBusyError extends DomainConflictError {
  constructor(max: number) {
    super(`you already have ${max} snippet${max === 1 ? "" : "s"} running — wait for one to finish before running another`);
  }
}

/** `installPlugin` for a slug the caller already has installed — install is create-only; changing the bundle is
 *  `upgradePlugin` (the `(owner, slug)` UNIQUE, checked before the write for a clean message). Maps to CONFLICT. */
// @nearpair-ok: near-matches `@orb/contracts/plugin::PluginCapabilityError` by design — see
// `ManifestInvalidError` above (same host-side taxonomy, expected kinship).
export class PluginAlreadyInstalledError extends DomainConflictError {
  constructor(slug: string) {
    super(`a plugin with slug "${slug}" is already installed — use upgrade to change its bundle`);
  }
}
