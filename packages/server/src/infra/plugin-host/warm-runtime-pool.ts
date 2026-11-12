// infra/plugin-host/warm-runtime-pool — bounded physical Worker residency beneath logical enabled plugins.
//
// NO OWNER HOLDS THE WHOLE POOL (D349). Workers are shared across owners, and a Worker in use can stay held for a span
// bound (D347), so one owner holding every Worker makes another owner's call wait on it. While more than one owner can
// run plugin code here, each may have at most `pluginOwnerShare` of the Workers in use at once; a sole owner may use
// them all. Each owner may always hold at most that share of the request queue, so a second owner's first request
// always finds a place. A request that cannot proceed yet, its owner at its share or its runtime still starting, is
// passed over, never waited on: requests behind it are served in arrival order. An owner's call past its share waits
// for one of that owner's own Workers.

import { DomainConflictError } from "@orb/kit/errors";
import { pluginOwnerShare } from "./budgets.ts";

interface PoolEntry {
  pins: number;
  lastUsed: number;
  starting: boolean;
}

interface PoolRequest<T extends object> {
  readonly target: T;
  readonly resolve: (lease: WarmRuntimeLease) => void;
  readonly reject: (error: Error) => void;
}

/** Who owns a target, and the owners of every enabled resident plugin, running or asleep: with the owners of the
 *  runtimes and requests the pool holds, they are the owners who can run plugin code here. */
interface PoolOwners<T extends object, O> {
  readonly ownerOf: (target: T) => O;
  readonly residentOwners: () => Iterable<O>;
}

interface WarmRuntimeAcquireOptions {
  readonly signal?: AbortSignal | undefined;
}

/** Retryable pressure refusal before a request and its arguments enter the app-process wait queue. */
class PluginHostBusyError extends DomainConflictError {}

// What the drain does with the first request it can move: answer it, or free a Worker for it.
type DrainStep<T extends object> = { readonly kind: "settled" } | { readonly kind: "retire"; readonly candidate: T };

export interface WarmRuntimeLease {
  /** `true` means the caller owns a reserved empty slot and must create the physical runtime. */
  readonly cold: boolean;
  /** Publish a successfully-created cold runtime. Calls for the same logical target wait until this transition. */
  readonly ready: () => void;
  readonly release: () => void;
}

/**
 * A bounded, fair cache of physical runtimes. Logical plugin instances live outside this pool: an idle entry
 * may be retired without invalidating its catalog or any host registrar callback. Requests are served in arrival
 * order, passing over one that cannot proceed yet; when the pool is full, the least-recently-used unpinned runtime
 * is retired before the request that needs its Worker proceeds.
 */
export class WarmRuntimePool<T extends object, O> implements AsyncDisposable {
  private readonly entries = new Map<T, PoolEntry>();
  private readonly cancelled = new WeakMap<T, Error>();
  private readonly requests: PoolRequest<T>[] = [];
  private drainChain: Promise<void> = Promise.resolve();
  private retiring = 0;
  private useOrder = 0;
  private closed = false;
  private readonly pendingRetirements = new Set<Promise<void>>();
  private readonly retirementFailures: Error[] = [];
  private readonly maximum: number;
  private readonly retire: (target: T) => Promise<void>;
  private readonly requestMaximum: number;
  private readonly ownerOf: (target: T) => O;
  private readonly residentOwners: () => Iterable<O>;
  private readonly ownerRequestMaximum: number;

  constructor(maximum: number, retire: (target: T) => Promise<void>, requestMaximum: number, owners: PoolOwners<T, O>) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error("plugin host: warm runtime maximum must be a positive integer");
    }
    if (!Number.isInteger(requestMaximum) || requestMaximum < 1) {
      throw new Error("plugin host: warm runtime request maximum must be a positive integer");
    }
    this.maximum = maximum;
    this.retire = retire;
    this.requestMaximum = requestMaximum;
    this.ownerOf = owners.ownerOf;
    this.residentOwners = owners.residentOwners;
    this.ownerRequestMaximum = pluginOwnerShare(requestMaximum);
  }

  acquire(target: T, options: WarmRuntimeAcquireOptions = {}): Promise<WarmRuntimeLease> {
    if (this.closed) {
      return Promise.reject(new Error("plugin host: runtime pool is closed"));
    }
    const cancelled = this.cancelled.get(target);
    if (cancelled !== undefined) {
      return Promise.reject(cancelled);
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(this.abortError());
    }
    if (this.requests.length >= this.requestMaximum) {
      return Promise.reject(
        new PluginHostBusyError(`the plugin host already has ${this.requestMaximum} requests waiting for a runtime — wait for one to finish and try again`),
      );
    }
    const owner = this.ownerOf(target);
    if (this.requests.filter((request) => this.ownerOf(request.target) === owner).length >= this.ownerRequestMaximum) {
      return Promise.reject(
        new PluginHostBusyError(`you already have ${this.ownerRequestMaximum} plugin requests waiting for a runtime — wait for one to finish and try again`),
      );
    }
    return new Promise((resolve, reject) => {
      let request: PoolRequest<T>;
      const onAbort = (): void => {
        const index = this.requests.indexOf(request);
        if (index < 0) {
          return;
        }
        this.requests.splice(index, 1);
        reject(this.abortError());
        this.startDrain();
      };
      const cleanup = (): void => options.signal?.removeEventListener("abort", onAbort);
      request = {
        target,
        resolve: (lease): void => {
          cleanup();
          resolve(lease);
        },
        reject: (error): void => {
          cleanup();
          reject(error);
        },
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.requests.push(request);
      this.startDrain();
    });
  }

  private abortError(): Error {
    const error = new DomainConflictError("plugin host: runtime request was cancelled");
    error.name = "AbortError";
    return error;
  }

  private startDrain(): void {
    // a drain failure rejects every queued request (request.reject(failure)) and leaves the chain usable for later lifecycle work. Ends if a queued request can stay unresolved after a drain failure.
    this.drainChain = this.drainChain
      .then(() => this.drain())
      .catch((error: unknown) => {
        const failure = error instanceof Error ? error : new Error("plugin host: runtime queue drain failed");
        for (const request of this.requests.splice(0)) {
          request.reject(failure);
        }
      });
  }

  /** A cold start failed before a usable runtime existed. The logical plugin may retry a later wake. */
  discard(target: T): void {
    if (this.entries.delete(target)) {
      this.startDrain();
    }
  }

  /** A crash invalidates the logical plugin until its explicit lifecycle reactivates it. */
  fail(target: T, error: Error): void {
    this.cancelled.set(target, error);
    this.rejectRequests(target, error);
    if (this.entries.delete(target)) {
      this.startDrain();
    }
  }

  /** Disable/uninstall: reject queued wakes and terminate the physical runtime to cancel in-flight work. */
  remove(target: T, error: Error): void {
    this.cancelled.set(target, error);
    this.rejectRequests(target, error);
    if (this.entries.delete(target)) {
      this.retiring += 1;
      this.retireCancelled(target);
    }
  }

  private rejectRequests(target: T, error: Error): void {
    for (let index = this.requests.length - 1; index >= 0; index -= 1) {
      const request = this.requests[index];
      if (request?.target !== target) {
        continue;
      }
      this.requests.splice(index, 1);
      request.reject(error);
    }
  }

  private lease(target: T, entry: PoolEntry, cold: boolean): WarmRuntimeLease {
    entry.pins += 1;
    entry.lastUsed = ++this.useOrder;
    let released = false;
    return {
      cold,
      ready: (): void => {
        if (!cold) {
          return;
        }
        const current = this.entries.get(target);
        if (current !== entry || !current.starting) {
          return;
        }
        current.starting = false;
        current.lastUsed = ++this.useOrder;
        this.startDrain();
      },
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        const current = this.entries.get(target);
        if (current !== entry) {
          return;
        }
        current.pins -= 1;
        current.lastUsed = ++this.useOrder;
        this.startDrain();
      },
    };
  }

  private lruIdle(): T | undefined {
    let selected: T | undefined;
    let order = Number.POSITIVE_INFINITY;
    for (const [target, entry] of this.entries) {
      if (entry.pins === 0 && entry.lastUsed < order && !this.cancelled.has(target)) {
        selected = target;
        order = entry.lastUsed;
      }
    }
    return selected;
  }

  private retireCancelled(target: T): void {
    // a failed terminal retirement records the failure in cancelled, so acquire for that target rejects with it, and in retirementFailures, which asyncDispose throws as an AggregateError. Ends if acquire can proceed for the target or asyncDispose stops reporting the failures.
    const retirement = this.retire(target)
      .then(
        () => this.finishRetirement(),
        (error: unknown) => {
          const failure = error instanceof Error ? error : new Error("plugin host: failed to retire a removed runtime");
          this.cancelled.set(target, failure);
          this.retirementFailures.push(failure);
          this.finishRetirement();
        },
      )
      .finally(() => {
        this.pendingRetirements.delete(retirement);
      });
    this.pendingRetirements.add(retirement);
  }

  private finishRetirement(): void {
    this.retiring -= 1;
    this.startDrain();
  }

  private async drain(): Promise<void> {
    for (;;) {
      const step = this.drainStep();
      if (step === undefined) {
        return;
      }
      if (step.kind === "retire") {
        await this.retireIdle(step.candidate);
      }
    }
  }

  // Workers this owner has in use: a starting runtime is in use by the cold lease that creates it.
  private ownerInUse(owner: O): number {
    let inUse = 0;
    for (const [target, entry] of this.entries) {
      if (entry.pins > 0 && this.ownerOf(target) === owner) {
        inUse += 1;
      }
    }
    return inUse;
  }

  // The Workers one owner may have in use now: all of them while only one owner can run plugin code, its share once a
  // second can. A second owner's first request counts the moment it is queued.
  private ownerWorkerMaximum(): number {
    const owners = new Set(this.residentOwners());
    for (const target of this.entries.keys()) {
      owners.add(this.ownerOf(target));
    }
    for (const request of this.requests) {
      owners.add(this.ownerOf(request.target));
    }
    return owners.size > 1 ? pluginOwnerShare(this.maximum) : this.maximum;
  }

  // Move the first request, in arrival order, that can move now; undefined when none can.
  private drainStep(): DrainStep<T> | undefined {
    const ownerWorkerMaximum = this.ownerWorkerMaximum();
    for (const [index, request] of this.requests.entries()) {
      const cancelled = this.cancelled.get(request.target);
      if (cancelled !== undefined) {
        this.requests.splice(index, 1);
        request.reject(cancelled);
        return { kind: "settled" };
      }
      const warm = this.entries.get(request.target);
      // The first cold lease owns creation/replay. Publishing a warm lease before it calls `ready()` lets a
      // concurrent invoke overtake activation and reach a Worker whose instance does not exist yet.
      if (warm?.starting === true) {
        continue;
      }
      // A warm runtime already in use costs its owner no further Worker; an idle one, or a new one, does.
      const atShare = this.ownerInUse(this.ownerOf(request.target)) >= ownerWorkerMaximum;
      if (warm !== undefined && (warm.pins > 0 || !atShare)) {
        this.requests.splice(index, 1);
        request.resolve(this.lease(request.target, warm, false));
        return { kind: "settled" };
      }
      if (atShare) {
        continue;
      }
      if (this.entries.size + this.retiring < this.maximum) {
        const entry: PoolEntry = { pins: 0, lastUsed: ++this.useOrder, starting: true };
        this.entries.set(request.target, entry);
        this.requests.splice(index, 1);
        request.resolve(this.lease(request.target, entry, true));
        return { kind: "settled" };
      }
      const candidate = this.lruIdle();
      if (candidate !== undefined) {
        return { kind: "retire", candidate };
      }
    }
    return undefined;
  }

  private async retireIdle(candidate: T): Promise<void> {
    this.entries.delete(candidate);
    this.retiring += 1;
    try {
      await this.retire(candidate);
    } catch (error) {
      // The failure is the CANDIDATE's: its runtime could not be retired. It is recorded the way a removed
      // runtime's is (its own next acquire rejects with it, and close reports it), and the drain goes on: the
      // retirement released the slot either way (the runtime binding is forgotten), so the request that needed it
      // and every request queued — other plugins' calls, other owners' — still get served.
      // biome-ignore lint/nursery/useDisposables: this catch records a rejection without acquiring its ownership; local using would dispose another operation's fault.
      const failure = error instanceof Error ? error : new Error("plugin host: failed to retire an idle runtime");
      this.cancelled.set(candidate, failure);
      this.retirementFailures.push(failure);
    } finally {
      this.retiring -= 1;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.closed = true;
    const failure = new Error("plugin host: runtime pool is closing");
    for (const request of this.requests.splice(0)) {
      request.reject(failure);
    }
    for (const target of this.entries.keys()) {
      this.remove(target, failure);
    }
    await this.drainChain;
    while (this.pendingRetirements.size > 0) {
      await Promise.all([...this.pendingRetirements]);
    }
    if (this.retirementFailures.length > 0) {
      throw new AggregateError(this.retirementFailures, "plugin host: physical runtime retirement failed");
    }
  }
}
