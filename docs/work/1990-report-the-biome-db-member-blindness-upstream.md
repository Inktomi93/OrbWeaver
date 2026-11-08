---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: testing
lane: wt/agent-a60e00384795f1ed5
plan: test-foundation
---

# Report the Biome Db member blindness upstream

## What

A member typed Db by name stops Biome useDisposables from firing, which is why OwnedDb spells its member through closeDb's parameter type. Reduce it to a minimal case and report it to Biome.

## Why

The odd type spelling exists only to work around this rule gap, and a later Biome version could change it silently.

## Done when

The rule is fixed upstream and the spelling becomes Db, or the workaround is recorded as permanent with its reason.

## Evidence

The defect reproduces on the pinned Biome `2.6.2` and on the latest release, `2.6.6`, so the spelling stays. The name `Db` is not the trigger. The rule goes silent when a member's type reaches a union of `Array<Date | Uint8Array>` and `Record<string, Date | Uint8Array>`, which `@libsql/client` declares as `InArgs`. A member typed drizzle's `LibSQLDatabase`, which `Db` is, or libsql's `Client` is silent. Cutting `Client` down to one member at a time leaves it silent only for the members that reach `InArgs`, such as `execute`. `Parameters<typeof closeDb>[0]` names the same type as `Db` but fires, because Biome does not resolve it.

The reduction ran in a fresh directory with no dependencies and each Biome version installed exactly. Each of these keeps the diagnostic: `Date | Uint8Array` alone, `Array<Date | Uint8Array>` alone, `Record<string, Date | Uint8Array>` alone, the same union with `string` or `ArrayBuffer` in place of `Uint8Array`, and unions of string literals under the same `Array | Record` shape. In the repository, a holder member typed `Db` or `LibSQLDatabase` is silent and one typed `string` fires. The issue is not posted: posting is the owner's call.

Issue text:

````markdown
### useDisposables misses a disposable whose member type is `Array<Date | Uint8Array> | Record<string, Date | Uint8Array>`

**Environment**: `@biomejs/biome` 2.6.2 and 2.6.6, Linux x64, no other dependencies.

`lint/nursery/useDisposables` reports an unowned acquisition of a `Disposable`. It stays silent when the disposable has a member whose type is a union of an `Array` and a `Record` over `Date | Uint8Array`. This shape is real: `@libsql/client` declares `InArgs` this way, so every holder of a libsql `Client` or a drizzle `LibSQLDatabase` loses the diagnostic.

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.6/schema.json",
  "root": true,
  "vcs": { "enabled": false },
  "linter": { "enabled": true, "rules": { "preset": "none", "nursery": { "useDisposables": "error" } } }
}
```

`src/minimal.ts`:

```ts
type Silencing = Array<Date | Uint8Array> | Record<string, Date | Uint8Array>;
type Control = Array<Date | string> | Record<string, Date | string>;

interface OwnedSilencing extends Disposable {
  readonly value: Silencing;
}

interface OwnedControl extends Disposable {
  readonly value: Control;
}

declare function ownSilencing(): OwnedSilencing;
declare function ownControl(): OwnedControl;

export function acquire(): void {
  const silencing = ownSilencing();
  const control = ownControl();
  console.log(silencing, control);
}
```

Run `biome lint --max-diagnostics=none src`.

**Expected**: two diagnostics, on `silencing` and on `control`.

**Actual**: one diagnostic, on `control`. `silencing` is not reported.

The diagnostic comes back when the member is `Date | Uint8Array`, `Array<Date | Uint8Array>` or `Record<string, Date | Uint8Array>` alone, or when `Uint8Array` is replaced by `string` or `ArrayBuffer`.
````
