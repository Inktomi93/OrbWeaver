export interface ChatComposeInput {
  readonly random?: (() => number) | undefined;
  readonly scheduleTimeout?: ScheduleOp | undefined;
  readonly timers?: TimerScheduler | null | undefined;
}
