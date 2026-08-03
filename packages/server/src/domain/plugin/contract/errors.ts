// domain/plugin/contract/errors — the lifecycle error taxonomy (02 §5), extending the kit domain-error base
// so the transport boundary maps them. Coded refusals (BAD_REQUEST) for the install/upgrade validation gates;
// PluginCrashedError (SERVICE_UNAVAILABLE) for the auto-disable crash policy (03 §4). Distinct from the
// membrane's guest-observable `PluginCapabilityError`/`HostVersionError` (`@orb/contracts/plugin`) — these are
// host-side lifecycle failures a CALLER sees, never a guest.

import { DomainConflictError, DomainNotFoundError, DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/** The bundle failed unzip/validation: a bad zip, extra/unknown entries, a decompression-bomb over the caps,
 *  malformed `manifest.json`, or a manifest that fails `pluginManifestSchema` (bad slug/version/hostVersion/
 *  netHosts). Thrown BEFORE anything persists — a 400/415-class refusal, never retried. */
export class ManifestInvalidError extends DomainOperationError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super("plugin_manifest_invalid", message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** The manifest pins a `hostVersion` this build does not serve (01 §3). Separate from a generic manifest
 *  fault so the caller can be told to rebuild against the served major, not "fix your manifest".
 *
 *  @public a member of the built lifecycle error taxonomy; zero throw sites because the hostVersion gate is unbuilt. */
export class HostVersionUnservedError extends DomainOperationError {
  constructor(requested: number, served: readonly number[]) {
    super("plugin_host_version_unserved", `plugin host version ${requested} not served (served: ${served.join(", ")})`);
  }
}

/** The confirmed grant is NOT ⊆ the manifest's declared capabilities (02 §2/§4) — the install/upgrade refuses
 *  a grant the manifest never asked for. */
export class CapabilityNotGrantedError extends DomainOperationError {
  constructor(ungrantable: readonly string[]) {
    super("plugin_capability_not_granted", `grant includes capabilities the manifest does not declare: ${ungrantable.join(", ")}`);
  }
}

/** An install/upgrade whose bundle version is LOWER than the currently-installed version for the same plugin
 *  id (owner-ruled 2026-07-18, Marinara-audit rider). Refused so a re-uploaded old bundle can never silently
 *  roll a plugin back. */
export class PluginDowngradeRefusedError extends DomainOperationError {
  constructor(candidate: string, installed: string) {
    super("plugin_downgrade_refused", `cannot install version ${candidate} over the newer installed ${installed} (downgrades are refused)`);
  }
}

/** The instance auto-disabled after the crash threshold (03 §4). Maps to SERVICE_UNAVAILABLE. */
export class PluginCrashedError extends DomainUnavailableError {}

/** An owned-plugin verb (upgrade/setEnabled/uninstall/getLog) was handed a pluginId that is missing OR not the
 *  caller's — collapsed leak-free (no foreign-existence oracle; the owner-scoped read returns undefined either
 *  way). Maps to NOT_FOUND. */
export class PluginNotFoundError extends DomainNotFoundError {
  // @foreign-id-ok(pluginId): the plugin SANDBOX wire DTO — an untrusted guest's JSON, branded only after the host parses it; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
  constructor(pluginId: string) {
    super("plugin", pluginId);
  }
}

/** `installPlugin` for a slug the caller already has installed — install is create-only; changing the bundle is
 *  `upgradePlugin` (the `(owner, slug)` UNIQUE, checked before the write for a clean message). Maps to CONFLICT. */
export class PluginAlreadyInstalledError extends DomainConflictError {
  constructor(slug: string) {
    super(`a plugin with slug "${slug}" is already installed — use upgrade to change its bundle`);
  }
}
