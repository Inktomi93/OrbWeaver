export interface ChatComposeInput {
  readonly random: () => number;
  readonly scheduleTimeout: ScheduleOp;
  readonly timers: TimerScheduler | null;
}
