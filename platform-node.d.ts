// Node-owned WebAssembly handles and Memory construction for the QuickJS loader.
// Browser programs retain their native declarations.
// API: https://webassembly.github.io/spec/js-api/
// biome-ignore lint/style/noNamespace: declares the native namespace required by QuickJS types.
declare namespace WebAssembly {
  interface Module {
    readonly [Symbol.toStringTag]: "WebAssembly.Module";
  }

  interface Instance {
    readonly [Symbol.toStringTag]: "WebAssembly.Instance";
    readonly exports: Readonly<Exports>;
  }

  interface MemoryHandle<Address extends number | bigint> {
    readonly [Symbol.toStringTag]: "WebAssembly.Memory";
    readonly buffer: ArrayBuffer | SharedArrayBuffer;
    grow: (delta: Address) => Address;
    toFixedLengthBuffer: () => ArrayBuffer | SharedArrayBuffer;
    toResizableBuffer: () => ArrayBuffer | SharedArrayBuffer;
  }

  type Memory = MemoryHandle<number> | MemoryHandle<bigint>;

  type MemoryLimits<Address extends number | bigint> =
    | { initial: Address; maximum?: Address; shared?: false }
    | { initial: Address; maximum: Address; shared: true };

  type Memory32Descriptor = MemoryLimits<number> & { address?: "i32" };
  type Memory64Descriptor = MemoryLimits<bigint> & { address: "i64" };

  let Memory: {
    readonly prototype: Memory;
    new (descriptor: Memory32Descriptor): MemoryHandle<number>;
    new (descriptor: Memory64Descriptor): MemoryHandle<bigint>;
  };

  interface Global {
    readonly [Symbol.toStringTag]: "WebAssembly.Global";
  }

  interface Table {
    readonly [Symbol.toStringTag]: "WebAssembly.Table";
  }

  interface Tag {
    readonly [Symbol.toStringTag]: "WebAssembly.Tag";
  }

  // The generic SDK exposes raw callables without their module's function signatures.
  type ExportedFunction = Parameters<typeof Reflect.apply>[0];
  type ExportValue = ExportedFunction | Global | Memory | Table | Tag;
  type Exports = Record<string, ExportValue>;

  // Each import namespace is an object; externref properties may contain arbitrary JavaScript values.
  type Imports = Record<string, object>;
}
