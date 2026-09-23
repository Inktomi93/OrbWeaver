// React development-renderer evidence for snap's --react-profile arm. The browser half is deliberately a
// minimal global-hook collector, not the React DevTools backend/frontend: React already hands the hook
// the Fiber root at every commit, and the agent-readable contract is a bounded read-only projection of
// that graph. owns the capability/omission census.
import type { EvidenceWindowId } from "../../_shared/artifact-scope.ts";
import type {
  RankedReactComponent,
  ReactActivitySummary,
  ReactCommitEvidence,
  ReactFiberEvidence,
  ReactProfileLimits,
  ReactProfilePageEvidence,
} from "../contract/react-profile.ts";

const COMPOSITE_KINDS = new Set(["ClassComponent", "ForwardRef", "FunctionComponent", "LazyComponent", "MemoComponent", "SimpleMemoComponent"]);
const ROUND_FACTOR = 1000;

export const REACT_PROFILE_LIMITS = {
  maxCommits: 256,
  maxEventsPerKind: 2000,
  maxFibersPerCommit: 5000,
  maxPreviewDepth: 3,
  maxPreviewStringLength: 1000,
  maxPreviewArrayEntries: 24,
  maxPreviewObjectKeys: 32,
  maxHookSlots: 64,
  maxContextDependencies: 32,
  maxChangedKeys: 64,
  boundaryChunkRecords: 100,
} as const satisfies ReactProfileLimits;

function rounded(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

/** Rank the same component path within one page+renderer across this call's commits. Identity is never
 * erased: two contexts rendering the same named component remain two rows. */
export function rankReactComponents(pages: readonly ReactProfilePageEvidence[]): readonly RankedReactComponent[] {
  interface MutableRank {
    contextIndex: number;
    pageIndex: number;
    rendererId: number;
    name: string;
    path: string;
    commits: Set<number>;
    renderCount: number;
    total: number;
    max: number;
    self: number;
    subtree: number;
    base: number;
  }
  const rows = new Map<string, MutableRank>();
  const visit = (page: ReactProfilePageEvidence, commit: ReactCommitEvidence, fiber: ReactFiberEvidence): void => {
    if (fiber.rendered && fiber.activityState === "active" && COMPOSITE_KINDS.has(fiber.kind)) {
      const key = `${page.contextIndex}\u0000${page.pageIndex}\u0000${commit.rendererId}\u0000${fiber.path}`;
      const row = rows.get(key) ?? {
        contextIndex: page.contextIndex,
        pageIndex: page.pageIndex,
        rendererId: commit.rendererId,
        name: fiber.name,
        path: fiber.path,
        commits: new Set<number>(),
        renderCount: 0,
        total: 0,
        max: 0,
        self: 0,
        subtree: 0,
        base: 0,
      };
      row.commits.add(commit.id);
      row.renderCount += 1;
      row.total += fiber.actualDurationMs;
      row.max = Math.max(row.max, fiber.actualDurationMs);
      row.self += fiber.selfTimeMs;
      row.subtree += fiber.subtreeTimeMs;
      row.base = Math.max(row.base, fiber.treeBaseDurationMs);
      rows.set(key, row);
    }
  };
  for (const page of pages) {
    for (const commit of page.commits) {
      for (const fiber of commit.fibers) {
        visit(page, commit, fiber);
      }
    }
  }
  return [...rows.values()]
    .map(
      (row): RankedReactComponent => ({
        contextIndex: row.contextIndex,
        pageIndex: row.pageIndex,
        rendererId: row.rendererId,
        name: row.name,
        path: row.path,
        commitCount: row.commits.size,
        renderCount: row.renderCount,
        totalActualDurationMs: rounded(row.total),
        averageActualDurationMs: rounded(row.total / row.renderCount),
        maxActualDurationMs: rounded(row.max),
        selfTimeMs: rounded(row.self),
        subtreeTimeMs: rounded(row.subtree),
        maxTreeBaseDurationMs: rounded(row.base),
      }),
    )
    .sort((a, b) => b.totalActualDurationMs - a.totalActualDurationMs || b.selfTimeMs - a.selfTimeMs || a.path.localeCompare(b.path));
}

/** Count hidden composite work separately so retained low-priority Activity/Offscreen renders cannot
 * disappear merely because the active hot-path table excludes them. */
export function summarizeReactActivity(pages: readonly ReactProfilePageEvidence[]): ReactActivitySummary {
  let retainedHiddenCompositeRenderCount = 0;
  const visit = (fiber: ReactFiberEvidence): void => {
    if (fiber.rendered && fiber.activityState === "retained-hidden" && COMPOSITE_KINDS.has(fiber.kind)) {
      retainedHiddenCompositeRenderCount += 1;
    }
  };
  for (const page of pages) {
    for (const commit of page.commits) {
      for (const fiber of commit.fibers) {
        visit(fiber);
      }
    }
  }
  return { retainedHiddenCompositeRenderCount };
}

/** One init-script per call. Existing profiled documents open a new window; future documents execute all
 * registered scripts in order, so the newest call token wins before any page script runs. */
export function reactProfileInitScript(windowId: EvidenceWindowId): string {
  return `(() => {
  const WINDOW_ID = ${JSON.stringify(windowId)};
  const LIMITS = ${JSON.stringify(REACT_PROFILE_LIMITS)};
  const GLOBAL_KEY = "__ORB_SNAP_REACT_PROFILE__";
  const existing = globalThis[GLOBAL_KEY];
  if (existing && typeof existing.beginWindow === "function") {
    existing.beginWindow(WINDOW_ID);
    return;
  }
  const originalHook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const state = {
    windowId: WINDOW_ID, nextRendererId: 1, nextFiberId: 1, nextCommitId: 1,
    renderers: [], commits: [], schedules: [], unmounts: [], postCommits: [], measures: [],
    roots: new Map(), fiberIds: new WeakMap(), errors: [],
    start: { commits: 0, schedules: 0, unmounts: 0, postCommits: 0, measures: 0 },
  };
  const capString = (value, max = LIMITS.maxEventsPerKind) => String(value).slice(0, max);
  const recordError = (message) => { if (!state.errors.includes(message)) state.errors.push(message); };
  const pushEvent = (list, value, label) => { if (list.length < LIMITS.maxEventsPerKind) list.push(value); else recordError(label + " exceeded the " + LIMITS.maxEventsPerKind + "-event call cap"); };
  const safeNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const fiberId = (fiber) => {
    if (!fiber || (typeof fiber !== "object" && typeof fiber !== "function")) return 0;
    let id = state.fiberIds.get(fiber) || (fiber.alternate ? state.fiberIds.get(fiber.alternate) : 0);
    if (!id) id = state.nextFiberId++;
    state.fiberIds.set(fiber, id);
    if (fiber.alternate) state.fiberIds.set(fiber.alternate, id);
    return id;
  };
  const typeName = (type) => {
    if (typeof type === "string") return type;
    if (typeof type === "function") return type.displayName || type.name || "Anonymous";
    if (!type || typeof type !== "object") return "Anonymous";
    if (typeof type.displayName === "string") return type.displayName;
    if (type.render) return typeName(type.render);
    if (type.type) return typeName(type.type);
    return "Anonymous";
  };
  const tags = {
    0: "FunctionComponent", 1: "ClassComponent", 2: "IndeterminateComponent", 3: "HostRoot",
    4: "HostPortal", 5: "HostComponent", 6: "HostText", 7: "Fragment", 8: "Mode",
    9: "ContextConsumer", 10: "ContextProvider", 11: "ForwardRef", 12: "Profiler",
    13: "Suspense", 14: "MemoComponent", 15: "SimpleMemoComponent", 16: "LazyComponent",
    17: "IncompleteClassComponent", 18: "DehydratedFragment", 19: "SuspenseList", 21: "Scope",
    22: "Offscreen", 23: "LegacyHidden", 24: "Cache", 25: "TracingMarker", 26: "HostHoistable",
    27: "HostSingleton", 31: "Activity",
  };
  const profiledCompositeTags = new Set([0, 1, 11, 14, 15, 16]);
  const nameOf = (fiber) => {
    const kind = tags[fiber.tag] || "UnknownFiber";
    if (kind === "HostRoot") return "<root>";
    if (kind === "HostText") return "#text";
    if (kind === "Fragment") return "Fragment";
    if (kind === "Suspense") return "Suspense";
    if (kind === "Profiler") return "Profiler";
    if (kind === "Offscreen" || kind === "Activity") return kind;
    return typeName(fiber.elementType || fiber.type) || kind;
  };
  const preview = (value, depth = 0, seen = new WeakSet(), key = "") => {
    if (/password|secret|token|authorization|cookie/i.test(key)) return "[redacted]";
    if (value === null || typeof value === "boolean") return value;
    if (value === undefined) return "[undefined]";
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") return capString(value, LIMITS.maxPreviewStringLength);
    if (typeof value === "bigint" || typeof value === "symbol") return String(value);
    if (typeof value === "function") return "[function " + (value.displayName || value.name || "anonymous") + "]";
    if (depth >= LIMITS.maxPreviewDepth) return "[" + (value.constructor?.name || "Object") + " depth>=" + LIMITS.maxPreviewDepth + "]";
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (typeof Node !== "undefined" && value instanceof Node) return "[DOM " + value.nodeName + "]";
    if (value.$$typeof && (value.type || value.props)) return { reactElement: typeName(value.type), key: value.key ?? null };
    if (Array.isArray(value)) {
      const out = value.slice(0, LIMITS.maxPreviewArrayEntries).map((entry) => preview(entry, depth + 1, seen));
      if (value.length > LIMITS.maxPreviewArrayEntries) out.push("[truncated " + (value.length - LIMITS.maxPreviewArrayEntries) + " entries]");
      return out;
    }
    if (value instanceof Map) return { map: Array.from(value.entries()).slice(0, LIMITS.maxPreviewArrayEntries).map(([k, v]) => [preview(k, depth + 1, seen), preview(v, depth + 1, seen)]), omittedEntries: Math.max(0, value.size - LIMITS.maxPreviewArrayEntries) };
    if (value instanceof Set) return { set: Array.from(value.values()).slice(0, LIMITS.maxPreviewArrayEntries).map((entry) => preview(entry, depth + 1, seen)), omittedEntries: Math.max(0, value.size - LIMITS.maxPreviewArrayEntries) };
    const out = {};
    const ownKeys = Object.keys(value);
    for (const ownKey of ownKeys.slice(0, LIMITS.maxPreviewObjectKeys)) {
      try { out[ownKey] = preview(value[ownKey], depth + 1, seen, ownKey); }
      catch (error) { out[ownKey] = "[unreadable: " + capString(error, 200) + "]"; }
    }
    if (ownKeys.length > LIMITS.maxPreviewObjectKeys) out.__orbPreviewOmittedKeys = ownKeys.length - LIMITS.maxPreviewObjectKeys;
    return out;
  };
  const hookSlots = (fiber) => {
    if (![0, 11, 14, 15].includes(fiber.tag)) return [];
    const slots = []; let hook = fiber.memoizedState; let index = 0;
    while (hook && index < LIMITS.maxHookSlots) { slots.push({ index, value: preview(hook.memoizedState) }); hook = hook.next; index += 1; }
    return slots;
  };
  const contextValues = (fiber) => {
    const out = []; let item = fiber.dependencies?.firstContext; let index = 0;
    while (item && index < LIMITS.maxContextDependencies) {
      out.push({ index, name: item.context?.displayName || "Context", value: preview(item.memoizedValue) });
      item = item.next; index += 1;
    }
    return out;
  };
  const shallowChanged = (current, previous) => {
    if (!current || !previous || typeof current !== "object" || typeof previous !== "object") return Object.is(current, previous) ? [] : ["<value>"];
    const keys = new Set([...Object.keys(current), ...Object.keys(previous)]); const changed = [];
    for (const key of keys) if (!Object.is(current[key], previous[key])) changed.push(key);
    return changed.slice(0, LIMITS.maxChangedKeys);
  };
  const linkedChanged = (current, previous, value) => {
    const changed = []; let a = current; let b = previous; let index = 0;
    while ((a || b) && index < LIMITS.maxChangedKeys) { if (!a || !b || !Object.is(value(a), value(b))) changed.push(index); a = a?.next; b = b?.next; index += 1; }
    return changed;
  };
  const reasonOf = (fiber, rendered) => {
    const alternate = fiber.alternate;
    if (!alternate) return { kind: "mount", props: [], state: false, context: [], hooks: [] };
    const props = shallowChanged(fiber.memoizedProps, alternate.memoizedProps);
    const state = !Object.is(fiber.memoizedState, alternate.memoizedState) && fiber.tag === 1;
    const context = linkedChanged(fiber.dependencies?.firstContext, alternate.dependencies?.firstContext, (entry) => entry.memoizedValue);
    const hooks = [0, 11, 14, 15].includes(fiber.tag) ? linkedChanged(fiber.memoizedState, alternate.memoizedState, (entry) => entry.memoizedState) : [];
    return { kind: !rendered ? "bailout" : props.length || state || context.length || hooks.length ? "direct-change" : "rendered-without-shallow-change", props, state, context, hooks };
  };
  const boundaryOf = (fiber) => {
    if (fiber.tag === 13) return { type: "suspense", status: fiber.memoizedState === null ? "content" : fiber.memoizedState.dehydrated ? "dehydrated" : "fallback", state: preview(fiber.memoizedState) };
    if (fiber.tag === 22 || fiber.tag === 31) return { type: tags[fiber.tag], status: fiber.memoizedState === null ? "visible" : "hidden", state: preview(fiber.memoizedState) };
    if (fiber.tag === 1) return { type: "class", errorBoundary: Boolean(fiber.type?.getDerivedStateFromError || fiber.type?.prototype?.componentDidCatch), state: preview(fiber.memoizedState) };
    return null;
  };
  const compositeShapeErrors = (rootFiber) => {
    const errors = []; const pending = []; let child = rootFiber?.child; let count = 0;
    while (child) { pending.push(child); child = child.sibling; }
    const seen = new WeakSet();
    while (pending.length && count < LIMITS.maxFibersPerCommit) {
      const fiber = pending.pop(); count += 1;
      if (seen.has(fiber)) { errors.push(nameOf(fiber) + ".Fiber graph contains a cycle"); continue; }
      seen.add(fiber);
      if (profiledCompositeTags.has(fiber.tag)) {
        const name = nameOf(fiber);
        if (!Number.isFinite(fiber.actualDuration)) errors.push(name + ".actualDuration is absent");
        if (!Number.isFinite(fiber.treeBaseDuration)) errors.push(name + ".treeBaseDuration is absent");
      }
      if (fiber.child !== null && fiber.child !== undefined && typeof fiber.child !== "object") errors.push(nameOf(fiber) + ".child link is malformed");
      let nested = fiber.child;
      while (nested) { pending.push(nested); nested = nested.sibling; }
      if (errors.length >= 64) return errors;
    }
    if (pending.length) errors.push("composite shape validation exceeded the " + LIMITS.maxFibersPerCommit + "-Fiber cap");
    return errors;
  };
  const readTree = (rootFiber) => {
    let count = 0; let truncated = false; const fibers = []; const seen = new WeakSet();
    const pending = [{ fiber: rootFiber, parentId: null, siblingIndex: 0, inheritedHidden: false }];
    while (pending.length) {
      if (count >= LIMITS.maxFibersPerCommit) { truncated = true; break; }
      const frame = pending.pop(); const fiber = frame.fiber;
      if (seen.has(fiber)) { recordError("React Fiber graph contained a cycle at " + nameOf(fiber)); continue; }
      seen.add(fiber); count += 1;
      const kind = tags[fiber.tag] || "UnknownFiber"; const name = nameOf(fiber); const id = fiberId(fiber);
      const key = fiber.key === null || fiber.key === undefined ? null : capString(fiber.key, 200);
      const segment = name + (key === null ? "#" + frame.siblingIndex : "[key=" + key + "]");
      const alternate = fiber.alternate; const rendered = !alternate || (fiber.flags & 1) === 1 || fiber.memoizedProps !== alternate.memoizedProps || fiber.memoizedState !== alternate.memoizedState || fiber.ref !== alternate.ref;
      const activityState = frame.inheritedHidden || ((fiber.tag === 22 || fiber.tag === 31) && fiber.memoizedState !== null) ? "retained-hidden" : "active";
      const actual = safeNumber(fiber.actualDuration); let self = actual;
      if (!alternate || alternate.child !== fiber.child) for (let child = fiber.child; child; child = child.sibling) self -= safeNumber(child.actualDuration);
      const stack = fiber._debugStack?.stack || fiber._debugStack;
      const children = []; let child = fiber.child; let index = 0;
      while (child) { children.push({ fiber: child, parentId: id, siblingIndex: index, inheritedHidden: activityState === "retained-hidden" }); child = child.sibling; index += 1; }
      const childIds = children.map((entry) => fiberId(entry.fiber));
      const node = {
        id, parentId: frame.parentId, childIds, segment, tag: fiber.tag, kind, name, type: typeName(fiber.elementType || fiber.type), key,
        ownerId: fiber._debugOwner ? fiberId(fiber._debugOwner) : null,
        sourceStack: stack ? capString(stack) : null, rendered, activityState,
        actualDurationMs: actual, selfTimeMs: Math.max(0, self), subtreeTimeMs: actual,
        treeBaseDurationMs: safeNumber(fiber.treeBaseDuration), reason: reasonOf(fiber, rendered),
        props: preview(fiber.memoizedProps), state: fiber.tag === 1 || fiber.tag === 3 ? preview(fiber.memoizedState) : null,
        context: contextValues(fiber), hooks: hookSlots(fiber), boundary: boundaryOf(fiber),
        debugInfo: preview(fiber._debugInfo),
      };
      fibers.push(node);
      for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) pending.push(children[childIndex]);
    }
    return { rootFiberId: fiberId(rootFiber), fibers, count, truncated };
  };
  const reactMeasure = (entry) => entry.name.includes("⚛") || entry.name.startsWith("\u200b") || Boolean(entry.detail?.devtools);
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (reactMeasure(entry)) pushEvent(state.measures, { name: capString(entry.name), entryType: entry.entryType, startTime: entry.startTime, duration: entry.duration, detail: preview(entry.detail) }, "React User Timing");
    });
    observer.observe({ type: "measure", buffered: true });
  } catch (error) { state.errors.push("PerformanceObserver: " + capString(error)); }
  const rootsByRenderer = new Map();
  const hook = {
    supportsFiber: true, supportsFlight: true, renderers: new Map(), rendererInterfaces: new Map(),
    inject(renderer) {
      const id = state.nextRendererId++; hook.renderers.set(id, renderer);
      const packageName = renderer.rendererPackageName || "unknown";
      const version = renderer.version || renderer.reconcilerVersion || "unknown";
      const bundleType = Number.isFinite(renderer.bundleType) ? renderer.bundleType : null;
      const incompatibilities = [];
      if (packageName !== "react-dom") incompatibilities.push("renderer package " + packageName + " is not react-dom");
      if (!/^19\\.2\\./.test(version)) incompatibilities.push("renderer version " + version + " is outside supported ReactDOM 19.2.x");
      if (bundleType !== 1) incompatibilities.push("bundleType " + String(bundleType) + " is not the development renderer");
      state.renderers.push({ id, packageName, version, bundleType, compatible: incompatibilities.length === 0, incompatibilities, injectedAtEpochMs: Date.now() });
      for (const incompatibility of incompatibilities) recordError("renderer " + id + " incompatible: " + incompatibility);
      rootsByRenderer.set(id, new Set()); return id;
    },
    getFiberRoots(rendererId) { return rootsByRenderer.get(rendererId) || new Set(); },
    onScheduleFiberRoot(rendererId, root) { pushEvent(state.schedules, { rendererId, epochMs: Date.now(), performanceNowMs: performance.now(), rootId: fiberId(root?.current) }, "React schedules"); },
    onCommitFiberRoot(rendererId, root, priority, didError) {
      try {
        if (state.commits.length >= LIMITS.maxCommits) { recordError("React commits exceeded the " + LIMITS.maxCommits + "-commit call cap"); return; }
        const current = root?.current; if (!current) { state.errors.push("commit without root.current"); return; }
        const renderer = state.renderers.find((entry) => entry.id === rendererId);
        if (!renderer || !renderer.compatible) { recordError("commit used an unsupported renderer " + rendererId); return; }
        const shapeErrors = [];
        if (current.tag !== 3) shapeErrors.push("root.current.tag is not HostRoot(3)");
        if (!Number.isFinite(current.actualDuration)) shapeErrors.push("actualDuration is absent");
        if (!Number.isFinite(current.treeBaseDuration)) shapeErrors.push("treeBaseDuration is absent");
        if (current.child !== null && typeof current.child !== "object") shapeErrors.push("child link is malformed");
        shapeErrors.push(...compositeShapeErrors(current));
        if (shapeErrors.length) { recordError("React 19.2 Fiber shape drift: " + shapeErrors.join(", ")); return; }
        const roots = rootsByRenderer.get(rendererId); if (roots) { if (current.memoizedState?.element === null) roots.delete(root); else roots.add(root); }
        const read = readTree(current); if (!read.fibers.length) { state.errors.push("commit tree was empty"); return; }
        const updaters = []; if (root.memoizedUpdaters) for (const updater of root.memoizedUpdaters) updaters.push({ id: fiberId(updater) });
        state.commits.push({ id: state.nextCommitId++, rendererId, epochMs: Date.now(), performanceNowMs: performance.now(), priority: Number.isFinite(priority) ? priority : null, didError: Boolean(didError), rootId: read.rootFiberId, updaters, componentCount: read.count, truncated: read.truncated, rootFiberId: read.rootFiberId, fibers: read.fibers });
      } catch (error) { state.errors.push("onCommitFiberRoot: " + capString(error)); }
    },
    onCommitFiberUnmount(rendererId, fiber) { pushEvent(state.unmounts, { rendererId, epochMs: Date.now(), performanceNowMs: performance.now(), fiberId: fiberId(fiber), name: nameOf(fiber) }, "React unmounts"); },
    onPostCommitFiberRoot(rendererId, root) { pushEvent(state.postCommits, { rendererId, epochMs: Date.now(), performanceNowMs: performance.now(), rootId: fiberId(root?.current) }, "React post-commits"); },
    checkDCE() {}, on() {}, off() {}, emit() {}, sub() { return () => {}; },
  };
  const api = {
    beginWindow(nextId) {
      state.windowId = String(nextId);
      state.commits.length = 0; state.schedules.length = 0; state.unmounts.length = 0; state.postCommits.length = 0; state.measures.length = 0; state.errors.length = 0;
      state.start = { commits: 0, schedules: 0, unmounts: 0, postCommits: 0, measures: 0 };
    },
    snapshotMeta() {
      return { hookInstalled: globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ === hook, installError: null, collectorErrors: [...state.errors], windowId: state.windowId, timeOriginEpochMs: performance.timeOrigin, limits: LIMITS, renderers: [...state.renderers], commitCount: state.commits.length - state.start.commits, schedules: state.schedules.slice(state.start.schedules), unmounts: state.unmounts.slice(state.start.unmounts), postCommits: state.postCommits.slice(state.start.postCommits), measures: state.measures.slice(state.start.measures) };
    },
    snapshotCommit(index, offset) {
      const commit = state.commits[state.start.commits + index];
      if (!commit) return null;
      return { ...commit, fibers: commit.fibers.slice(offset, offset + LIMITS.boundaryChunkRecords) };
    },
  };
  globalThis[GLOBAL_KEY] = api;
  if (originalHook !== undefined && originalHook !== null) {
    api.snapshotMeta = () => ({ hookInstalled: false, installError: "__REACT_DEVTOOLS_GLOBAL_HOOK__ already existed before snap could install its read-only collector", collectorErrors: [...state.errors], windowId: state.windowId, timeOriginEpochMs: performance.timeOrigin, limits: LIMITS, renderers: [], commitCount: 0, schedules: [], unmounts: [], postCommits: [], measures: [] });
    api.snapshotCommit = () => null;
    return;
  }
  Object.defineProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", { value: hook, configurable: true, writable: false });
})()`;
}

export const READ_REACT_PROFILE_SCRIPT = `(() => {
  const collector = globalThis.__ORB_SNAP_REACT_PROFILE__;
  if (!collector || typeof collector.snapshotMeta !== "function") return { hookInstalled: false, installError: "snap's React collector did not execute in this document", collectorErrors: [], windowId: "missing", timeOriginEpochMs: performance.timeOrigin, limits: ${JSON.stringify(REACT_PROFILE_LIMITS)}, renderers: [], commitCount: 0, schedules: [], unmounts: [], postCommits: [], measures: [] };
  return collector.snapshotMeta();
})()`;

export function readReactProfileCommitScript(commitIndex: number, offset: number): string {
  return `globalThis.__ORB_SNAP_REACT_PROFILE__?.snapshotCommit(${String(commitIndex)}, ${String(offset)}) ?? null`;
}
