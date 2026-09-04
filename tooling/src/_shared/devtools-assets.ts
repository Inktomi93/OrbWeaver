// Hermetic official DevTools frontend asset boundary: validate the complete revision tuple and byte
// closure before opening a loopback-only, manifest-closed static server. There is deliberately no
// network fallback in this runtime module; the maintainer materializer is the only networked path.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
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

function safeMember(root: string, member: string, label: string): string {
  if (!SAFE_PATH_RE.test(member) || member.startsWith("/") || normalize(member) !== member || member.split("/").includes("..")) {
    throw new Error(`${label} is not a canonical relative path: ${member}`);
  }
  const absolute = resolve(root, member);
  if (!absolute.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error(`${label} escapes the asset root: ${member}`);
  }
  return absolute;
}

interface FileExpectation {
  readonly file: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly label: string;
}

function verifyFile(root: string, expected: FileExpectation): Buffer {
  const { file, bytes, checksum, label } = expected;
  const absolute = safeMember(root, file, label);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not a regular owned file: ${file}`);
  }
  const body = readFileSync(absolute);
  if (body.byteLength !== bytes || sha256(body) !== checksum) {
    throw new Error(`${label} hash/size mismatch: ${file}`);
  }
  return body;
}

function fileInventory(root: string, directory = root): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink forbidden in DevTools asset closure: ${relative(root, path)}`);
    }
    if (entry.isDirectory()) {
      output.push(...fileInventory(root, path));
    } else if (entry.isFile()) {
      output.push(relative(root, path));
    } else {
      throw new Error(`non-file asset member forbidden: ${relative(root, path)}`);
    }
  }
  return output.sort((left, right) => left.localeCompare(right));
}

function installedPlaywrightTuple(): { readonly version: string; readonly browserVersion: string } {
  const testPackage = fileURLToPath(import.meta.resolve("@playwright/test/package.json"));
  const packageModules = dirname(dirname(dirname(testPackage)));
  const playwrightPackage = realpathSync(join(packageModules, "playwright", "package.json"));
  const playwrightModules = dirname(dirname(playwrightPackage));
  const packageText = readFileSync(testPackage, "utf8");
  const browsersText = readFileSync(join(playwrightModules, "playwright-core", "browsers.json"), "utf8");
  const version = stringField(record(JSON.parse(packageText), "@playwright/test package")["version"], "@playwright/test version");
  const browsers = arrayField(record(JSON.parse(browsersText), "playwright browsers")["browsers"], "playwright browsers.browsers");
  const chromium = browsers.map((value) => record(value, "playwright browser")).find((value) => value["name"] === "chromium");
  if (chromium === undefined) {
    throw new Error("Playwright browsers.json has no chromium pin");
  }
  return { version, browserVersion: stringField(chromium["browserVersion"], "Playwright Chromium browserVersion") };
}

export function verifyDevToolsAssetsSync(root: string): VerifiedDevToolsAssets {
  const canonicalRoot = realpathSync(root);
  const pinText = readFileSync(join(canonicalRoot, "pin.json"), "utf8");
  const manifestText = readFileSync(join(canonicalRoot, "manifest.json"), "utf8");
  const licensesText = readFileSync(join(canonicalRoot, "licenses.json"), "utf8");
  const pin = parseDevToolsAssetPin(JSON.parse(pinText));
  if (sha256(manifestText) !== pin.manifestSha256) {
    throw new Error("DevTools closure manifest checksum does not match the tuple pin");
  }
  const manifest = parseManifest(JSON.parse(manifestText));
  const licenses = parseLicenses(JSON.parse(licensesText));
  const installed = installedPlaywrightTuple();
  if (installed.version !== pin.playwrightVersion || installed.browserVersion !== pin.browserVersion) {
    throw new Error(
      `Playwright/Chromium tuple drift: installed ${installed.version}/${installed.browserVersion}, pinned ${pin.playwrightVersion}/${pin.browserVersion}`,
    );
  }
  const expectedFiles = new Set(["pin.json", "manifest.json", "licenses.json"]);
  const filesByUrl = verifyResourceClosure(canonicalRoot, pin, manifest, expectedFiles);
  verifyLicenseClosure({ root: canonicalRoot, pin, manifest, licenses, expectedFiles });
  verifyExactInventory(canonicalRoot, expectedFiles);
  return { root: canonicalRoot, pin, manifest, filesByUrl };
}

export function verifyDevToolsAssets(root: string): VerifiedDevToolsAssets {
  return verifyDevToolsAssetsSync(root);
}

function verifyResourceClosure(
  root: string,
  pin: DevToolsAssetPin,
  manifest: DevToolsAssetManifest,
  expectedFiles: Set<string>,
): Map<string, { readonly entry: DevToolsAssetEntry; readonly body: Buffer }> {
  if (manifest.resources.length === 0 || manifest.resources.length !== pin.resourceCount) {
    throw new Error("DevTools closure has a zero or stale resource population");
  }
  const filesByUrl = new Map<string, { readonly entry: DevToolsAssetEntry; readonly body: Buffer }>();
  let decodedBytes = 0;
  for (const asset of manifest.resources) {
    const expectedPrefix = `/serve_rev/@${pin.devtoolsFrontendRevision}/`;
    if (!asset.url.startsWith(expectedPrefix) || asset.file !== `assets${asset.url}` || filesByUrl.has(asset.url)) {
      throw new Error(`non-canonical or duplicate DevTools resource: ${asset.url}`);
    }
    const body = verifyFile(root, { file: asset.file, bytes: asset.bytes, checksum: asset.sha256, label: "DevTools asset" });
    filesByUrl.set(asset.url, { entry: asset, body });
    expectedFiles.add(asset.file);
    decodedBytes += asset.bytes;
  }
  if (decodedBytes !== pin.decodedBytes) {
    throw new Error(`DevTools decoded-byte total drift: ${decodedBytes} != ${pin.decodedBytes}`);
  }
  return filesByUrl;
}

interface LicenseClosureArgs {
  readonly root: string;
  readonly pin: DevToolsAssetPin;
  readonly manifest: DevToolsAssetManifest;
  readonly licenses: DevToolsLicenseManifest;
  readonly expectedFiles: Set<string>;
}

function verifyLicenseClosure(args: LicenseClosureArgs): void {
  const { root, pin, manifest, licenses, expectedFiles } = args;
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
      verifyFile(root, { file: notice.file, bytes: notice.bytes, checksum: notice.sha256, label: "DevTools license" });
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

function verifyExactInventory(root: string, expectedFiles: ReadonlySet<string>): void {
  const actualFiles = fileInventory(root);
  const expected = [...expectedFiles].sort((left, right) => left.localeCompare(right));
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
