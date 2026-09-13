// Hermetic official DevTools frontend asset boundary: validate the complete revision tuple and byte
// closure before opening a loopback-only, manifest-closed static server. There is deliberately no
// network fallback in this runtime module; the maintainer materializer is the only networked path.
//
// THE ADJUDICATION IS PURE; ONLY THE LOADING IS NOT (#1584, the `devtools-frontend-assets` conversion).
// `adjudicateDevToolsClosure` decides the whole pin/manifest/licence/inventory contract over ALREADY-READ
// bytes — three control documents plus a `{file, bytes, sha256}` census — and never touches the filesystem,
// node's resolver or a subprocess. Two callers load that census two ways and get the SAME verdict from the
// SAME code: `verifyDevToolsAssetsSync` walks the real root for snap (and then reads the member BODIES,
// which only the static server needs), and the `devtools-frontend-assets` policy takes it from the
// `devtools-closure` + `installed-package` ResourceHost doors, because a final gate policy has no
// filesystem at all (gate-runtime-standardization.md §3, docs/history/gate-runtime-worked-cases-2026-09.md §"Archived world-program guarantee table"). The split is deliberate and the
// signature above it is unchanged: the runtime path's independent regression proof is
// tests/tooling/_shared/devtools-assets.test.ts, which drives `verifyDevToolsAssets` over real temp roots
// for hash drift, tuple drift, a missing notice, an unexpected member and a symlink.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_RE = /^[a-f0-9]{64}$/u;
const REVISION_RE = /^[a-f0-9]{40}$/u;
const SAFE_PATH_RE = /^[A-Za-z0-9_@./-]+$/u;
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

export interface DevToolsAssetPin {
  readonly schemaVersion: 1;
  readonly playwrightVersion: string;
  readonly browserVersion: string;
  readonly chromiumRevision: string;
  readonly devtoolsFrontendRevision: string;
  readonly protocolVersion: string;
  readonly resourceCount: number;
  readonly decodedBytes: number;
  readonly manifestSha256: string;
}

export interface DevToolsAssetEntry {
  readonly url: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mimeType: string;
  readonly licenseFamily: string;
}

export interface DevToolsAssetManifest {
  readonly schemaVersion: 1;
  readonly resources: readonly DevToolsAssetEntry[];
}

export interface DevToolsLicenseFile {
  readonly file: string;
  readonly source: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface DevToolsLicenseFamily {
  readonly family: string;
  readonly assetPrefix: string;
  readonly notices: readonly DevToolsLicenseFile[];
}

export interface DevToolsLicenseManifest {
  readonly schemaVersion: 1;
  readonly families: readonly DevToolsLicenseFamily[];
}

export interface VerifiedDevToolsAssets {
  readonly root: string;
  readonly pin: DevToolsAssetPin;
  readonly manifest: DevToolsAssetManifest;
  readonly filesByUrl: ReadonlyMap<string, { readonly entry: DevToolsAssetEntry; readonly body: Buffer }>;
}

/** One closure member. `file` is relative to the closure ROOT, because that is the spelling the manifest
 *  and licence rows use and re-anchoring it would make every comparison a string-surgery exercise. This is
 *  the ONE home for the shape; `verify/contract/resource-artifact.ts` imports it rather than re-spelling it. */
export interface DevToolsClosureFile {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Everything the adjudication needs, and nothing it does not: the three control documents as TEXT (the
 *  pin's `manifestSha256` is over the manifest's exact bytes, so a re-serialized parse would not reproduce
 *  it) plus the exact census of EVERY regular file under the root, control documents included. */
export interface DevToolsClosureInput {
  readonly pinText: string;
  readonly manifestText: string;
  readonly licensesText: string;
  readonly files: readonly DevToolsClosureFile[];
}

/** The installed browser tuple the pin is held against. Two fields, because that is what the pin declares. */
export interface DevToolsInstalledTuple {
  readonly version: string;
  readonly browserVersion: string;
}

/** What the adjudication establishes. The bodies are NOT here: only the static server needs them, and a
 *  policy that asked for 500 file bodies to decide a hash contract would be re-reading what the census
 *  already proved. */
export interface AdjudicatedDevToolsClosure {
  readonly pin: DevToolsAssetPin;
  readonly manifest: DevToolsAssetManifest;
}

export interface DevToolsAssetServer {
  readonly origin: string;
  readonly unexpectedRequests: readonly string[];
  readonly close: () => Promise<void>;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function integerField(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function checksumField(value: unknown, label: string): string {
  const checksum = stringField(value, label);
  if (!SHA256_RE.test(checksum)) {
    throw new Error(`${label} must be a lowercase SHA-256`);
  }
  return checksum;
}

function revisionField(value: unknown, label: string): string {
  const revision = stringField(value, label);
  if (!REVISION_RE.test(revision)) {
    throw new Error(`${label} must be a lowercase 40-character Git revision`);
  }
  return revision;
}

function arrayField(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

export function parseDevToolsAssetPin(value: unknown): DevToolsAssetPin {
  const pin = record(value, "pin");
  if (pin["schemaVersion"] !== 1) {
    throw new Error("unsupported DevTools asset pin schema");
  }
  return {
    schemaVersion: 1,
    playwrightVersion: stringField(pin["playwrightVersion"], "pin.playwrightVersion"),
    browserVersion: stringField(pin["browserVersion"], "pin.browserVersion"),
    chromiumRevision: revisionField(pin["chromiumRevision"], "pin.chromiumRevision"),
    devtoolsFrontendRevision: revisionField(pin["devtoolsFrontendRevision"], "pin.devtoolsFrontendRevision"),
    protocolVersion: stringField(pin["protocolVersion"], "pin.protocolVersion"),
    resourceCount: integerField(pin["resourceCount"], "pin.resourceCount"),
    decodedBytes: integerField(pin["decodedBytes"], "pin.decodedBytes"),
    manifestSha256: checksumField(pin["manifestSha256"], "pin.manifestSha256"),
  };
}

function parseAsset(value: unknown, index: number): DevToolsAssetEntry {
  const asset = record(value, `manifest.resources[${index}]`);
  return {
    url: stringField(asset["url"], `manifest.resources[${index}].url`),
    file: stringField(asset["file"], `manifest.resources[${index}].file`),
    bytes: integerField(asset["bytes"], `manifest.resources[${index}].bytes`),
    sha256: checksumField(asset["sha256"], `manifest.resources[${index}].sha256`),
    mimeType: stringField(asset["mimeType"], `manifest.resources[${index}].mimeType`),
    licenseFamily: stringField(asset["licenseFamily"], `manifest.resources[${index}].licenseFamily`),
  };
}

function parseManifest(value: unknown): DevToolsAssetManifest {
  const manifest = record(value, "manifest");
  if (manifest["schemaVersion"] !== 1) {
    throw new Error("unsupported DevTools asset manifest schema");
  }
  return { schemaVersion: 1, resources: arrayField(manifest["resources"], "manifest.resources").map(parseAsset) };
}

function parseNotice(value: unknown, label: string): DevToolsLicenseFile {
  const notice = record(value, label);
  return {
    file: stringField(notice["file"], `${label}.file`),
    source: stringField(notice["source"], `${label}.source`),
    bytes: integerField(notice["bytes"], `${label}.bytes`),
    sha256: checksumField(notice["sha256"], `${label}.sha256`),
  };
}

function parseLicenses(input: unknown): DevToolsLicenseManifest {
  const manifest = record(input, "licenses");
  if (manifest["schemaVersion"] !== 1) {
    throw new Error("unsupported DevTools license manifest schema");
  }
  const families = arrayField(manifest["families"], "licenses.families").map((entry, index): DevToolsLicenseFamily => {
    const family = record(entry, `licenses.families[${index}]`);
    return {
      family: stringField(family["family"], `licenses.families[${index}].family`),
      assetPrefix:
        typeof family["assetPrefix"] === "string"
          ? family["assetPrefix"]
          : (() => {
              throw new Error(`licenses.families[${index}].assetPrefix must be a string`);
            })(),
      notices: arrayField(family["notices"], `licenses.families[${index}].notices`).map((notice, noticeIndex) =>
        parseNotice(notice, `licenses.families[${index}].notices[${noticeIndex}]`),
      ),
    };
  });
  return { schemaVersion: 1, families };
}

/** The canonical-relative fence on a manifest- or licence-DECLARED member path. Pure string work, and it is
 *  total: a member surviving all four clauses is a strictly descending relative path, so the former
 *  `resolve(root, member)` escape branch beneath it was unreachable and was deleted with the root argument
 *  rather than carried as dead decoration. The construction that would have reached it — `a/../../b` —
 *  fails `normalize(member) !== member` first, and `..` alone fails the segment test; both directions are
 *  pinned by the `devtools-frontend-assets` policy's escaping-member proof row. */
function safeMember(member: string, label: string): string {
  if (!SAFE_PATH_RE.test(member) || member.startsWith("/") || normalize(member) !== member || member.split("/").includes("..")) {
    throw new Error(`${label} is not a canonical relative path: ${member}`);
  }
  return member;
}

interface FileExpectation {
  readonly file: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly label: string;
}

/** Hold one declared member against the census. A member absent from the census is "not a regular owned
 *  file" for the same reason it always was: the census admits regular non-symlink files and nothing else,
 *  so absence and non-regularity are the same answer by construction. */
function verifyMember(inventory: ReadonlyMap<string, DevToolsClosureFile>, expected: FileExpectation): void {
  const { file, bytes, checksum, label } = expected;
  const member = inventory.get(safeMember(file, label));
  if (member === undefined) {
    throw new Error(`${label} is not a regular owned file: ${file}`);
  }
  if (member.bytes !== bytes || member.sha256 !== checksum) {
    throw new Error(`${label} hash/size mismatch: ${file}`);
  }
}

function closureCensus(root: string, directory = root, into: DevToolsClosureFile[] = []): DevToolsClosureFile[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink forbidden in DevTools asset closure: ${relative(root, path)}`);
    }
    if (entry.isDirectory()) {
      closureCensus(root, path, into);
    } else if (entry.isFile()) {
      const body = readFileSync(path);
      into.push({ file: relative(root, path), bytes: body.byteLength, sha256: sha256(body) });
    } else {
      throw new Error(`non-file asset member forbidden: ${relative(root, path)}`);
    }
  }
  return into;
}

/** Load the adjudication's input off a real root. The three control documents are read as TEXT and the rest
 *  of the closure as a hashed census — the same two shapes the `devtools-closure` resource door publishes. */
function readClosureInput(root: string): DevToolsClosureInput {
  return {
    pinText: readFileSync(join(root, "pin.json"), "utf8"),
    manifestText: readFileSync(join(root, "manifest.json"), "utf8"),
    licensesText: readFileSync(join(root, "licenses.json"), "utf8"),
    files: closureCensus(root).toSorted((left, right) => left.file.localeCompare(right.file)),
  };
}

/** The chromium `browserVersion` Playwright's own `browsers.json` pins. Exported so the policy — which
 *  receives that document through the `installed-package` text door rather than off disk — reaches the
 *  identical parse and the identical refusals. */
export function readChromiumBrowserVersion(browsersText: string): string {
  const browsers = arrayField(record(JSON.parse(browsersText), "playwright browsers")["browsers"], "playwright browsers.browsers");
  const chromium = browsers.map((value) => record(value, "playwright browser")).find((value) => value["name"] === "chromium");
  if (chromium === undefined) {
    throw new Error("Playwright browsers.json has no chromium pin");
  }
  return stringField(chromium["browserVersion"], "Playwright Chromium browserVersion");
}

function installedPlaywrightTuple(): DevToolsInstalledTuple {
  const testPackage = fileURLToPath(import.meta.resolve("@playwright/test/package.json"));
  const packageModules = dirname(dirname(dirname(testPackage)));
  const playwrightPackage = realpathSync(join(packageModules, "playwright", "package.json"));
  const playwrightModules = dirname(dirname(playwrightPackage));
  const packageText = readFileSync(testPackage, "utf8");
  const browsersText = readFileSync(join(playwrightModules, "playwright-core", "browsers.json"), "utf8");
  const version = stringField(record(JSON.parse(packageText), "@playwright/test package")["version"], "@playwright/test version");
  return { version, browserVersion: readChromiumBrowserVersion(browsersText) };
}

/** THE WHOLE CONTRACT, over already-read bytes. Pin schema, manifest checksum, licence schema, the installed
 *  browser tuple, every declared resource's hash/size, every licence notice's hash/size and revision pin,
 *  and the EXACT inventory — an extra unowned member is as much a defect as a missing one. Throws on the
 *  first violation, which is the behaviour both callers depend on. */
export function adjudicateDevToolsClosure(input: DevToolsClosureInput, installed: DevToolsInstalledTuple): AdjudicatedDevToolsClosure {
  const pin = parseDevToolsAssetPin(JSON.parse(input.pinText));
  if (sha256(input.manifestText) !== pin.manifestSha256) {
    throw new Error("DevTools closure manifest checksum does not match the tuple pin");
  }
  const manifest = parseManifest(JSON.parse(input.manifestText));
  const licenses = parseLicenses(JSON.parse(input.licensesText));
  if (installed.version !== pin.playwrightVersion || installed.browserVersion !== pin.browserVersion) {
    throw new Error(
      `Playwright/Chromium tuple drift: installed ${installed.version}/${installed.browserVersion}, pinned ${pin.playwrightVersion}/${pin.browserVersion}`,
    );
  }
  const inventory = new Map(input.files.map((member) => [member.file, member]));
  const expectedFiles = new Set(["pin.json", "manifest.json", "licenses.json"]);
  verifyResourceClosure(inventory, pin, manifest, expectedFiles);
  verifyLicenseClosure({ inventory, pin, manifest, licenses, expectedFiles });
  verifyExactInventory(inventory, expectedFiles);
  return { pin, manifest };
}

export function verifyDevToolsAssetsSync(root: string): VerifiedDevToolsAssets {
  const canonicalRoot = realpathSync(root);
  const { pin, manifest } = adjudicateDevToolsClosure(readClosureInput(canonicalRoot), installedPlaywrightTuple());
  // The BODIES are read only after the contract holds, and only the static server needs them.
  const filesByUrl = new Map(manifest.resources.map((entry) => [entry.url, { entry, body: readFileSync(join(canonicalRoot, entry.file)) }]));
  return { root: canonicalRoot, pin, manifest, filesByUrl };
}

export function verifyDevToolsAssets(root: string): VerifiedDevToolsAssets {
  return verifyDevToolsAssetsSync(root);
}

function verifyResourceClosure(
  inventory: ReadonlyMap<string, DevToolsClosureFile>,
  pin: DevToolsAssetPin,
  manifest: DevToolsAssetManifest,
  expectedFiles: Set<string>,
): void {
  if (manifest.resources.length === 0 || manifest.resources.length !== pin.resourceCount) {
    throw new Error("DevTools closure has a zero or stale resource population");
  }
  const seenUrls = new Set<string>();
  let decodedBytes = 0;
  for (const asset of manifest.resources) {
    const expectedPrefix = `/serve_rev/@${pin.devtoolsFrontendRevision}/`;
    if (!asset.url.startsWith(expectedPrefix) || asset.file !== `assets${asset.url}` || seenUrls.has(asset.url)) {
      throw new Error(`non-canonical or duplicate DevTools resource: ${asset.url}`);
    }
    verifyMember(inventory, { file: asset.file, bytes: asset.bytes, checksum: asset.sha256, label: "DevTools asset" });
    seenUrls.add(asset.url);
    expectedFiles.add(asset.file);
    decodedBytes += asset.bytes;
  }
  if (decodedBytes !== pin.decodedBytes) {
    throw new Error(`DevTools decoded-byte total drift: ${decodedBytes} != ${pin.decodedBytes}`);
  }
}

interface LicenseClosureArgs {
  readonly inventory: ReadonlyMap<string, DevToolsClosureFile>;
  readonly pin: DevToolsAssetPin;
  readonly manifest: DevToolsAssetManifest;
  readonly licenses: DevToolsLicenseManifest;
  readonly expectedFiles: Set<string>;
}

function verifyLicenseClosure(args: LicenseClosureArgs): void {
  const { inventory, pin, manifest, licenses, expectedFiles } = args;
  const families = new Map(licenses.families.map((family) => [family.family, family]));
  if (families.size === 0 || families.size !== licenses.families.length) {
    throw new Error("DevTools license inventory is empty or has duplicate families");
  }
  for (const family of licenses.families) {
    if (family.notices.length === 0) {
      throw new Error(`DevTools license family has no notice: ${family.family}`);
    }
    for (const notice of family.notices) {
      if (!notice.source.startsWith(`https://chromium.googlesource.com/devtools/devtools-frontend/+/${pin.devtoolsFrontendRevision}/`)) {
        throw new Error(`DevTools license source is not revision-pinned: ${notice.source}`);
      }
      verifyMember(inventory, { file: notice.file, bytes: notice.bytes, checksum: notice.sha256, label: "DevTools license" });
      expectedFiles.add(notice.file);
    }
  }
  for (const asset of manifest.resources) {
    const relativePath = asset.url.slice(`/serve_rev/@${pin.devtoolsFrontendRevision}/`.length);
    const family = families.get(asset.licenseFamily);
    if (family === undefined || (family.assetPrefix !== "" && !relativePath.startsWith(family.assetPrefix))) {
      throw new Error(`DevTools asset has an absent or mismatched license family: ${asset.url}`);
    }
  }
}

function verifyExactInventory(inventory: ReadonlyMap<string, DevToolsClosureFile>, expectedFiles: ReadonlySet<string>): void {
  const actualFiles = [...inventory.keys()].toSorted((left, right) => left.localeCompare(right));
  const expected = [...expectedFiles].toSorted((left, right) => left.localeCompare(right));
  if (actualFiles.length !== expected.length || actualFiles.some((file, index) => file !== expected[index])) {
    throw new Error("DevTools asset root contains missing or unexpected resources");
  }
}

function requestPath(rawUrl: string | undefined): string | null {
  if (rawUrl === undefined || rawUrl.includes("%") || rawUrl.includes("\\")) {
    return null;
  }
  const path = rawUrl.split("?", 1)[0] as string;
  return path.startsWith("/") && normalize(path) === path && !path.includes("//") && !path.split("/").includes("..") ? path : null;
}

export async function startDevToolsAssetServer(assets: VerifiedDevToolsAssets): Promise<DevToolsAssetServer> {
  const unexpectedRequests: string[] = [];
  const server: Server = createServer((request, response) => {
    const remote = request.socket.remoteAddress;
    const path = requestPath(request.url);
    if (remote !== "127.0.0.1" || (request.method !== "GET" && request.method !== "HEAD") || path === null) {
      unexpectedRequests.push(`${request.method ?? "(method)"} ${request.url ?? "(url)"} from ${remote ?? "(address)"}`);
      response.writeHead(HTTP_FORBIDDEN).end();
      return;
    }
    const verified = assets.filesByUrl.get(path);
    if (verified === undefined) {
      unexpectedRequests.push(`${request.method} ${path}`);
      response.writeHead(HTTP_NOT_FOUND).end();
      return;
    }
    response.writeHead(HTTP_OK, {
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": verified.entry.bytes,
      "content-type": verified.entry.mimeType,
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      response.end(verified.body);
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
    throw new Error("DevTools asset server did not bind IPv4 loopback");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    unexpectedRequests,
    close: async (): Promise<void> => new Promise<void>((done, reject) => server.close((error) => (error === undefined ? done() : reject(error)))),
  };
}
