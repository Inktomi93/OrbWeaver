import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { runInNewContext } from "node:vm";
import { expect, plantFile, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { z } from "zod";

const effectiveConfigSchema = z.object({ files: z.array(z.string()).optional() });

function compileHost(
  repoRoot: string,
  scratch: string,
  project: string,
  { source, omitHome }: { readonly source: string; readonly omitHome?: string },
): ReturnType<typeof runNicedSync> {
  const compiler = join(repoRoot, "node_modules/@typescript/native/bin/tsc");
  const config = join(repoRoot, project);
  const shown = runNicedSync(process.execPath, [compiler, "--showConfig", "--project", config], { cwd: repoRoot });
  expect(shown.status, shown.stderr || shown.stdout).toBe(0);
  const effective = effectiveConfigSchema.parse(JSON.parse(shown.stdout));
  plantFile(scratch, "package.json", JSON.stringify({ type: "module" }));
  const fixture = plantFile(scratch, "host.ts", source);
  const files = (effective.files ?? []).map((file) => resolve(dirname(config), file)).filter((file) => file !== omitHome);
  const probe = plantFile(
    scratch,
    "tsconfig.json",
    JSON.stringify({
      extends: config,
      compilerOptions: {
        skipLibCheck: false,
        // Temporary projects retain the checkout's type-package resolution.
        typeRoots: [join(repoRoot, "node_modules/@types")],
      },
      files: [...files, fixture],
      include: [],
    }),
  );
  return runNicedSync(process.execPath, [compiler, "--noEmit", "true", "--incremental", "false", "--project", probe], { cwd: repoRoot });
}

const ISO = `
declare const url: URL;
export const parts = [url.href, url.hostname, url.searchParams.get("key"), url.toJSON()];
export const entries = url.searchParams.entries();
// @ts-expect-error URL properties retain their actual value types.
url.href = 123;
// @ts-expect-error Search parameters require string keys.
url.searchParams.get(123);
// @ts-expect-error A portable URL instance does not acquire arbitrary properties.
url.missingProperty;
// @ts-expect-error The dependency needs an instance type, not a global constructor.
new URL("https://example.test");
// @ts-expect-error ISO code has no Node process.
process.pid;
// @ts-expect-error ISO code has no Node buffer.
Buffer.alloc(1);
// @ts-expect-error ISO code has no document.
document.body;
// @ts-expect-error ISO code has no window.
window.location;
// @ts-expect-error ISO code does not acquire runtime events from a test runner.
new Event("test");
// @ts-expect-error ISO code does not acquire a runtime event target.
new EventTarget();
// @ts-expect-error ISO code does not acquire runtime cancellation globals.
AbortSignal.abort();
// @ts-expect-error ISO code does not acquire runtime sockets from a test runner.
new WebSocket("ws://example.test");
// @ts-expect-error ISO code does not acquire Node fetch aliases.
export type UnavailableHeaders = HeadersInit;
// @ts-expect-error ISO code does not acquire Node fetch credentials.
export type UnavailableCredentials = RequestCredentials;
// @ts-expect-error The Node-only WebAssembly home is excluded from ISO.
export type UnavailableMemory = WebAssembly.Memory;
`;

const NODE = `
export const pid = process.pid;
export const nativeUrl = new URL("https://example.test");
export const headerInputs: HeadersInit[] = [new Headers({ "x-test": "value" }), { "x-test": "value" }, [["x-test", "value"]]];
export const credentials: RequestCredentials[] = ["omit", "same-origin", "include"];
export const requests: RequestInit[] = headerInputs.map(headers => ({ headers, credentials: "omit" }));
// @ts-expect-error Header values retain the native request type.
export const invalidHeaders: HeadersInit = { "x-test": 123 };
// @ts-expect-error Credentials retain the native closed vocabulary.
export const invalidCredentials: RequestCredentials = "invalid";
// @ts-expect-error Node fetch aliases do not introduce browser file selections.
export type UnavailableFiles = FileList;
// @ts-expect-error Node fetch aliases do not introduce browser media streams.
export type UnavailableStream = MediaStream;
export const memory32 = new WebAssembly.Memory({ initial: 1, maximum: 2 });
export const memory64 = new WebAssembly.Memory({ address: "i64", initial: 1n, maximum: 2n });
export const pages32: number = memory32.grow(1);
export const pages64: bigint = memory64.grow(1n);
declare const module: WebAssembly.Module;
declare const instance: WebAssembly.Instance;
declare const global: WebAssembly.Global;
declare const table: WebAssembly.Table;
declare const tag: WebAssembly.Tag;
export const handles = [module, instance];
// @ts-expect-error A native instance's export object is frozen.
instance.exports.replacement = memory32;
export const exports: WebAssembly.Exports = { memory: memory32, global, table, tag, call: (value: number) => value };
export const imports: WebAssembly.Imports = { env: { external: null, scalar: 1n, call() {} } };
// @ts-expect-error A memory32 address is numeric.
memory32.grow(1n);
// @ts-expect-error A memory64 address is bigint.
memory64.grow(1);
declare const unclassified: WebAssembly.Memory;
// @ts-expect-error Unknown address provenance does not permit growth.
unclassified.grow(1);
// @ts-expect-error A memory buffer can be shared.
export const ordinaryBuffer: ArrayBuffer = unclassified.buffer;
// @ts-expect-error A memory64 descriptor requires bigint limits.
new WebAssembly.Memory({ address: "i64", initial: 1 });
// @ts-expect-error Shared memory requires a maximum.
new WebAssembly.Memory({ initial: 1, shared: true });
// @ts-expect-error A module import namespace must be an object.
export const badImports: WebAssembly.Imports = { env: null };
// @ts-expect-error An export must be a native handle or callable.
export const badExports: WebAssembly.Exports = { value: 1 };
// @ts-expect-error Node has no document.
document.body;
// @ts-expect-error Node has no window.
window.location;
// @ts-expect-error Node has no browser element type.
export type UnavailableElement = HTMLElement;
`;

const BROWSER = `
export const element = document.createElement("div");
export const url = new URL("https://example.test");
export const headers: HeadersInit = new Headers({ "x-test": "value" });
export const credentials: RequestCredentials = "same-origin";
export const memory = new WebAssembly.Memory({ initial: 1 });
export const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
// @ts-expect-error Browser programs do not inherit the Node handle declaration.
export type NodeMemory = WebAssembly.MemoryHandle<number>;
// @ts-expect-error Browser programs have no Node process.
process.pid;
// @ts-expect-error Browser programs have no Node buffer.
Buffer.alloc(1);
`;

for (const [name, project, source] of [
  ["ISO", "packages/kit/tsconfig.json", ISO],
  ["ISO testkit", "tsconfig.tests-iso.json", ISO],
  ["Node", "tsconfig.world-node.json", NODE],
  ["browser", "tsconfig.world-browser.json", BROWSER],
] as const) {
  test(`${name} host types preserve the production world's boundaries`, ({ repoRoot, scratch }) => {
    const result = compileHost(repoRoot, scratch, project, { source });
    expect(result.status, result.stdout || result.stderr).toBe(0);
  });
}

for (const [project, source, home, diagnostic] of [
  ["packages/kit/tsconfig.json", ISO, "platform-iso.d.ts", "Cannot find name 'URL'"],
  ["tsconfig.world-node.json", NODE, "platform-node.d.ts", "Cannot find namespace 'WebAssembly'"],
] as const) {
  test(`removing ${home} restores the missing host type failure`, ({ repoRoot, scratch }) => {
    const result = compileHost(repoRoot, scratch, project, { source, omitHome: join(repoRoot, home) });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(diagnostic);
  });
}

test("the native compiler reaches planted source errors", ({ repoRoot, scratch }) => {
  const result = compileHost(repoRoot, scratch, "tsconfig.world-node.json", { source: 'export const invalid: number = "wrong";' });
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain("TS2322");
});

test("native memory address widths and resizable buffers match the Node declarations", () => {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
  const bytes = new Uint8Array(memory.toResizableBuffer());
  bytes[0] = 37;
  const before = bytes.byteLength;
  expect(memory.grow(1)).toBe(1);
  expect(bytes.byteLength).toBe(before * 2);
  expect(bytes[0]).toBe(37);
  expect(memory.toFixedLengthBuffer()).toBeInstanceOf(ArrayBuffer);
  const shared = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true });
  expect(shared.buffer).toBeInstanceOf(SharedArrayBuffer);
  expect(shared.toResizableBuffer()).toBeInstanceOf(SharedArrayBuffer);
  expect(shared.toFixedLengthBuffer()).toBeInstanceOf(SharedArrayBuffer);
  const wide = new WebAssembly.Memory({ address: "i64", initial: 1n, maximum: 2n });
  expect(wide.grow(1n)).toBe(1n);
});

test("opaque handles carry their standard runtime identities", () => {
  const observed: unknown = runInNewContext(`(() => {
    const module = new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
    const instance = new WebAssembly.Instance(module);
    const global = new WebAssembly.Global({ value: "i32" }, 0);
    const table = new WebAssembly.Table({ initial: 1, element: "anyfunc" });
    const tag = new WebAssembly.Tag({ parameters: ["i32"] });
    return {
      tags: [module, instance, global, table, tag].map(value => value[Symbol.toStringTag]),
      frozen: Object.isFrozen(instance.exports),
    };
  })()`);
  expect(z.object({ tags: z.array(z.string()), frozen: z.boolean() }).parse(observed)).toEqual({
    tags: ["WebAssembly.Module", "WebAssembly.Instance", "WebAssembly.Global", "WebAssembly.Table", "WebAssembly.Tag"],
    frozen: true,
  });
});
