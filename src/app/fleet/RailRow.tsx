import {
  Button as AriaButton,
  MenuTrigger,
  Popover,
  type ButtonProps,
} from "react-aria-components";
import {
  shortStatusLabel,
  statusLampClass,
} from "../../components/Status";
import {
  formatAge,
  formatDateTime,
  lastEventLabel,
  lastEventTime,
  sessionLocalKey,
  unreadFor,
  type AttentionItem,
  type FleetGroup,
} from "../../store/model";
import {
  canUse,
  selectedSession,
  type DashboardState,
} from "../../store/store";
import type { SessionView } from "../../wire/protocol";
import { CAPABILITIES } from "../../wire/protocol";
import {
  SessionActionsMenu,
  type SessionMenuActions,
} from "../SessionActionsMenu";

/** One fleet-rail row. Attention rows show the structural reason on line two. */
export function RailRow({
  state,
  session,
  attentionItem,
  group,
  now,
  menuActions,
  onSelect,
}: {
  state: DashboardState;
  session: SessionView;
  attentionItem: AttentionItem | undefined;
  group: FleetGroup;
  now: number;
  menuActions: SessionMenuActions;
  onSelect: (session: SessionView) => void;
}) {
  const selected = selectedSession(state);
  const key = sessionLocalKey(session);
  const lastSeen = state.local.lastSeen[key] ?? 0;
  const earliest = state.events[session.id]?.earliestRetainedSeq ?? 1;
  const unread = unreadFor(session, lastSeen, earliest);
  const isSelected =
    selected?.id === session.id && selected.createdAt === session.createdAt;
  const last = lastEventLabel(session, canUse(state, CAPABILITIES.lastEvent));
  const reasonAt =
    attentionItem?.kind === "permission"
      ? attentionItem.permission?.requestedAt
      : attentionItem?.sortAt;
  const secondLine =
    group === "needs" && attentionItem
      ? attentionItem.reason
      : last;
  const metaAge = formatAge(
    group === "needs" && reasonAt ? reasonAt : lastEventTime(session),
    now,
  );
  const absolute = formatDateTime(
    group === "needs" && reasonAt ? reasonAt : lastEventTime(session),
  );
  return (
    <MenuTrigger trigger="contextMenu">
      <AriaButton
        className="rail-row"
        data-selected={isSelected ? "true" : undefined}
        data-status={session.status}
        aria-current={isSelected ? "page" : undefined}
        aria-label={`${session.id} ${session.name ?? session.title ?? session.firstPrompt ?? ""} ${shortStatusLabel(session.status)}`}
        {...({ title: `${session.id} · ${absolute}` } as ButtonProps)}
        onPress={() => onSelect(session)}
      >
        <span className="rail-row__top">
          <span className={statusLampClass(session.status)} aria-hidden="true" />
          <span className="rail-row__label">
            {session.name ?? session.title ?? session.firstPrompt ?? `#${session.id}`}
          </span>
          {session.name && session.title ? (
            <span className="rail-row__title">{session.title}</span>
          ) : null}
          {unread.unread ? (
            <span
              className="rail-row__unread"
              title={
                unread.count === null
                  ? "New activity; part of the range was evicted"
                  : `${unread.count} new event${unread.count === 1 ? "" : "s"}`
              }
            >
              {unread.count === null ? "new" : unread.count}
            </span>
          ) : null}
        </span>
        <span className="rail-row__bottom">
          <span className="rail-row__status">{shortStatusLabel(session.status)}</span>
          <span className="rail-row__handle">#{session.id}</span>
          <span className="rail-row__meta">
            {session.turn > 0 ? `T${session.turn}` : "—"}
            {session.queued > 0 ? ` · Q${session.queued}` : ""}
          </span>
          <span className="rail-row__age">{metaAge}</span>
        </span>
        <span className="rail-row__second" title={secondLine}>
          {secondLine}
        </span>
      </AriaButton>
      <Popover className="popover" placement="bottom start">
        <SessionActionsMenu
          state={state}
          session={session}
          {...menuActions}
        />
      </Popover>
    </MenuTrigger>
  );
}
