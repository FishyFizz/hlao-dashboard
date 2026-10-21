import { X } from "lucide-react";
import { Button, IconButton } from "../../components/Button";
import type { SessionEventsState } from "../../store/store";
import type { SessionView } from "../../wire/protocol";

/** History-boundary banners above the transcript. They never claim completeness. */
export function TranscriptBanners({
  session,
  eventsState,
  evictionDismissed,
  canForkProvider,
  onFork,
  onDismissEviction,
  lastSeen,
  lastReadEvicted,
}: {
  session: SessionView;
  eventsState: SessionEventsState;
  evictionDismissed: boolean;
  canForkProvider: boolean;
  onFork: () => void;
  onDismissEviction: () => void;
  lastSeen: number;
  lastReadEvicted: boolean;
}) {
  return (
    <>
      {eventsState.truncated && !evictionDismissed ? (
        <div className="banner banner--warn transcript-banner">
          <span className="banner__text">
            History begins at seq {eventsState.earliestRetainedSeq}. Earlier events
            were evicted by the supervisor's live buffer; this view does not claim
            completeness.
            {session.agentSessionId
              ? " The provider still holds the transcript: fork it to open the full history, or resume it after a supervisor restart."
              : ""}
          </span>
          {session.agentSessionId && canForkProvider ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={onFork}
              title="Create a new session from a copy of the provider transcript"
            >
              Fork to open history
            </Button>
          ) : null}
          <IconButton
            aria-label="Dismiss history banner"
            title="Dismiss this banner locally; the evicted range is still missing"
            onPress={onDismissEviction}
          >
            <X className="icon" />
          </IconButton>
        </div>
      ) : null}
      {lastReadEvicted ? (
        <div className="banner transcript-banner">
          <span className="banner__text">
            The last read marker (seq {lastSeen}) was evicted. The view clamps to
            seq {eventsState.earliestRetainedSeq}.
          </span>
        </div>
      ) : null}
    </>
  );
}
