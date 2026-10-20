import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Tag } from "../components/Status";
import {
  attentionItems,
  selectedSession,
  store,
  type DashboardState,
} from "../store/store";
import { displayLabel } from "../store/model";
import type { QueueItemView, SessionView } from "../wire/protocol";
import {
  AlwaysDialog,
  ClearLocalDialog,
  CloseDialog,
  CloseSubtreeDialog,
  DropDialog,
  ForgetDialog,
  ShutdownDialog,
  StopDialog,
} from "./ActionDialogs";
import { Banners } from "./Banners";
import { CommandPalette } from "./CommandPalette";
import { DetailsDialog } from "./DetailsDialog";
import { FleetHome } from "./FleetHome";
import { FleetRail } from "./FleetRail";
import { HelpDialog } from "./HelpDialog";
import { IntroDialog } from "./IntroDialog";
import { RenameDialog } from "./RenameDialog";
import { SearchDialog } from "./SearchDialog";
import { SessionLens } from "./SessionLens";
import { SetupScreen } from "./SetupScreen";
import { SpawnDialog } from "./SpawnDialog";
import { StatusBar } from "./StatusBar";
import { ToastRegion } from "./ToastRegion";
import { TopBar } from "./TopBar";
import { isMod, isTypingTarget, useDashboard } from "./hooks";
import { Inspector } from "./Inspector";
import { exportTranscript } from "./export";

type ActionDialog =
  | { kind: "rename" }
  | { kind: "stop" }
  | { kind: "close" }
  | { kind: "close-subtree" }
  | { kind: "forget" }
  | { kind: "always" }
  | { kind: "shutdown" }
  | { kind: "clear" };

export function Dashboard() {
  const state = useDashboard();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [action, setAction] = useState<ActionDialog | null>(null);
  const [dropItem, setDropItem] = useState<QueueItemView | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const announcedKeys = useRef<Set<string> | null>(null);
  const appliedHash = useRef(false);
  const attention = attentionItems(state);
  const selected = selectedSession(state);
  const removedSnapshot = state.removed ? state.removedSession : null;
  const displayed = selected ?? removedSnapshot;

  useEffect(() => {
    void store.boot();
    const flush = () => store.flushPersistence();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    document.title = selected
      ? `${displayLabel(selected)} · HLAO`
      : state.phase === "live"
        ? "Fleet · HLAO"
        : "HLAO dashboard";
  }, [selected, state.phase]);

  useEffect(() => {
    if (state.phase === "live" && !state.introSeen) setIntroOpen(true);
  }, [state.phase, state.introSeen]);

  useEffect(() => {
    appliedHash.current = false;
  }, [state.home, state.mode]);

  useEffect(() => {
    if (state.phase !== "live" || appliedHash.current || !state.fleetLoaded) {
      return;
    }
    appliedHash.current = true;
    const hash = window.location.hash;
    const target = parseSessionHash(hash);
    if (target) {
      const session = state.sessions[target.id];
      if (session && (!target.createdAt || session.createdAt === target.createdAt)) {
        store.selectSession(session.id);
      } else if (session && target.createdAt && session.createdAt !== target.createdAt) {
        store.addToast({
          tone: "info",
          title: "That handle now belongs to a different session",
          text: "The dashboard did not retarget the link. The fleet is shown instead.",
        });
        store.backToFleet();
      }
      return;
    }
    if (hash === "#/fleet" && state.selection) store.backToFleet();
  }, [state.phase, state.fleetLoaded, state.sessions, state.selection]);

  useEffect(() => {
    if (!state.mode) return;
    const url = new URL(window.location.href);
    if (state.mode === "demo") url.searchParams.set("demo", "1");
    else url.searchParams.delete("demo");
    const next = `${url.pathname}${url.search}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [state.mode]);

  useEffect(() => {
    if (state.phase !== "live" || !state.fleetLoaded) return;
    const hash = state.selection
      ? `#/s/${state.selection.id}?created=${encodeURIComponent(state.selection.createdAt)}`
      : "#/fleet";
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [state.phase, state.fleetLoaded, state.selection]);

  useEffect(() => {
    const onHashChange = () => {
      const snapshot = store.getSnapshot();
      const target = parseSessionHash(window.location.hash);
      if (target) {
        const session = snapshot.sessions[target.id];
        if (session && (!target.createdAt || session.createdAt === target.createdAt)) {
          store.selectSession(session.id);
        } else if (session && target.createdAt) {
          store.addToast({
            tone: "info",
            title: "That handle now belongs to a different session",
            text: "The dashboard did not retarget the link.",
          });
          store.backToFleet();
        }
        return;
      }
      if (window.location.hash === "#/fleet" && snapshot.selection) {
        store.backToFleet();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (selected || !state.selection) return;
    if (["rename", "stop", "close", "close-subtree", "forget", "always"].includes(action?.kind ?? "")) {
      setAction(null);
    }
  }, [selected, state.selection, action?.kind]);

  useEffect(() => {
    if (!selected) setDetailsOpen(false);
  }, [selected]);

  useEffect(() => {
    setRailOpen(false);
  }, [state.selection?.id]);

  useAttentionNotifications(state, attention);

  useEffect(() => {
    const keys = new Set(attention.map((item) => attentionKey(item)));
    if (announcedKeys.current === null) {
      announcedKeys.current = keys;
      return;
    }
    const fresh = attention.filter(
      (item) => !announcedKeys.current?.has(attentionKey(item)),
    );
    announcedKeys.current = keys;
    if (fresh.length === 0) return;
    const first = fresh[0]!;
    const kind =
      first.kind === "permission"
        ? "Permission requested"
        : first.kind === "failure"
          ? "Session failed"
          : "Error notice";
    setAnnouncement(
      `${kind} for ${displayLabel(first.session)}, handle ${first.session.id}. ${first.reason}`,
    );
  }, [attention]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const inTransientWidget =
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null;
      const overlayOpen =
        paletteOpen ||
        spawnOpen ||
        searchOpen ||
        helpOpen ||
        detailsOpen ||
        introOpen ||
        action !== null;

      if (isMod(event)) {
        const key = event.key.toLowerCase();
        if (key === "k") {
          event.preventDefault();
          setPaletteOpen((value) => !value);
          return;
        }
        if (key === "n") {
          event.preventDefault();
          setSpawnOpen(true);
          return;
        }
        if (key === "f" && event.shiftKey) {
          event.preventDefault();
          setSearchOpen(true);
          return;
        }
      }

      if (overlayOpen || inTransientWidget) return;

      if (event.key === "Escape" && railOpen) {
        event.preventDefault();
        setRailOpen(false);
        return;
      }

      if (event.key === "?" && !typing) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (event.key === "Escape") {
        if (typing) {
          (event.target as HTMLElement).blur();
          return;
        }
        if (store.getSnapshot().selection) {
          event.preventDefault();
          store.backToFleet();
        }
        return;
      }

      if (typing) return;

      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        stepAttention(1);
      } else if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        stepAttention(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paletteOpen,
    spawnOpen,
    searchOpen,
    helpOpen,
    detailsOpen,
    introOpen,
    action,
    railOpen,
    attention.map((item) => item.session.id).join("|"),
  ]);

  const stepAttention = (direction: 1 | -1) => {
    const items = attentionItems(store.getSnapshot());
    if (items.length === 0) {
      store.addToast({ tone: "info", title: "Nothing needs you" });
      return;
    }
    const current = items.findIndex(
      (item) => item.session.id === store.getSnapshot().selection?.id,
    );
    const next =
      current === -1
        ? items[0]!
        : items[(current + direction + items.length) % items.length]!;
    store.selectSession(next.session.id);
  };

  const openSession = (sessionId: string) => {
    store.selectSession(sessionId);
    setPaletteOpen(false);
    setRailOpen(false);
  };

  const focusFleet = () => {
    if (store.getSnapshot().selection) {
      store.backToFleet();
    } else {
      document.querySelector(".fleet-home")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (state.phase === "boot" || state.phase === "connecting") {
    return <BootScreen state={state} />;
  }

  if (state.phase === "setup" || !state.instance) {
    return (
      <SetupScreen
        state={state}
        onRetry={() => void store.retry()}
        onDemo={() => void store.connectDemo()}
        onTheme={() =>
          store.setTheme(state.theme === "dark" ? "light" : "dark")
        }
      />
    );
  }

  const sessionForDialogs: SessionView | null = selected;
  const permission = selected?.pendingPermission ?? null;
  const queue = state.queue;

  return (
    <div className="dash">
      <TopBar
        state={state}
        onPalette={() => setPaletteOpen(true)}
        onSpawn={() => setSpawnOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onFleet={focusFleet}
        onToggleRail={() => setRailOpen((value) => !value)}
        onTheme={() => store.setTheme(state.theme === "dark" ? "light" : "dark")}
      />
      <Banners
        state={state}
        onRetry={() => void store.retry()}
        onExitDemo={() => void store.connect("bridge")}
      />
      <div className="dash-body" data-rail-open={railOpen ? "true" : undefined}>
        <FleetRail
          state={state}
          onSelect={(session) => openSession(session.id)}
          onSpawn={() => setSpawnOpen(true)}
        />
        <main className="dash-main">
          {displayed ? (
            <SessionLens
              state={state}
              session={displayed}
              onBack={() => store.backToFleet()}
              onSpawn={() => setSpawnOpen(true)}
              onSearch={() => setSearchOpen(true)}
              onOpenSession={openSession}
              onRename={() => setAction({ kind: "rename" })}
              onStop={() => setAction({ kind: "stop" })}
              onClose={() => setAction({ kind: "close" })}
              onCloseSubtree={() => setAction({ kind: "close-subtree" })}
              onForget={() => setAction({ kind: "forget" })}
              onAlways={() => setAction({ kind: "always" })}
              onDrop={(item) => {
                setDropItem(item);
                setAction({ kind: "stop" });
              }}
              onDetails={() => setDetailsOpen(true)}
              onSpawnReplacement={() => setSpawnOpen(true)}
            />
          ) : state.selection ? (
            <div className="fleet-home">
              <div className="fleet-empty">
                <span className="fleet-empty__title">
                  Session #{state.selection.id} is no longer in this instance.
                </span>
                <p className="fleet-empty__text">
                  No local snapshot was retained for it. The fleet is unchanged.
                </p>
                <Button onPress={() => store.backToFleet()}>Return to fleet</Button>
              </div>
            </div>
          ) : (
            <FleetHome
              state={state}
              onSelect={openSession}
              onSpawn={() => setSpawnOpen(true)}
              onSearch={() => setSearchOpen(true)}
            />
          )}
        </main>
        {displayed ? (
          <aside className="dash-inspector" aria-label="Session inspector">
            <SessionInspector state={state} session={displayed} onOpenSession={openSession} />
          </aside>
        ) : null}
      </div>
      <StatusBar state={state} />
      <ToastRegion state={state} />
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      <CommandPalette
        open={paletteOpen}
        state={state}
        onClose={() => setPaletteOpen(false)}
        onSpawn={() => setSpawnOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onDetails={() => setDetailsOpen(true)}
        onRename={() => setAction({ kind: "rename" })}
        onStop={() => setAction({ kind: "stop" })}
        onCloseSession={() => setAction({ kind: "close" })}
      />
      <SpawnDialog open={spawnOpen} state={state} onClose={() => setSpawnOpen(false)} />
      <SearchDialog open={searchOpen} state={state} onClose={() => setSearchOpen(false)} />
      <HelpDialog
        open={helpOpen}
        state={state}
        onClose={() => setHelpOpen(false)}
        onClearLocal={() => {
          setHelpOpen(false);
          setAction({ kind: "clear" });
        }}
        onShutdown={() => {
          setHelpOpen(false);
          setAction({ kind: "shutdown" });
        }}
      />
      {displayed ? (
        <DetailsDialog
          open={detailsOpen}
          state={state}
          session={displayed}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
      <IntroDialog
        open={introOpen}
        onClose={() => {
          store.markIntroSeen();
          setIntroOpen(false);
        }}
      />

      {sessionForDialogs ? (
        <>
          <RenameDialog
            open={action?.kind === "rename"}
            state={state}
            session={sessionForDialogs}
            onClose={() => setAction(null)}
          />
          <StopDialog
            open={action?.kind === "stop" && dropItem === null}
            session={sessionForDialogs}
            queue={queue}
            onClose={() => setAction(null)}
            onConfirm={(keepQueue) => {
              setAction(null);
              void store.cancel(keepQueue);
            }}
          />
          <CloseDialog
            open={action?.kind === "close"}
            session={sessionForDialogs}
            onClose={() => setAction(null)}
            onConfirm={(force) => {
              setAction(null);
              void store.close(force);
            }}
          />
          <CloseSubtreeDialog
            open={action?.kind === "close-subtree"}
            state={state}
            session={sessionForDialogs}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              void store.closeSubtree();
            }}
          />
          <ForgetDialog
            open={action?.kind === "forget"}
            session={sessionForDialogs}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              void store.forget();
            }}
            onExport={() => {
              void exportTranscript(sessionForDialogs);
            }}
          />
          {permission ? (
            <AlwaysDialog
              open={action?.kind === "always"}
              permission={permission}
              onClose={() => setAction(null)}
              onConfirm={() => {
                setAction(null);
                const allowAlways = permission.options.find(
                  (option) => option.kind === "allow_always",
                );
                void store.permit(allowAlways?.optionId, true);
              }}
            />
          ) : null}
          <DropDialog
            open={action?.kind === "stop" && dropItem !== null}
            session={sessionForDialogs}
            item={dropItem}
            onClose={() => {
              setDropItem(null);
              setAction(null);
            }}
            onConfirm={() => {
              const target = dropItem;
              setDropItem(null);
              setAction(null);
              if (target) void store.dropQueued(target.id);
            }}
          />
          <ShutdownDialog
            open={action?.kind === "shutdown"}
            state={state}
            onClose={() => setAction(null)}
            onConfirm={(force) => {
              setAction(null);
              void store.shutdownSupervisor(force);
            }}
          />
          <ClearLocalDialog
            open={action?.kind === "clear"}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              store.clearLocalState();
            }}
          />
        </>
      ) : (
        <>
          <ShutdownDialog
            open={action?.kind === "shutdown"}
            state={state}
            onClose={() => setAction(null)}
            onConfirm={(force) => {
              setAction(null);
              void store.shutdownSupervisor(force);
            }}
          />
          <ClearLocalDialog
            open={action?.kind === "clear"}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              store.clearLocalState();
            }}
          />
        </>
      )}
    </div>
  );
}

function SessionInspector({
  state,
  session,
  onOpenSession,
}: {
  state: DashboardState;
  session: SessionView;
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <Inspector
      state={state}
      session={session}
      onOpenSession={onOpenSession}
    />
  );
}

function BootScreen({ state }: { state: DashboardState }) {
  return (
    <div className="boot">
      <div className="boot__mark" aria-hidden="true">
        <span />
      </div>
      <div className="boot__title">HLAO dashboard</div>
      <div className="boot__text">
        {state.mode === "demo" ? "Opening the demo instance…" : "Connecting to the local bridge…"}
      </div>
      <Tag>wire 2.5</Tag>
    </div>
  );
}

function useAttentionNotifications(
  state: DashboardState,
  attention: ReturnType<typeof attentionItems>,
): void {
  const previousKeys = useRef<Set<string> | null>(null);
  const liveNotifications = useRef<Map<string, Notification>>(new Map());

  useEffect(() => {
    const keys = new Set(attention.map((item) => attentionKey(item)));
    if (previousKeys.current === null) {
      previousKeys.current = keys;
      return;
    }
    const previous = previousKeys.current;
    for (const [key, notification] of liveNotifications.current) {
      if (!state.notifications || !keys.has(key)) {
        notification.close();
        liveNotifications.current.delete(key);
      }
    }
    previousKeys.current = keys;

    if (
      !state.notifications ||
      !document.hidden ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    for (const item of attention) {
      const key = attentionKey(item);
      if (previous.has(key) || liveNotifications.current.has(key)) continue;
      const title =
        item.kind === "permission"
          ? "Permission requested"
          : item.kind === "failure"
            ? "Session failed"
            : "Error notice";
      try {
        const notification = new Notification(`${title} · #${item.session.id}`, {
          body: `${displayLabel(item.session)} · ${item.reason}`,
          tag: key,
          silent: false,
        });
        notification.onclick = () => {
          window.focus();
          store.selectSession(item.session.id);
          notification.close();
          liveNotifications.current.delete(key);
        };
        liveNotifications.current.set(key, notification);
      } catch {
        // The OS may refuse a notification even after permission was granted.
      }
    }
  }, [attention, state.notifications]);

  useEffect(
    () => () => {
      for (const notification of liveNotifications.current.values()) {
        notification.close();
      }
      liveNotifications.current.clear();
    },
    [],
  );
}

function parseSessionHash(
  hash: string,
): { id: string; createdAt: string | null } | null {
  const match = /^#\/s\/([a-z0-9]+)(?:\?created=([^&]+))?$/i.exec(hash);
  if (!match) return null;
  try {
    return {
      id: match[1]!,
      createdAt: match[2] ? decodeURIComponent(match[2]) : null,
    };
  } catch {
    return { id: match[1]!, createdAt: null };
  }
}

function attentionKey(item: ReturnType<typeof attentionItems>[number]): string {
  if (item.kind === "permission") {
    return `${item.session.id}:permission:${item.permission?.requestId ?? ""}`;
  }
  if (item.kind === "failure") {
    return `${item.session.id}:failure:${item.session.endedAt ?? ""}`;
  }
  return `${item.session.id}:notice:${item.noticeSeq ?? ""}`;
}
