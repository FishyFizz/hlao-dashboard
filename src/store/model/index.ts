/**
 * Pure rules for the dashboard's projections.
 *
 * This barrel is the stable import surface for UI modules. Each submodule has
 * one concern and can be imported directly when a narrower dependency reads
 * better; none of them touch the store, the transport, or the DOM.
 */
export {
  normalizeHome,
  sessionLocalKey,
  displayLabel,
  isTerminalStatus,
  descendantsOf,
  rootOf,
  parentOf,
  childrenOf,
} from "./identity";

export {
  attentionFor,
  attentionKey,
  failureReason,
  latestNotice,
  nextAttentionSession,
  noticeFromEvent,
  type AttentionItem,
  type AttentionKind,
  type LocalReadingState,
  type NoticeRecord,
} from "./attention";

export {
  countNewAgentMessages,
  filterFleet,
  fleetCounts,
  fleetGroupFor,
  groupFleet,
  matchesQuery,
  orderedFleet,
  resolveTarget,
  sortSessions,
  unreadFor,
  type FleetCounts,
  type FleetGroup,
  type FleetGroups,
  type FleetSort,
  type TargetResolution,
} from "./fleet";

export {
  appendEvents,
  eventActor,
  eventText,
  eventTitle,
  lastEventLabel,
  lastEventTime,
  mergeEvents,
  numberField,
  payloadField,
  stringField,
  toolPayloadFromEvents,
  type ToolPayload,
} from "./events";

export {
  buildRenderItems,
  buildTranscriptRows,
  isSystemItem,
  lastThoughtLine,
  mcpToolLabel,
  renderItemAt,
  renderItemSeq,
  renderItemTurn,
  type ActivityGroupRow,
  type ActivityLine,
  type RenderItem,
  type TranscriptRow,
} from "./transcript";

export {
  contextPercent,
  formatAge,
  formatClock,
  formatCost,
  formatDateTime,
  formatElapsed,
  formatTokens,
  planKindLabel,
} from "./format";
