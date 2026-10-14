import type { TimerScheduler } from "@orb/kit/time";

export interface ScopedTimers extends TimerScheduler, Disposable {}
