import type { EventView, ReadResult, SessionView, WireError } from "../wire/protocol";
import { asWireError } from "../wire/protocol";
import {
  eventText,
  isTerminalStatus,
  mergeEvents,
  resolveTarget as resolveSessionTarget,
  type TargetResolution,
} from "./model";
import { selectedSession } from "./selectors";
import type { ExportResult, SearchOptions, SearchOutcome } from "./types";
import type { StoreActionsHost } from "./actionsHost";

/**
 * Instance and session search plus transcript export. Both are client
 * assemblies over `sessions.read { grep }`; there is no index and no cache.
 */
export class SearchActions {
  private searchToken = 0;

  constructor(private readonly host: StoreActionsHost) {}

  async search(options: SearchOptions): Promise<SearchOutcome> {
    const transport = this.host.getTransport();
    const state = this.host.getState();
    const asOf = new Date().toISOString();
    const token = ++this.searchToken;
    const outcome: SearchOutcome = {
      hits: [],
      scannedSessions: 0,
      totalSessions: 0,
      capped: false,
      truncated: false,
      asOf,
      cancelled: false,
      errors: [],
    };
    if (!transport || !options.query.trim()) return outcome;

    let sessions: SessionView[];
    if (options.scope === "session") {
      const session = selectedSession(state);
      sessions = session ? [session] : [];
    } else {
      try {
        const list = await transport.request<{ sessions: SessionView[] }>(
          "sessions.list",
          { includeClosed: options.includeClosed },
        );
        sessions = list.sessions;
      } catch (error) {
        outcome.errors.push(asWireError(error).message);
        sessions = Object.values(this.host.getState().sessions).filter(
          (session) => options.includeClosed || !isTerminalStatus(session.status),
        );
      }
    }

    const maxSessions = 20;
    outcome.totalSessions = sessions.length;
    if (sessions.length > maxSessions) outcome.capped = true;
    const limit = options.scope === "session" ? 200 : 50;

    for (const session of sessions.slice(0, maxSessions)) {
      if (token !== this.searchToken) {
        outcome.cancelled = true;
        return outcome;
      }
      try {
        const result = await transport.request<ReadResult>("sessions.read", {
          sessionId: session.id,
          since: 0,
          limit,
          grep: options.query,
          ...(options.raw ? { raw: true } : {}),
          ...(options.regex ? { regex: true } : {}),
        });
        outcome.scannedSessions += 1;
        if (result.truncated) outcome.truncated = true;
        if (result.hasMore) outcome.capped = true;
        for (const event of result.events) {
          const readable = eventText(event)
            .replace(/[\u0000-\u001F\u007F]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const fallback = JSON.stringify(event.data).replace(/\s+/g, " ");
          outcome.hits.push({
            session: result.session,
            event,
            snippet: (readable || `${event.type} · ${fallback}`).slice(0, 220),
          });
        }
      } catch (error) {
        outcome.errors.push(`${session.id}: ${asWireError(error).message}`);
      }
    }
    if (token !== this.searchToken) outcome.cancelled = true;
    return outcome;
  }

  cancelSearch(): void {
    this.searchToken += 1;
  }

  async collectTranscript(
    sessionId: string,
    maxPages = 20,
    pageSize = 1000,
  ): Promise<ExportResult> {
    const transport = this.host.getTransport();
    if (!transport) {
      throw { code: "bridge_unavailable", message: "Not connected." } satisfies WireError;
    }
    let events: EventView[] = [];
    let truncated = false;
    let capped = false;
    let pages = 0;
    let since = 0;
    while (pages < maxPages) {
      const result = await transport.request<ReadResult>("sessions.read", {
        sessionId,
        since,
        limit: pageSize,
        raw: true,
      });
      pages += 1;
      truncated = truncated || result.truncated;
      events = mergeEvents(events, result.events, 100_000).events;
      if (!result.hasMore || result.nextSeq <= since) break;
      since = result.nextSeq;
      if (pages >= maxPages) capped = true;
    }
    return { events, truncated, capped, pages };
  }

  resolveTarget(token: string): TargetResolution {
    return resolveSessionTarget(token, Object.values(this.host.getState().sessions));
  }
}
