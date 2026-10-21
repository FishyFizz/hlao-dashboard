import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft, Search } from "lucide-react";
import {
  Dialog,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import { Kbd } from "../components/Status";
import {
  attentionItems,
  store,
  type DashboardState,
} from "../store/store";
import {
  displayLabel,
  formatAge,
  isTerminalStatus,
  nextAttentionSession,
} from "../store/model";
import type { SessionView } from "../wire/protocol";
import { statusLabel } from "../wire/protocol";
import { useNow } from "./hooks";
import { exportTranscript } from "./export";
import { copyWithToast } from "./ui";

type CommandItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
};

export function CommandPalette({
  open,
  state,
  onClose,
  onSpawn,
  onResume,
  onSearch,
  onHelp,
  onDetails,
  onRename,
  onStop,
  onCloseSession,
}: {
  open: boolean;
  state: DashboardState;
  onClose: () => void;
  onSpawn: () => void;
  onResume: () => void;
  onSearch: () => void;
  onHelp: () => void;
  onDetails: () => void;
  onRename: () => void;
  onStop: () => void;
  onCloseSession: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const attention = attentionItems(state);
  const selected = state.selection
    ? state.sessions[state.selection.id] ?? null
    : null;

  const commands = useMemo<CommandItem[]>(() => {
    const stepAttention = (direction: 1 | -1) => {
      const next = nextAttentionSession(
        attention,
        state.selection?.id ?? null,
        direction,
      );
      if (!next) {
        store.addToast({ tone: "info", title: "Nothing needs you" });
        return;
      }
      store.selectSession(next.id);
    };
    const items: CommandItem[] = [
      {
        id: "spawn",
        group: "Actions",
        label: "Start a new session",
        shortcut: "Ctrl/Cmd N",
        run: onSpawn,
      },
      {
        id: "resume-provider",
        group: "Actions",
        label: "Resume or fork a provider session",
        run: onResume,
      },
      {
        id: "search",
        group: "Actions",
        label: "Search sessions and events",
        shortcut: "Ctrl/Cmd Shift F",
        run: onSearch,
      },
      {
        id: "fleet",
        group: "Actions",
        label: "Return to the fleet",
        shortcut: "Esc",
        run: () => store.backToFleet(),
      },
      {
        id: "next-attention",
        group: "Attention",
        label: "Jump to next attention item",
        shortcut: "J",
        run: () => stepAttention(1),
      },
      {
        id: "prev-attention",
        group: "Attention",
        label: "Jump to previous attention item",
        shortcut: "K",
        run: () => stepAttention(-1),
      },
      {
        id: "theme",
        group: "Actions",
        label: `Switch to ${state.theme === "dark" ? "light" : "dark"} theme`,
        run: () => store.setTheme(state.theme === "dark" ? "light" : "dark"),
      },
      {
        id: "help",
        group: "Actions",
        label: "Help, shortcuts, and local state",
        shortcut: "?",
        run: onHelp,
      },
      {
        id: "retry",
        group: "Connection",
        label: "Retry the supervisor connection",
        run: () => void store.retry(),
      },
      {
        id: "demo",
        group: "Connection",
        label: state.mode === "demo" ? "Exit demo and connect to a supervisor" : "Open the demo instance",
        run: () => {
          if (state.mode === "demo") void store.connect("bridge");
          else void store.connectDemo();
        },
      },
    ];

    if (selected) {
      const permissions = selected.pendingPermissions;
      items.push(
        {
          id: "rename",
          group: "Selected session",
          label: "Rename the selected session",
          run: onRename,
        },
        {
          id: "details",
          group: "Selected session",
          label: "Open session details",
          run: onDetails,
        },
        {
          id: "copy-handle",
          group: "Selected session",
          label: "Copy the selected handle",
          run: () => void copyWithToast(`#${selected.id}`, "handle"),
        },
        {
          id: "copy-cli",
          group: "Selected session",
          label: "Copy the read command as CLI",
          run: () => void copyWithToast(`hlao read ${selected.id}`, "CLI command"),
        },
        {
          id: "export",
          group: "Selected session",
          label: "Export the selected transcript",
          run: () => {
            onClose();
            void exportTranscript(selected);
          },
        },
      );
      if (permissions.length > 0) {
        items.push({
          id: "permission",
          group: "Selected session",
          label:
            permissions.length === 1
              ? "Answer the pending permission"
              : `Answer the ${permissions.length} pending permissions`,
          run: () => {
            document
              .querySelector(".permission-gate")
              ?.scrollIntoView({ block: "center" });
          },
        });
      }
      if (selected.status === "busy" || selected.status === "waiting_permission") {
        items.push({
          id: "stop",
          group: "Selected session",
          label: "Stop the active turn…",
          run: onStop,
        });
      }
      if (!isTerminalStatus(selected.status)) {
        items.push({
          id: "close",
          group: "Selected session",
          label: "Close the selected session…",
          run: onCloseSession,
        });
      }
      if (selected.status === "failed") {
        items.push({
          id: "ack",
          group: "Selected session",
          label: "Acknowledge the failure locally",
          run: () => store.acknowledgeFailure(selected.id),
        });
      }
    }

    const sessions = Object.values(state.sessions).sort((a, b) =>
      displayLabel(a).localeCompare(displayLabel(b)),
    );
    for (const session of sessions) {
      items.push({
        id: `go-${session.id}`,
        group: "Go to session",
        label: displayLabel(session),
        hint: sessionHint(session, now),
        run: () => store.selectSession(session.id),
      });
    }
    return items;
  }, [
    attention,
    now,
    onClose,
    onCloseSession,
    onDetails,
    onHelp,
    onRename,
    onSpawn,
    onResume,
    onSearch,
    onStop,
    selected,
    state.mode,
    state.selection?.id,
    state.sessions,
    state.theme,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((item) =>
      `${item.group} ${item.label} ${item.hint ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [commands, query]);

  const target = query.trim() ? store.resolveTarget(query) : null;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    document
      .getElementById(`palette-item-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const bucket = byGroup.get(item.group);
      if (bucket) bucket.push(item);
      else {
        byGroup.set(item.group, [item]);
        order.push(item.group);
      }
    }
    let index = 0;
    return order.map((group) => ({
      group,
      items: (byGroup.get(group) ?? []).map((item) => ({ item, index: index++ })),
    }));
  }, [filtered]);

  const run = (item: CommandItem) => {
    onClose();
    item.run();
  };

  return (
    <ModalOverlay
      className="modal-overlay"
      isDismissable
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal className="palette-dialog">
        <Dialog aria-label="Command palette" className="palette">
          <div className="palette__search">
            <Command className="icon" />
            <input
              ref={inputRef}
              className="palette__input"
              value={query}
              placeholder="Go to a session, start one, resume, search…"
              aria-label="Command palette query"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((value) => Math.min(filtered.length - 1, value + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) => Math.max(0, value - 1));
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setActive(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setActive(Math.max(0, filtered.length - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const item = filtered[active];
                  if (item) run(item);
                }
              }}
            />
            <span className="palette__hint">
              <Kbd>esc</Kbd>
            </span>
          </div>

          {target?.kind === "ambiguous" ? (
            <div className="palette__target-hint">
              <span>
                “{query.trim()}” matches {target.candidates.length} sessions. Choose
                an exact handle.
              </span>
              <span className="mono">
                {target.candidates.map((candidate) => `#${candidate.id}`).join(" · ")}
              </span>
            </div>
          ) : null}

          <div className="palette__scroll">
            {filtered.length === 0 ? (
              <div className="palette__empty">
                <Search className="icon" />
                <span>No commands or sessions match “{query}”.</span>
              </div>
            ) : (
              groups.map(({ group, items }) => (
                <div className="palette__group" key={group}>
                  <div className="palette__group-label">{group}</div>
                  {items.map(({ item, index }) => (
                    <button
                      type="button"
                      className="palette__item"
                      id={`palette-item-${index}`}
                      data-active={index === active ? "true" : undefined}
                      key={item.id}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                    >
                      <span className="palette__item-label">{item.label}</span>
                      {item.hint ? (
                        <span className="palette__item-meta">{item.hint}</span>
                      ) : null}
                      {item.shortcut ? (
                        <span className="palette__shortcut">{item.shortcut}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="palette__foot">
            <span className="palette__foot-hint">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate · <Kbd>↵</Kbd> run · <Kbd>esc</Kbd>{" "}
              close
            </span>
            <span className="palette__foot-hint">
              <CornerDownLeft className="icon" /> scope is one instance
            </span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function sessionHint(session: SessionView, now: number): string {
  return `#${session.id} · ${statusLabel(session.status).toLowerCase()} · ${formatAge(session.lastActivityAt, now)}`;
}
