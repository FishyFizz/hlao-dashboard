import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Tag } from "../components/Status";
import {
  attentionItems,
  selectedSession,
  store,
  type DashboardState,
} from "../store/store";
import { displayLabel, nextAttentionSession } from "../store/model";
import type {
  QueueItemView,
  RecoveryReceiptView,
  SessionView,
} from "../wire/protocol";
import { asWireError, WIRE_MAJOR, WIRE_MINOR } from "../wire/protocol";
import { newId } from "../lib/id";
import {
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
import { ResumeDialog, type ResumePrefill } from "./ResumeDialog";
import { SearchDialog } from "./SearchDialog";
import { SessionLens } from "./SessionLens";
import { SetupScreen } from "./SetupScreen";
import { SpawnDraft } from "./SpawnDraft";
import { StatusBar } from "./StatusBar";
import { ToastRegion } from "./ToastRegion";
import { TopBar } from "./TopBar";
import { isMod, isTypingTarget, useDashboard } from "./hooks";
import { Inspector } from "./Inspector";
import { exportTranscript } from "./export";
import { parseSessionHash, replaceLocation, sessionHash } from "./routing";
import { useAttentionAnnouncement, useAttentionNotifications } from "./attention";

type ActionDialog =
  | { kind: "rename" }
  | { kind: "stop" }
  | { kind: "close" }
  | { kind: "close-subtree" }
  | { kind: "forget" }
  | { kind: "shutdown" }
  | { kind: "clear" };

export function Dashboard() {
  const state = useDashboard();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [spawnDraftOpen, setSpawnDraftOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumePrefill, setResumePrefill] = useState<ResumePrefill | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [action, setAction] = useState<ActionDialog | null>(null);
  const [dropItem, setDropItem] = useState<QueueItemView | null>(null);
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
    applySessionHash();
  }, [state.phase, state.fleetLoaded]);

  useEffect(() => {
    if (!state.mode) return;
    const params = new URLSearchParams(window.location.search);
    if (state.mode === "demo") params.set("demo", "1");
    else params.delete("demo");
    const search = params.toString();
    replaceLocation(search ? `?${search}` : "", window.location.hash);
  }, [state.mode]);

  useEffect(() => {
    if (state.phase !== "live" || !state.fleetLoaded) return;
    replaceLocation(window.location.search, sessionHash(state.selection));
  }, [state.phase, state.fleetLoaded, state.selection]);

  useEffect(() => {
    window.addEventListener("hashchange", applySessionHash);
    return () => window.removeEventListener("hashchange", applySessionHash);
  }, []);

  useEffect(() => {
    if (selected || !state.selection) return;
    if (["rename", "stop", "close", "close-subtree", "forget"].includes(action?.kind ?? "")) {
      setAction(null);
    }
  }, [selected, state.selection, action?.kind]);

  useEffect(() => {
    if (!selected) setDetailsOpen(false);
  }, [selected]);

  useEffect(() => {
    setRailOpen(false);
  }, [state.selection?.id]);

  // Selecting a session (from the palette, the rail, or a successful spawn)
  // ends the temporary new-session view. Opening the draft itself does not
  // change the selection, so this never closes it by accident.
  useEffect(() => {
    if (state.selection) setSpawnDraftOpen(false);
  }, [state.selection?.id, state.selection?.createdAt]);

  const announcement = useAttentionAnnouncement(attention);
  useAttentionNotifications(state, attention);

  const openSpawnDraft = () => {
    setResumeOpen(false);
    setSpawnDraftOpen(true);
  };
  const openResume = () => {
    setSpawnDraftOpen(false);
    setResumePrefill(null);
    setResumeOpen(true);
  };

  const prefillFromReceipt = (receipt: RecoveryReceiptView): ResumePrefill => ({
    backend: receipt.backend,
    providerId: receipt.childProviderId,
    cwd: receipt.cwd,
    ...(receipt.name ? { name: receipt.name } : {}),
    parentSessionId: receipt.parentHlaoSessionId,
  });

  const openRecovery = (receipt: RecoveryReceiptView) => {
    setSpawnDraftOpen(false);
    setResumePrefill(prefillFromReceipt(receipt));
    setResumeOpen(true);
  };

  const quickResume = (receipt: RecoveryReceiptView) => {
    if (state.pending.spawn) return;
    const prefill = prefillFromReceipt(receipt);
    setResumePrefill(prefill);
    void store
      .spawnSession({
        backend: receipt.backend,
        cwd: receipt.cwd,
        ...(receipt.name ? { name: receipt.name } : {}),
        ...(receipt.parentHlaoSessionId
          ? { parentSessionId: receipt.parentHlaoSessionId }
          : {}),
        resumeSessionId: receipt.childProviderId,
        idempotencyKey: newId("spawn"),
      })
      .then(() => setResumePrefill(null))
      .catch((cause: unknown) => {
        const wire = asWireError(cause);
        store.addToast({
          tone: "danger",
          title: "Quick resume failed",
          text: `${wire.message} The dialog is prefilled so you can adjust it or fork.`,
        });
        setSpawnDraftOpen(false);
        setResumePrefill(prefill);
        setResumeOpen(true);
      });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const inTransientWidget =
        event.target instanceof Element &&
        event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null;
      const overlayOpen =
        paletteOpen ||
        resumeOpen ||
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
          openSpawnDraft();
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
        if (spawnDraftOpen) {
          event.preventDefault();
          setSpawnDraftOpen(false);
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
    resumeOpen,
    spawnDraftOpen,
    searchOpen,
    helpOpen,
    detailsOpen,
    introOpen,
    action,
    railOpen,
    attention.map((item) => item.session.id).join("|"),
  ]);

  const stepAttention = (direction: 1 | -1) => {
    const snapshot = store.getSnapshot();
    const next = nextAttentionSession(
      attentionItems(snapshot),
      snapshot.selection?.id ?? null,
      direction,
    );
    if (!next) {
      store.addToast({ tone: "info", title: "Nothing needs you" });
      return;
    }
    store.selectSession(next.id);
  };

  const openSession = (sessionId: string) => {
    store.selectSession(sessionId);
    setPaletteOpen(false);
    setRailOpen(false);
    setSpawnDraftOpen(false);
    setResumeOpen(false);
  };

  const focusFleet = () => {
    setSpawnDraftOpen(false);
    setResumeOpen(false);
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
  const queue = state.queue;

  return (
    <div className="dash">
      <TopBar
        state={state}
        onPalette={() => setPaletteOpen(true)}
        onSpawn={openSpawnDraft}
        onResume={openResume}
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
          onSpawn={openSpawnDraft}
          onRecover={openRecovery}
          onQuickResume={quickResume}
        />
        {spawnDraftOpen ? (
          <SpawnDraft
            state={state}
            onClose={() => setSpawnDraftOpen(false)}
            onResume={openResume}
          />
        ) : (
          <>
            <main className="dash-main">
              {displayed ? (
                <SessionLens
                  state={state}
                  session={displayed}
                  onBack={() => store.backToFleet()}
                  onSpawn={openSpawnDraft}
                  onSearch={() => setSearchOpen(true)}
                  onOpenSession={openSession}
                  onRename={() => setAction({ kind: "rename" })}
                  onStop={() => setAction({ kind: "stop" })}
                  onClose={() => setAction({ kind: "close" })}
                  onCloseSubtree={() => setAction({ kind: "close-subtree" })}
                  onForget={() => setAction({ kind: "forget" })}
                  onDrop={(item) => {
                    setDropItem(item);
                    setAction({ kind: "stop" });
                  }}
                  onDetails={() => setDetailsOpen(true)}
                  onSpawnReplacement={openSpawnDraft}
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
                  onSpawn={openSpawnDraft}
                  onResume={openResume}
                  onSearch={() => setSearchOpen(true)}
                />
              )}
            </main>
            {displayed ? (
              <aside className="dash-inspector" aria-label="Session inspector">
                <Inspector
                  state={state}
                  session={displayed}
                  onOpenSession={openSession}
                />
              </aside>
            ) : null}
          </>
        )}
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
        onSpawn={openSpawnDraft}
        onResume={openResume}
        onSearch={() => setSearchOpen(true)}
        onHelp={() => setHelpOpen(true)}
        onDetails={() => setDetailsOpen(true)}
        onRename={() => setAction({ kind: "rename" })}
        onStop={() => setAction({ kind: "stop" })}
        onCloseSession={() => setAction({ kind: "close" })}
      />
      <ResumeDialog
        open={resumeOpen}
        state={state}
        initial={resumePrefill ?? undefined}
        onClose={() => {
          setResumeOpen(false);
          setResumePrefill(null);
        }}
      />
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
        </>
      ) : null}

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
    </div>
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
      <Tag>wire {WIRE_MAJOR}.{WIRE_MINOR}</Tag>
    </div>
  );
}

function applySessionHash(): void {
  const snapshot = store.getSnapshot();
  const target = parseSessionHash(window.location.hash);
  if (!target) {
    if (window.location.hash === "#/fleet" && snapshot.selection) store.backToFleet();
    return;
  }
  const session = snapshot.sessions[target.id];
  if (!session) return;
  if (!target.createdAt || session.createdAt === target.createdAt) {
    store.selectSession(session.id);
    return;
  }
  store.addToast({
    tone: "info",
    title: "That handle now belongs to a different session",
    text: "The dashboard did not retarget the link. The fleet is shown instead.",
  });
  store.backToFleet();
}
