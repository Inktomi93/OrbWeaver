import { symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readCallReturnProgram, readSuppliedParameter } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, readPrototypeExposureCensus, resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import { inlineShapeNames } from "@orb/tooling/floor/code-facts/shape-declaration";
import { resolveTypePropertyOrigin } from "@orb/tooling/floor/code-facts/type-member-origin-core";
import { readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { isFactoryCallFromPackage, resolveFactoryCallFromPackage, ZOD_PACKAGE } from "@orb/tooling/floor/code-facts/zod-origin";
import { ModuleKind, ModuleResolutionKind, Node, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import { z } from "zod";
import { isZodCall } from "../../../../tooling/src/verify/lib/zod-origin.ts";
import { scaledBudget } from "../../_load-budget.ts";

const STRING_FACTORY = "string";

test("optional parsed fields do not turn an inherited getter into an own-data proof", ({ scratch, repoRoot }) => {
  const fieldName = "ORIGIN_PROTOTYPE_OPTION";
  expect(Object.getOwnPropertyDescriptor(Object.prototype, fieldName)).toBeUndefined();
  let actual: string | undefined;
  const modeName = "MODE";
  Object.defineProperty(Object.prototype, fieldName, {
    configurable: true,
    get() {
      Reflect.set(this, modeName, "outside");
    },
  });
  try {
    const schema = z.object({ [modeName]: z.enum(["local"]), [fieldName]: z.string().optional() }).superRefine((value) => {
      void value[fieldName];
    });
    const result = schema.safeParse({ [modeName]: "local" });
    actual = result.success ? result.data[modeName] : undefined;
  } finally {
    Reflect.deleteProperty(Object.prototype, fieldName);
  }
  expect(actual).toBe("outside");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "optional-effect.ts"),
    `
    import {z} from "zod";
    Object.defineProperty(Object.prototype,"ORIGIN_PROTOTYPE_OPTION",{get(){this.MODE="outside";return undefined;}});
    const schema=z.object({MODE:z.enum(["local"]),ORIGIN_PROTOTYPE_OPTION:z.string().optional()}).superRefine(value=>{void value.ORIGIN_PROTOTYPE_OPTION;});
    function read(input:unknown){const result=schema.safeParse(input);if(!result.success){throw new Error(String(result.error));}return result.data;}
    declare const raw:unknown;const output=Object.freeze(read(raw));
  `,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(result.kind, result.kind === "unresolved" ? result.detail : "incorrect finite domain").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("required parser assignments cannot assume an inherited setter creates an own slot", ({ scratch, repoRoot }) => {
  const fieldName = "ORIGIN_PROTOTYPE_REQUIRED";
  expect(Object.getOwnPropertyDescriptor(Object.prototype, fieldName)).toBeUndefined();
  let actual: string | undefined;
  const modeName = "MODE";
  Object.defineProperty(Object.prototype, fieldName, {
    configurable: true,
    get() {
      Reflect.set(this, modeName, "outside");
      return "read";
    },
    set(_value) {
      // Swallow assignment so the inherited getter remains observable on the parsed output.
    },
  });
  try {
    const schema = z.object({ [modeName]: z.enum(["local"]), [fieldName]: z.string() }).superRefine((value) => {
      void value[fieldName];
    });
    const result = schema.safeParse({ [modeName]: "local", [fieldName]: "input" });
    actual = result.success ? result.data[modeName] : undefined;
  } finally {
    Reflect.deleteProperty(Object.prototype, fieldName);
  }
  expect(actual).toBe("outside");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "required-setter.ts"),
    `import {z} from "zod";
    Object.defineProperty(Object.prototype,"ORIGIN_PROTOTYPE_REQUIRED",{get(){this.MODE="outside";return "read";},set(value){}});
    const schema=z.object({MODE:z.enum(["local"]),ORIGIN_PROTOTYPE_REQUIRED:z.string()}).superRefine(value=>{void value.ORIGIN_PROTOTYPE_REQUIRED;});
    function read(input:unknown){const result=schema.safeParse(input);if(!result.success){throw new Error(String(result.error));}return result.data;}
    declare const raw:unknown;const output=Object.freeze(read(raw));`,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(result.kind, result.kind === "unresolved" ? result.detail : "incorrect required-slot domain").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

for (const method of ["safeParse", "parse"] as const) {
  test(`parsed output consumers cannot overwrite a proven field: ${method}`, ({ scratch, repoRoot }) => {
    const modeName = "MODE";
    const schema = z.object({ [modeName]: z.enum(["local"]) });
    const result = schema.safeParse({ [modeName]: "local" });
    if (!result.success) {
      throw new Error("the native parser control failed");
    }
    const value = method === "parse" ? schema.parse({ [modeName]: "local" }) : result.data;
    const overwrite = (target: Record<typeof modeName, string>): void => {
      target[modeName] = "outside";
    };
    overwrite(value);
    expect(value.MODE).toBe("outside");
    symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    });
    const body =
      method === "safeParse"
        ? 'const result=schema.safeParse(input);if(!result.success){throw new Error("invalid");}overwrite(result.data);return result.data;'
        : "const result=schema.parse(input);overwrite(result);return result;";
    const source = project.createSourceFile(
      join(scratch, "output-consumer.ts"),
      `import {z} from "zod";
      function overwrite(value:{MODE:string}){value.MODE="outside";}
      const schema=z.object({MODE:z.enum(["local"])});function read(input:unknown){${body}}
      declare const raw:unknown;const output=Object.freeze(read(raw));`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "stale enum domain").toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const method of ["safeParse", "parse"] as const) {
  test(`closed parsed output aliases retain the direct return boundary: ${method}`, ({ scratch, repoRoot }) => {
    symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    });
    const body =
      method === "safeParse"
        ? 'const parsed=schema.safeParse(input);if(!parsed.success)throw new Error("invalid");const alias=parsed.data;return alias;'
        : "const parsed=schema.parse(input);const alias=parsed;return alias;";
    const source = project.createSourceFile(
      join(scratch, "closed-output-alias.ts"),
      `import {z} from "zod";const schema=z.object({MODE:z.enum(["local"])});function read(input:unknown){${body}}declare const raw:unknown;const output=Object.freeze(read(raw));`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "resolved").toBe("resolved");
      expect(fact.kind === "resolved" && fact.value.map((value) => value.value.getText())).toEqual(['"local"']);
    } finally {
      endReferencePass();
    }
  });
}

for (const method of ["safeParse", "parse"] as const) {
  test(`returned parser allocations keep unsafe and independently frozen callers separate: ${method}`, ({ scratch, repoRoot }) => {
    const modeName = "MODE";
    const nativeSchema = z.object({ [modeName]: z.enum(["local"]) });
    const first = nativeSchema.parse({ [modeName]: "local" });
    Reflect.set(first, modeName, "outside");
    const second = Object.freeze(nativeSchema.parse({ [modeName]: "local" }));
    expect(first.MODE).toBe("outside");
    expect(second.MODE).toBe("local");
    symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    });
    const body =
      method === "safeParse"
        ? 'const parsed=schema.safeParse(input);if(!parsed.success)throw new Error("invalid");return parsed.data;'
        : "return schema.parse(input);";
    const source = project.createSourceFile(
      join(scratch, "returned-output-consumers.ts"),
      `import {z} from "zod";
      function overwrite(value:{MODE:string}){value.MODE="outside";}
      const schema=z.object({MODE:z.enum(["local"])});function read(input:unknown){${body}}declare const raw:unknown;
      const first=read(raw);overwrite(first);const unsafeOutput=Object.freeze(first);const safeOutput=Object.freeze(read(raw));`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const safe = readReturnedValue(source.getVariableDeclarationOrThrow("safeOutput").getNameNode(), ["MODE"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      const unsafe = readReturnedValue(source.getVariableDeclarationOrThrow("unsafeOutput").getNameNode(), ["MODE"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      expect(safe.kind, safe.kind === "unresolved" ? safe.detail : "resolved").toBe("resolved");
      expect(safe.kind === "resolved" && safe.value.map((value) => value.value.getText())).toEqual(['"local"']);
      expect(unsafe.kind, unsafe.kind === "unresolved" ? unsafe.detail : "caller overwrite accepted").toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

test("a frozen parser result does not close a nested mutable output", ({ scratch, repoRoot }) => {
  const modeName = "MODE";
  const schema = z.object({ nested: z.object({ [modeName]: z.enum(["local"]) }) });
  const actual = Object.freeze(schema.parse({ nested: { [modeName]: "local" } }));
  Reflect.set(actual.nested, modeName, "outside");
  expect(actual.nested.MODE).toBe("outside");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "nested-frozen-output.ts"),
    `import {z} from "zod";
    function overwrite(value:{MODE:string}){value.MODE="outside";}
    const schema=z.object({nested:z.object({MODE:z.enum(["local"])})});function read(input:unknown){return schema.parse(input);}
    declare const raw:unknown;const output=Object.freeze(read(raw));overwrite(output.nested);`,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["nested", "MODE"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "shallow freeze accepted as deep closure").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

test("a refinement shallow copy cannot hide mutation of a nested output alias", ({ scratch, repoRoot }) => {
  const modeName = "MODE";
  const overwrite = (value: { nested: Record<typeof modeName, string> }): void => {
    value.nested[modeName] = "outside";
  };
  const schema = z.object({ nested: z.object({ [modeName]: z.enum(["local"]) }) }).superRefine((value) => overwrite({ ...value }));
  const actual = schema.parse({ nested: { [modeName]: "local" } });
  expect(actual.nested.MODE).toBe("outside");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "copied-output.ts"),
    `import {z} from "zod";
    function overwrite(value:{nested:{MODE:string}}){value.nested.MODE="outside";}
    const schema=z.object({nested:z.object({MODE:z.enum(["local"])})}).superRefine(value=>overwrite({...value}));
    function read(input:unknown){const result=schema.safeParse(input);if(!result.success)throw new Error("invalid");return result.data;}
    declare const raw:unknown;const output=Object.freeze(read(raw));`,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const fact = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["nested", "MODE"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(fact.kind, fact.kind === "unresolved" ? fact.detail : "stale nested enum domain").toBe("unresolved");
  } finally {
    endReferencePass();
  }
});

const PARSED_FIELD_CONTROLS = [
  {
    name: "a closed shape alias retains its actual field source",
    prelude: 'const fields={MODE:z.enum(["local"])};',
    schema: "z.object(fields)",
    expected: ['"local"'],
  },
  {
    name: "opaque shape aliases cannot define a runtime domain",
    prelude: 'const fields={MODE:z.enum(["local"])};declare function mutateShape(value:object):void;mutateShape(fields);',
    schema: "z.object(fields)",
    expected: undefined,
  },
  {
    name: "opaque spread shape aliases cannot define a runtime domain",
    prelude: 'const fields={MODE:z.enum(["local"])};declare function mutateShape(value:object):void;mutateShape(fields);',
    schema: "z.object({...fields})",
    expected: undefined,
  },
  {
    name: "a replaced schema slot is not the original field domain",
    schema: 'z.object({MODE:z.enum(["local"])})',
    after: 'schema.shape.MODE=z.enum(["outside"]) as typeof schema.shape.MODE;',
    expected: undefined,
  },
  {
    name: "an opaque schema consumer cannot preserve its runtime domain",
    prelude: "declare function mutateSchema(schema:object):void;",
    schema: 'z.object({MODE:z.enum(["local"])})',
    after: "mutateSchema(schema);",
    expected: undefined,
  },
  {
    name: "definite own required fields remain data reads",
    schema: 'z.object({MODE:z.enum(["local"]),NOTE:z.string()}).superRefine(value=>{void value.NOTE;})',
    expected: ['"local"'],
  },
  {
    name: "optional data reads require the closed inherited-effect owner",
    schema: 'z.object({MODE:z.enum(["local"]),NOTE:z.string().optional()}).superRefine(value=>{void value.NOTE;})',
    expected: ['"local"'],
  },
  {
    name: "own default undefined still shadows inherited access",
    schema: 'z.object({MODE:z.enum(["local"]),NOTE:z.string().default(undefined as never)}).superRefine(value=>{void value.NOTE;})',
    expected: ['"local"'],
  },
  {
    name: "authored defaults bypass enum validation",
    schema: 'z.object({MODE:z.enum(["local"]).default("outside" as never)})',
    expected: ['"local"', '"outside"'],
  },
  {
    name: "transform field replacement supplies its actual value",
    schema: 'z.object({MODE:z.enum(["local"])}).transform(value=>({...value,MODE:"outside"}))',
    expected: ['"outside"'],
  },
  {
    name: "a refinement context alias cannot mutate the parsed record",
    schema: 'z.object({MODE:z.enum(["local"])}).superRefine((_value,ctx)=>{const alias=(ctx as {value:{MODE:string}}).value;alias.MODE="outside";})',
    expected: undefined,
  },
  {
    name: "a parsed value alias cannot mutate the demanded field",
    schema: 'z.object({MODE:z.enum(["local"])}).superRefine(value=>{const alias=value;alias.MODE="outside" as never;})',
    expected: undefined,
  },
  {
    name: "unknown callback consumers do not acquire field purity",
    prelude: "declare function consume(value:object):void;",
    schema: 'z.object({MODE:z.enum(["local"])}).superRefine(value=>consume(value))',
    expected: undefined,
  },
  { name: "computed default callbacks require their own effect proof", schema: 'z.object({MODE:z.enum(["local"]).default(()=>"local")})', expected: undefined },
  {
    name: "another result success guard does not admit this data",
    schema: 'z.object({MODE:z.enum(["local"])})',
    guard: 'const other=schema.safeParse(raw);if(!other.success){throw new Error("other");}',
    expected: undefined,
  },
] as const;

for (const control of PARSED_FIELD_CONTROLS) {
  test(`successful parser field boundary: ${control.name}`, ({ scratch, repoRoot }) => {
    symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    });
    const source = project.createSourceFile(
      join(scratch, "parsed-control.ts"),
      `import {z} from "zod";
      ${"prelude" in control ? control.prelude : ""}
      const schema=${control.schema};${"after" in control ? control.after : ""}declare const raw:unknown;
      function read(input:unknown){const result=schema.safeParse(input);${"guard" in control ? control.guard : "if(!result.success){throw new Error(String(result.error));}"}return result.data;}
      const output=Object.freeze(read(raw));`,
    );
    beginReferencePass();
    try {
      const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
      const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
        terminals: new Set(),
        bindings: new Map(),
      });
      expect(result.kind, result.kind === "unresolved" ? result.detail : "resolved").toBe(control.expected === undefined ? "unresolved" : "resolved");
      expect(result.kind === "resolved" ? result.value.map((value) => value.value.getText()) : undefined).toEqual(control.expected);
      expect(result.kind !== "resolved" || result.value.every((value) => value.present && value.path.length === 0)).toBe(true);
    } finally {
      endReferencePass();
    }
  });
}

test("a supplied-key reentry keeps the active parse continuation and resolves the enum domain", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "parsed-cycle.ts"),
    `import {z} from "zod";
    const TABLE={local:()=>true};function dispatch(mode:string){return TABLE[mode]();}
    const schema=z.object({MODE:z.enum(["local"])});declare const raw:unknown;
    function read(input:unknown){const result=schema.safeParse(input);if(!result.success){throw new Error(String(result.error));}return result.data;}
    dispatch(read(raw).MODE);const output=Object.freeze(read(raw));`,
  );
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants());
    const result = readReturnedValue(source.getVariableDeclarationOrThrow("output").getNameNode(), ["MODE"], observed, {
      terminals: new Set(),
      bindings: new Map(),
    });
    expect(result.kind, result.kind === "unresolved" ? result.detail : "resolved").toBe("resolved");
    expect(result.kind === "resolved" ? result.value.map((value) => value.value.getText()) : undefined).toEqual(['"local"']);
  } finally {
    endReferencePass();
  }
});

/** Every prototype exposure the census reports in the env parser's program, each with why its key cannot be
 *  attacker-chosen or why the write cannot reach a shared prototype. A new exposure reds this list. */
const CLASSIFIED_ENV_PROGRAM_EXPOSURES: readonly { readonly site: string; readonly why: string }[] = [
  {
    site: "packages/contracts/src/inference/wire-subset.ts: properties[name] = { ...(description === undefined ? {} : { description }), anyOf: [rest, { ...NULL_ARM }] }",
    why: "rewrites a key read from Object.keys of the same object; an own data property shadows the inherited accessor",
  },
  {
    site: "packages/contracts/src/inference/usage.ts: detail[axis] = modalitySchema.options.flatMap((modality) => {",
    why: "the key is a tokenDetailsSchema.keyof() option",
  },
  { site: "packages/contracts/src/theme/override.ts: subset[key] = value", why: "the key is a CARD_EMBEDDABLE_THEME_KEYS literal" },
  { site: "packages/kit/src/macro/parser.ts: flags[key] = true", why: "the key is a FLAG_KEY_BY_CHAR value, a closed MacroFlagKey" },
  {
    site: "packages/kit/src/macro/variables.ts: Object.defineProperty(plane, key, { value, writable: true, enumerable: true, configurable: true })",
    why: "template-text key, defined as an own data property, so no inherited setter runs",
  },
  { site: "packages/kit/src/macro/variables.ts: Reflect.deleteProperty(env, op.key)", why: "deletes an own property only; delete never reaches a prototype" },
  { site: "packages/kit/src/macro/user-macros.ts: draws[input.name] = drawn", why: "the name matches MACRO_NAME_RE, which cannot spell __proto__" },
  { site: "packages/contracts/src/preset/index.ts: out[field] = params[field]", why: "the key is a ROLE_PRESET_FIELDS literal" },
  { site: "packages/contracts/src/preset/index.ts: out[k] = v", why: "every setNum caller passes a literal field name" },
  { site: "packages/contracts/src/preset/index.ts: out[k] = v", why: "every setNumAbove caller passes a literal field name" },
  { site: "packages/contracts/src/rpg/extraction.ts: props[field]", why: "removeField callers pass literal schema field names" },
  { site: "packages/kit/src/json-schema/lift.ts: this.constructor.name", why: "a read of the error class's own constructor, not a write" },
  {
    site: "packages/kit/src/json-schema/lift.ts: shape[key] = requiredSet.has(key) ? lifted : boxGeneratedSchema(lifted.schema.optional())",
    why: "authored schema property names; liftObject refuses __proto__ before this write",
  },
  {
    site: "packages/kit/src/json-schema/index.ts: normalized[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, normalizeSchemaChild(child)]))",
    why: "rewrites an own key from Object.entries of the same object, gated to SCHEMA_MAP_KEYS",
  },
  {
    site: "packages/kit/src/json-schema/index.ts: normalized[key] = normalizeSchemaChild(value)",
    why: "rewrites an own key from Object.entries of the same object, gated to SCHEMA_CHILD_KEYS",
  },
  {
    site: "packages/contracts/src/rpg/structured-patch.ts: cursor[segment] = created",
    why: "segments are property names of the static rpgExtractionSchema projection or a decimal item index; model output only selects a leaf through a Map",
  },
  {
    site: "packages/contracts/src/rpg/structured-patch.ts: owner[key] = leaf.append ? [...(Array.isArray(owner[key]) ? owner[key] : []), value] : value",
    why: "the key is a static schema property name; model output supplies only the value",
  },
  { site: "packages/contracts/src/rpg/structured-patch.ts: owner[key] = Object.entries(elements)", why: "the key is a static schema property name" },
  { site: "packages/contracts/src/refinery/schema-forge.ts: node[RENDER_HINT_KEY] = hint", why: "the key is the RENDER_HINT_KEY literal" },
  {
    site: 'packages/contracts/src/refinery/schema-forge.ts: properties[key] = isArray ? { type: "array", items: owner } : owner',
    why: "model-designed key: segmentsOf refuses __proto__ and reads test Object.hasOwn",
  },
  {
    site: 'packages/contracts/src/refinery/schema-forge.ts: properties[key] = isList ? { type: "array", items: leaf } : leaf',
    why: "model-designed key: segmentsOf refuses __proto__ and reads test Object.hasOwn",
  },
  { site: "packages/contracts/src/refinery/schema-forge.ts: properties[core.name] = { ...core.node }", why: "the key is a REFINERY_FORGE_CORE_NODES literal" },
  {
    site: "packages/contracts/src/prose/index.ts: out[id] = override",
    why: "isProseSlotId and the slot's own home check admit only PROSE_SLOTS ids",
  },
  { site: "packages/kit/src/handle-key/index.ts: data.prototype.get(char)", why: "a read of a Map the confusables table names prototype" },
  { site: "packages/server/src/foundation/env/index.ts: process.env[key] = value", why: "the operator's own .env key, written to Node's environment object" },
  { site: "packages/server/src/foundation/env/index.ts: Reflect.deleteProperty(process.env, key)", why: "the key is an APP_SECRET_ENV_KEYS literal" },
];

const ENV_PROGRAM_CENSUS_BUDGET_MS = 30_000;

function exposureName(repoRoot: string, site: Node): string {
  return `${relative(repoRoot, site.getSourceFile().getFilePath())}: ${site.getText().split("\n")[0] ?? ""}`;
}

// The case loads the env parser's whole program and runs the census over every source in it.
test("the actual env parser's AUTH_MODE proof refuses on the classified prototype census", { timeout: scaledBudget(ENV_PROGRAM_CENSUS_BUDGET_MS) }, ({
  repoRoot,
}) => {
  const project = new Project({ tsConfigFilePath: join(repoRoot, "packages/server/tsconfig.json"), skipAddingFilesFromTsConfig: true });
  const source = project.addSourceFileAtPath(join(repoRoot, "packages/server/src/foundation/env/index.ts"));
  const output = source.getVariableDeclarationOrThrow("env").getNameNode();
  const bind = source.getImportDeclarationOrThrow("./bind.ts").getModuleSpecifierSourceFileOrThrow();
  const instruction = bind
    .getFunctionOrThrow("otherDevicesSentence")
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "signInModeEnvLines");
  if (instruction === undefined) {
    throw new Error("the actual sign-in instruction caller is missing");
  }
  const passwordMode = bind.getVariableDeclarationOrThrow("PASSWORD_MODE");
  beginReferencePass();
  try {
    const observed = observeCallReturns(
      [...source.getDescendantsOfKind(SyntaxKind.CallExpression), instruction],
      [...source.getDescendants(), instruction, ...instruction.getDescendants(), passwordMode, ...passwordMode.getDescendants()],
    );
    const admitted = readCallReturnProgram(instruction, observed);
    if (admitted.kind === "unresolved") {
      throw new Error(admitted.detail);
    }
    const targets = admitted.value.byCall.get(instruction.compilerNode)?.targets;
    const target = targets?.kind === "resolved" ? targets.value[0] : undefined;
    if (!Node.isFunctionDeclaration(target)) {
      throw new Error("the actual instruction target is not a captured function");
    }
    const mode = target.getParameters()[0]?.getNameNode();
    if (mode === undefined) {
      throw new Error("the actual instruction mode formal is absent");
    }
    const supplied = readSuppliedParameter(mode, new Map(), admitted.value);
    expect(supplied.kind, supplied.kind === "unresolved" ? supplied.detail : "resolved").toBe("resolved");
    const actual =
      supplied.kind === "resolved"
        ? supplied.value.flatMap((value) => {
            const projected = readReturnedValue(value.value, value.path, observed, { terminals: new Set(), bindings: value.bindings });
            return projected.kind === "resolved" ? projected.value.map((leaf) => leaf.value.getText()) : [projected.detail];
          })
        : undefined;
    expect(actual).toEqual(['"local"']);
    const ordinary = readReturnedValue(mode, [], observed, { terminals: new Set(), bindings: new Map() });
    expect(
      ordinary.kind === "resolved" && ordinary.value.length === 1 && ordinary.value[0]?.value.compilerNode === mode.compilerNode,
      "ordinary return projection deliberately retains unbound formals",
    ).toBe(true);
    // D323: an absent own-data read is unprovable while the program holds any prototype exposure, and the env
    // loader's own `.env` write is one by construction. The proof refuses by name on the classified census.
    const field = readReturnedValue(output, ["AUTH_MODE"], observed, { terminals: new Set(), bindings: new Map() });
    expect(field.kind === "unresolved" ? `${field.reason}: ${field.detail}` : "resolved").toBe("unsupported: the loaded Project contains a prototype exposure");
    const census = readPrototypeExposureCensus(output);
    expect(census.kind === "resolved" ? census.value.map((site) => exposureName(repoRoot, site)) : census.detail).toEqual(
      CLASSIFIED_ENV_PROGRAM_EXPOSURES.map(({ site }) => site),
    );
  } finally {
    endReferencePass();
  }
});

test("successful installed Zod fields retain authored enum and actual default witnesses through native freeze", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  const source = project.createSourceFile(
    join(scratch, "parsed-fields.ts"),
    `import {z} from "zod";
    const MODES=["local","oidc"] as const;
    const mode=z.enum(MODES).default("local");
    const schema=z.object({MODE:mode});
    function read(input:unknown){const parsed=schema.safeParse(input);if(!parsed.success){throw new Error(String(parsed.error));}return parsed.data;}
    declare const raw:unknown;const output=Object.freeze(read(raw));`,
  );
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const output = source.getVariableDeclarationOrThrow("output").getNameNode();
  beginReferencePass();
  try {
    const observed = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { nativeValueTransfers: true });
    const field = readReturnedValue(output, ["MODE"], observed, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
    expect(field.kind, field.kind === "unresolved" ? `${field.reason}: ${field.detail}` : "resolved").toBe("resolved");
    expect(field.kind === "resolved" && field.value.map((value) => value.value.getText())).toEqual(['"local"', '"oidc"', '"local"']);
    expect(field.kind === "resolved" && field.value.every((value) => value.present && value.path.length === 0 && value.value.getSourceFile() === source)).toBe(
      true,
    );
  } finally {
    endReferencePass();
  }
});

test("canonical factory facts distinguish installed identity, another factory and unreadable nested provenance", ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, target: ScriptTarget.ES2022, module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
  });
  project.createSourceFile(join(scratch, "barrel.ts"), 'export { z as schema } from "zod";\n');
  project.createSourceFile(
    join(scratch, "foreign.ts"),
    "export declare const bag: { readonly nested: any };\nexport const other = { nested: { string: () => ({}) } };\n",
  );
  const source = project.createSourceFile(
    join(scratch, "x.ts"),
    `import { z, string as text, object as shape } from "zod";
import { schema } from "./barrel.ts";
import { bag, other } from "./foreign.ts";
export const Direct = z.string();
export const Named = text();
export const Renamed = schema.string();
export const Wrapped = ((z.string))();
export const Numeric = z.number();
export const Counterfeit = other.nested.string();
export const Opaque = bag.nested.string();
export const ComputedOpaque = bag["nested"]["string"]();
export const WrappedOpaque = ((bag.nested.string))();
export const NonCall = 1;
export const DirectShape = shape({});
export const OpaqueShape = bag.nested.object({});
`,
  );
  expect(source.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getFilePath()).toContain("/node_modules/zod/");
  const initializers = new Map(source.getVariableDeclarations().map((declaration) => [declaration.getName(), declaration.getInitializerOrThrow()]));
  for (const [name, matches] of [
    ["Direct", true],
    ["Named", true],
    ["Renamed", true],
    ["Wrapped", true],
    ["Numeric", false],
    ["Counterfeit", false],
    ["NonCall", false],
  ] as const) {
    const initializer = initializers.get(name);
    if (initializer === undefined) {
      throw new Error(`the ${name} factory control is absent`);
    }
    expect(resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toMatchObject({ kind: "resolved", value: matches });
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toBe(matches);
  }
  for (const name of ["Opaque", "ComputedOpaque", "WrappedOpaque"]) {
    const initializer = initializers.get(name);
    if (initializer === undefined) {
      throw new Error(`the ${name} opaque control is absent`);
    }
    const origin = resolveModuleMemberOrigin(initializer.asKindOrThrow(SyntaxKind.CallExpression).getExpression());
    expect(origin, name).toMatchObject({ kind: "resolved", value: { canonical: { kind: "project" }, memberPath: ["nested", "string"] } });
    if (origin.kind === "unresolved" || origin.value.canonical.kind !== "project") {
      throw new Error("the opaque control must reach native property resolution");
    }
    const property = resolveTypePropertyOrigin(origin.value.canonical.declaration, origin.value.memberPath);
    expect(property.kind, name).toBe("unresolved");
    const fact = resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE);
    expect(fact, name).toMatchObject({ kind: "unresolved", reason: "missing" });
    if (property.kind === "resolved" || fact.kind === "resolved") {
      throw new Error("the native property refusal must remain a factory refusal");
    }
    expect(fact.node, name).toBe(property.node);
    expect(fact.detail, name).toBe(property.detail);
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), name).toBe(false);
    expect(isZodCall(initializer, STRING_FACTORY), name).toBe(false);
  }
  expect(
    source
      .getVariableStatements()
      .flatMap(inlineShapeNames)
      .map((name) => name.getText()),
  ).toEqual(["DirectShape"]);
});

test("positive-only factory callers keep unresolved relative and package doors separate from negative facts", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/factory-doors/x.ts",
    `import { z } from "zod";
import { z as missing } from "./missing.ts";
export const Package = z.string();
export const Relative = missing.string();
`,
  );
  for (const declaration of source.getVariableDeclarations()) {
    const initializer = declaration.getInitializerOrThrow();
    expect(resolveFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), declaration.getName()).toMatchObject({
      kind: "unresolved",
      reason: "missing",
    });
    expect(isFactoryCallFromPackage(initializer, STRING_FACTORY, ZOD_PACKAGE), declaration.getName()).toBe(false);
  }
});
