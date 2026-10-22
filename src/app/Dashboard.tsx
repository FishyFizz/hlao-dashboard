import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import {
  attentionItems,
  selectedSession,
  store,
} from "../store/store";
import { displayLabel } from "../store/model";
import type {
  QueueItemView,
  RecoveryReceiptView,
  SessionView,
} from "../wire/protocol";
import { asWireError } from "../wire/protocol";
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
import { FleetHome } from "./fleet/FleetHome";
import { FleetRail } from "./fleet/FleetRail";
import { HelpDialog } from "./HelpDialog";
import { IntroDialog } from "./IntroDialog";
import { LoginScreen } from "./LoginScreen";
import { stripTokenFragment } from "./routing";
import { RenameDialog } from "./RenameDialog";
import { ResumeDialog, type ResumePrefill } from "./spawn/ResumeDialog";
import { SearchDialog } from "./SearchDialog";
import { SessionLens } from "./SessionLens";
import type { SessionMenuActions } from "./SessionActionsMenu";
import { SetupScreen } from "./SetupScreen";
import { SpawnDraft } from "./spawn/SpawnDraft";
import { StatusBar } from "./StatusBar";
import { ToastRegion } from "./ToastRegion";
import { TopBar } from "./TopBar";
import { useDashboard } from "./hooks";
import { Inspector } from "./inspector/Inspector";
import { exportTranscript } from "./export";
import { useAttentionAnnouncement, useAttentionNotifications } from "./attention";
import { BootScreen } from "./BootScreen";
import { useDashboardLocation } from "./useDashboardLocation";
import { useDashboardShortcuts } from "./useDashboardShortcuts";

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
  const [actionTarget, setActionTarget] = useState<SessionView | null>(null);
  const [dropItem, setDropItem] = useState<QueueItemView | null>(null);
  const attention = attentionItems(state);
  const selected = selectedSession(state);
  const removedSnapshot = state.removed ? state.removedSession : null;
  const displayed = selected ?? removedSnapshot;
  // A fleet-rail menu acts on its row without selecting it. The dialog keeps
  // the row as its target; a selection-opened dialog falls back to the lens.
  const sessionForDialogs = actionTarget ?? selected;
  const detailsSession = actionTarget ?? displayed;

  const openAction = (next: ActionDialog) => {
    setActionTarget(null);
    setAction(next);
  };
  const openActionFor = (target: SessionView, next: ActionDialog) => {
    setActionTarget(target);
    setAction(next);
  };
  const openDetails = () => {
    setActionTarget(null);
    setDetailsOpen(true);
  };
  const openDetailsFor = (target: SessionView) => {
    setActionTarget(target);
    setDetailsOpen(true);
  };

  useEffect(() => {
    void store.boot();
    const flush = () => store.flushPersistence();
    // A #token= link opened while the dashboard is already mounted still signs
    // in; the fragment is removed before the request leaves the page.
    const acceptTokenLink = () => {
      const token = stripTokenFragment();
      if (token) void store.signIn(token);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("hashchange", acceptTokenLink);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("hashchange", acceptTokenLink);
      document.removeEventListener("visibilitychange", flush);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    document.title = selected
      ? `${displayLabel(selected)} · HLAO`
      : state.phase === "login"
        ? "Sign in · HLAO"
        : state.phase === "live"
          ? "Fleet · HLAO"
          : "HLAO dashboard";
  }, [selected, state.phase]);

  useEffect(() => {
    if (state.phase === "live" && !state.introSeen) setIntroOpen(true);
  }, [state.phase, state.introSeen]);

  useDashboardLocation(state);

  useEffect(() => {
    if (sessionForDialogs || !state.selection) return;
    if (["rename", "stop", "close", "close-subtree", "forget"].includes(action?.kind ?? "")) {
      setAction(null);
    }
  }, [sessionForDialogs, state.selection, action?.kind]);

  useEffect(() => {
    if (!detailsSession) setDetailsOpen(false);
  }, [detailsSession]);

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

  const shortcutOverlays = useMemo(
    () => ({
      palette: paletteOpen,
      resume: resumeOpen,
      search: searchOpen,
      help: helpOpen,
      details: detailsOpen,
      intro: introOpen,
      action: action !== null,
      rail: railOpen,
      draft: spawnDraftOpen,
    }),
    [
      paletteOpen,
      resumeOpen,
      searchOpen,
      helpOpen,
      detailsOpen,
      introOpen,
      action,
      railOpen,
      spawnDraftOpen,
    ],
  );

  useDashboardShortcuts({
    overlays: shortcutOverlays,
    onTogglePalette: () => setPaletteOpen((value) => !value),
    onSpawn: openSpawnDraft,
    onSearch: () => setSearchOpen(true),
    onHelp: () => setHelpOpen(true),
    onCloseRail: () => setRailOpen(false),
    onCloseDraft: () => setSpawnDraftOpen(false),
  });

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
    return (
      <BootScreen
        text={
          state.mode === "demo"
            ? "Opening the demo instance…"
            : "Connecting to the local bridge…"
        }
      />
    );
  }

  if (state.phase === "login") {
    return (
      <LoginScreen
        state={state}
        onSignIn={(token) => store.signIn(token)}
        onRetry={() => void store.retry()}
        onDemo={() => void store.connectDemo()}
        onTheme={() =>
          store.setTheme(state.theme === "dark" ? "light" : "dark")
        }
      />
    );
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

  const queue = state.queue;
  const sessionMenuActions: SessionMenuActions = {
    onRename: (target) => openActionFor(target, { kind: "rename" }),
    onClose: (target) => openActionFor(target, { kind: "close" }),
    onCloseSubtree: (target) =>
      openActionFor(target, { kind: "close-subtree" }),
    onForget: (target) => openActionFor(target, { kind: "forget" }),
    onDetails: (target) => openDetailsFor(target),
  };

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
          menuActions={sessionMenuActions}
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
                  onRename={() => openAction({ kind: "rename" })}
                  onStop={() => openAction({ kind: "stop" })}
                  onClose={() => openAction({ kind: "close" })}
                  onCloseSubtree={() => openAction({ kind: "close-subtree" })}
                  onForget={() => openAction({ kind: "forget" })}
                  onDrop={(item) => {
                    setDropItem(item);
                    openAction({ kind: "stop" });
                  }}
                  onDetails={openDetails}
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
        onDetails={openDetails}
        onRename={() => openAction({ kind: "rename" })}
        onStop={() => openAction({ kind: "stop" })}
        onCloseSession={() => openAction({ kind: "close" })}
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
          openAction({ kind: "clear" });
        }}
        onShutdown={() => {
          setHelpOpen(false);
          openAction({ kind: "shutdown" });
        }}
      />
      {detailsSession ? (
        <DetailsDialog
          open={detailsOpen}
          state={state}
          session={detailsSession}
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
            pending={Boolean(state.pending.cancel)}
            onClose={() => setAction(null)}
            onConfirm={(keepQueue) => {
              setAction(null);
              void store.cancel(keepQueue);
            }}
          />
          <CloseDialog
            open={action?.kind === "close"}
            session={sessionForDialogs}
            pending={Boolean(state.pending.close)}
            onClose={() => setAction(null)}
            onConfirm={(force) => {
              setAction(null);
              void store.close(force, sessionForDialogs.id);
            }}
          />
          <CloseSubtreeDialog
            open={action?.kind === "close-subtree"}
            state={state}
            session={sessionForDialogs}
            pending={Boolean(state.pending.close)}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              void store.closeSubtree(sessionForDialogs.id);
            }}
          />
          <ForgetDialog
            open={action?.kind === "forget"}
            session={sessionForDialogs}
            pending={Boolean(state.pending.forget)}
            onClose={() => setAction(null)}
            onConfirm={() => {
              setAction(null);
              void store.forget(sessionForDialogs.id);
            }}
            onExport={() => {
              void exportTranscript(sessionForDialogs);
            }}
          />
          <DropDialog
            open={action?.kind === "stop" && dropItem !== null}
            session={sessionForDialogs}
            item={dropItem}
            pending={Boolean(state.pending["queue-drop"])}
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
        pending={Boolean(state.pending.shutdown)}
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
