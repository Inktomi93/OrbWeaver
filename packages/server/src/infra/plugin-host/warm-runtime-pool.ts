// infra/plugin-host/warm-runtime-pool — bounded physical Worker residency beneath logical enabled plugins.

import { DomainConflictError } from "@orb/kit/errors";

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

interface WarmRuntimeAcquireOptions {
  readonly signal?: AbortSignal | undefined;
}

/** Retryable pressure refusal before a request and its arguments enter the app-process wait queue. */
export class PluginHostBusyError extends DomainConflictError {
  constructor(maximum: number) {
    super(`the plugin host already has ${maximum} requests waiting for a runtime — wait for one to finish and try again`);
  }
}

export interface WarmRuntimeLease {
  /** `true` means the caller owns a reserved empty slot and must create the physical runtime. */
  readonly cold: boolean;
  /** Publish a successfully-created cold runtime. Calls for the same logical target wait until this transition. */
  readonly ready: () => void;
  readonly release: () => void;
}

/**
 * A bounded, fair cache of physical runtimes. Logical plugin instances live outside this pool: an idle entry
 * may be retired without invalidating its catalog or any host registrar callback. Requests are admitted FIFO;
 * when the pool is full, the least-recently-used unpinned runtime is retired before the head request proceeds.
 */
export class WarmRuntimePool<T extends object> {
  private readonly entries = new Map<T, PoolEntry>();
  private readonly cancelled = new WeakMap<T, Error>();
  private readonly requests: PoolRequest<T>[] = [];
  private drainChain: Promise<void> = Promise.resolve();
  private retiring = 0;
  private useOrder = 0;
  private readonly maximum: number;
  private readonly retire: (target: T) => Promise<void>;
  private readonly requestMaximum: number;

  constructor(maximum: number, retire: (target: T) => Promise<void>, requestMaximum: number) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error("plugin host: warm runtime maximum must be a positive integer");
    }
    if (!Number.isInteger(requestMaximum) || requestMaximum < 1) {
      throw new Error("plugin host: warm runtime request maximum must be a positive integer");
    }
    this.maximum = maximum;
    this.retire = retire;
    this.requestMaximum = requestMaximum;
  }

  acquire(target: T, options: WarmRuntimeAcquireOptions = {}): Promise<WarmRuntimeLease> {
    const cancelled = this.cancelled.get(target);
    if (cancelled !== undefined) {
      return Promise.reject(cancelled);
    }
    if (options.signal?.aborted === true) {
      return Promise.reject(this.abortError());
    }
    if (this.requests.length >= this.requestMaximum) {
      return Promise.reject(new PluginHostBusyError(this.requestMaximum));
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
    this.drainChain = this.drainChain
      .then(() => this.drain())
      .catch((error: unknown) => {
        // @orb-waive caught-failure-ownership(error): the drain failure is delivered to every queued caller, then the handled chain remains usable for later lifecycle work. Ends if any queued request can remain unresolved after this block.
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
    this.retire(target).then(
      () => this.finishRetirement(),
      (error: unknown) => {
        // @orb-waive caught-failure-ownership(error): a failed terminal retirement permanently cancels this logical target with the same error and releases the capacity reservation. Ends if acquire can proceed for this target or the reservation is not released.
        this.cancelled.set(target, error instanceof Error ? error : new Error("plugin host: failed to retire a removed runtime"));
        this.finishRetirement();
      },
    );
  }

  private finishRetirement(): void {
    this.retiring -= 1;
    this.startDrain();
  }

  private async drain(): Promise<void> {
    while (this.requests.length > 0) {
      const request = this.requests[0];
      if (request === undefined) {
        return;
      }
      if (!(await this.drainHead(request))) {
        return;
      }
    }
  }

  private async drainHead(request: PoolRequest<T>): Promise<boolean> {
    const cancelled = this.cancelled.get(request.target);
    if (cancelled !== undefined) {
      this.requests.shift();
      request.reject(cancelled);
      return true;
    }
    const warm = this.entries.get(request.target);
    if (warm !== undefined) {
      // The first cold lease owns creation/replay. Publishing a warm lease before it calls `ready()` lets a
      // concurrent invoke overtake activation and reach a Worker whose instance does not exist yet.
      if (warm.starting) {
        return false;
      }
      this.requests.shift();
      request.resolve(this.lease(request.target, warm, false));
      return true;
    }
    if (this.entries.size + this.retiring < this.maximum) {
      const entry: PoolEntry = { pins: 0, lastUsed: ++this.useOrder, starting: true };
      this.entries.set(request.target, entry);
      this.requests.shift();
      request.resolve(this.lease(request.target, entry, true));
      return true;
    }
    const candidate = this.lruIdle();
    if (candidate === undefined) {
      return false;
    }
    this.entries.delete(candidate);
    this.retiring += 1;
    try {
      await this.retire(candidate);
      // @orb-waive caught-failure-ownership(error): a failed retirement marks the candidate unusable, rejects the queued wake that required its slot, and rethrows into the drain owner so every remaining waiter is rejected. Ends if any of those three ownership steps is removed.
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("plugin host: failed to retire an idle runtime");
      this.cancelled.set(candidate, failure);
      if (this.requests[0] === request) {
        this.requests.shift();
        request.reject(failure);
      }
      throw failure;
    } finally {
      this.retiring -= 1;
    }
    return true;
  }
}
