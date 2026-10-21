import type {
  EventView,
  NotificationFrame,
  SessionView,
} from "../wire/protocol";
import type { PendingPrompt, Subscription, Timer } from "./support";

/**
 * The demo supervisor's mutable world. Handlers receive this object rather
 * than a class instance, so read/write/simulation modules stay independent.
 */
export type DemoState = {
  readonly now: number;
  readonly startedAt: string;
  readonly sessions: Map<string, SessionView>;
  readonly events: Map<string, EventView[]>;
  readonly queues: Map<string, PendingPrompt[]>;
  readonly active: Map<string, PendingPrompt>;
  readonly timers: Map<string, Set<Timer>>;
  readonly subscriptions: Map<number, Subscription>;
  readonly idempotency: Map<string, string>;
  nextSubscription: number;
  shuttingDown: boolean;
  readonly notify: (frame: NotificationFrame) => void;
};
