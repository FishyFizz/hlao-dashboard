import { useState } from "react";
import {
  Checkbox,
  Dialog,
  DialogTrigger,
  Heading,
  Input,
  Label,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover,
  SearchField,
  Separator,
  Text,
  TextField,
  Tooltip,
  TooltipTrigger,
} from "react-aria-components";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  Terminal,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Section, Specimen } from "../components/Section";
import { Handle, Kbd, Status } from "../components/Status";

type ToastTone = "info" | "ok" | "danger";

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  text: string;
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "ok") return <CheckCircle2 className="toast__icon icon" />;
  if (tone === "danger") return <XCircle className="toast__icon icon" />;
  return <Info className="toast__icon icon" />;
}

export function Surfaces() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = (tone: ToastTone, title: string, text: string) => {
    setToasts((current) => [...current, { id: crypto.randomUUID(), tone, title, text }]);
  };

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  return (
    <>
      <Section
        id="overlays"
        index="14"
        title="Overlays"
        description="Overlays are bordered panels on a flat backdrop, never floating shadows. A dialog owns the decision; a menu owns the shortcut; a tooltip explains a control without taking focus."
      >
        <Specimen label="Dialog" note="One decision per dialog. The footer carries the verbs.">
          <div className="row row--wide">
            <DialogTrigger>
              <Button>Rename session</Button>
              <ModalOverlay className="modal-overlay" isDismissable>
                <Modal className="dialog">
                  <Dialog>
                    {({ close }) => (
                      <>
                        <div className="dialog__head">
                          <div>
                            <span className="dialog__kicker">Session #4f2a9c</span>
                            <Heading slot="title" className="dialog__title">
                              Rename session
                            </Heading>
                          </div>
                          <button
                            type="button"
                            className="dialog__close"
                            aria-label="Close dialog"
                            onClick={close}
                          >
                            <X className="icon" />
                          </button>
                        </div>
                        <div className="dialog__body">
                          <TextField className="field" defaultValue="refactor-auth">
                            <Label className="field__label">Name</Label>
                            <div className="field__control">
                              <Input className="field__input" />
                            </div>
                            <Text slot="description" className="field__hint">
                              Visible in the fleet. The six-character handle does not change.
                            </Text>
                          </TextField>
                        </div>
                        <div className="dialog__foot">
                          <Button variant="ghost" onPress={close}>
                            Cancel
                          </Button>
                          <Button variant="primary" onPress={close}>
                            Save name
                          </Button>
                        </div>
                      </>
                    )}
                  </Dialog>
                </Modal>
              </ModalOverlay>
            </DialogTrigger>

            <DialogTrigger>
              <Button variant="danger">Close session</Button>
              <ModalOverlay className="modal-overlay" isDismissable>
                <Modal className="dialog">
                  <Dialog>
                    {({ close }) => (
                      <>
                        <div className="dialog__head">
                          <div>
                            <span className="dialog__kicker">Destructive</span>
                            <Heading slot="title" className="dialog__title">
                              Close #4f2a9c?
                            </Heading>
                          </div>
                          <button
                            type="button"
                            className="dialog__close"
                            aria-label="Close dialog"
                            onClick={close}
                          >
                            <X className="icon" />
                          </button>
                        </div>
                        <div className="dialog__body">
                          <p className="note">
                            The session ends and its process is stopped. The closed session stays in
                            the live table for one hour, then its event log is gone.
                          </p>
                          <Checkbox className="check">
                            <span className="check__box">
                              <Check className="check__icon icon" />
                            </span>
                            <span>Also discard the two queued prompts.</span>
                          </Checkbox>
                        </div>
                        <div className="dialog__foot">
                          <Button variant="ghost" onPress={close}>
                            Keep open
                          </Button>
                          <Button variant="danger" onPress={close}>
                            Close session
                          </Button>
                        </div>
                      </>
                    )}
                  </Dialog>
                </Modal>
              </ModalOverlay>
            </DialogTrigger>
          </div>
        </Specimen>

        <Specimen label="Menu and tooltip" note="Shortcuts sit at the right edge; destructive is last and red.">
          <div className="row row--wide">
            <MenuTrigger>
              <Button>Session actions</Button>
              <Popover className="popover">
                <Menu className="menu" onAction={() => undefined}>
                  <MenuItem id="rename" textValue="Rename" className="menu__item">
                    <Pencil className="icon" />
                    Rename…
                    <span className="menu__shortcut">F2</span>
                  </MenuItem>
                  <MenuItem id="copy" textValue="Copy handle" className="menu__item">
                    <Copy className="icon" />
                    Copy handle
                    <span className="menu__shortcut">⌘C</span>
                  </MenuItem>
                  <MenuItem id="export" textValue="Export transcript" className="menu__item">
                    <ExternalLink className="icon" />
                    Export transcript
                    <span className="menu__shortcut">⌘E</span>
                  </MenuItem>
                  <Separator className="menu__sep" />
                  <MenuItem
                    id="close"
                    textValue="Close session"
                    className="menu__item menu__item--danger"
                  >
                    <Power className="icon" />
                    Close session
                    <span className="menu__shortcut">⌘.</span>
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>

            <TooltipTrigger delay={150}>
              <IconButton aria-label="About the live badge">
                <Info className="btn__icon icon" />
              </IconButton>
              <Tooltip className="tooltip">
                Fleet views stream on one subscription; events on a second.
              </Tooltip>
            </TooltipTrigger>

            <span className="caption">Hover the info button. Open the menu.</span>
          </div>
        </Specimen>
      </Section>

      <Section
        id="feedback"
        index="15"
        title="Feedback"
        description="Feedback reports an outcome or a condition. A toast confirms an operator action; a banner describes a state the operator did not cause. Neither uses the accent to mean danger."
      >
        <Specimen label="Toasts" note="Static specimens. The live region below is dismissed by hand, never by a timer.">
          <div className="grid-2">
            <div className="toast toast--ok">
              <CheckCircle2 className="toast__icon icon" />
              <div className="toast__body">
                <span className="toast__title">Permit granted</span>
                <span className="toast__text">
                  #9c1e07 may run this Bash command once. The turn resumes.
                </span>
              </div>
              <button type="button" className="toast__close" aria-label="Dismiss toast">
                <X className="icon" />
              </button>
            </div>
            <div className="toast toast--danger">
              <XCircle className="toast__icon icon" />
              <div className="toast__body">
                <span className="toast__title">Stream closed</span>
                <span className="toast__text">
                  Reconnecting from seq 412. History may be truncated; the cursor is kept.
                </span>
              </div>
              <button type="button" className="toast__close" aria-label="Dismiss toast">
                <X className="icon" />
              </button>
            </div>
          </div>
          <div className="row row--wide">
            <Button
              size="sm"
              onPress={() =>
                pushToast("ok", "Permit granted", "#9c1e07 may run this Bash command once.")
              }
            >
              Push success
            </Button>
            <Button
              size="sm"
              onPress={() =>
                pushToast(
                  "danger",
                  "Stream closed",
                  "Reconnecting from seq 412. Cursor kept; resume will report truncation.",
                )
              }
            >
              Push failure
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setToasts([])}
              isDisabled={toasts.length === 0}
            >
              Clear all
            </Button>
            <span className="caption">{toasts.length} live toast(s)</span>
          </div>
        </Specimen>

        <Specimen label="Banners" note="A banner is part of the page, not a layer above it.">
          <div className="stack">
            <div className="banner">
              <Info className="banner__icon icon" />
              <div className="banner__body">
                <span className="banner__title">Viewing a retained session.</span>
                <span className="banner__text">
                  Closed sessions are kept for one hour. The transcript may be truncated.
                </span>
              </div>
              <Button size="sm" variant="ghost" className="banner__action">
                Read from start
              </Button>
            </div>
            <div className="banner banner--warn">
              <TriangleAlert className="banner__icon icon" />
              <div className="banner__body">
                <span className="banner__title">Supervisor is wire 2.4.</span>
                <span className="banner__text">
                  Provider-native compaction and plan panels are hidden. The base view is
                  unchanged.
                </span>
              </div>
            </div>
            <div className="banner banner--danger">
              <XCircle className="banner__icon icon" />
              <div className="banner__body">
                <span className="banner__title">Supervisor connection lost.</span>
                <span className="banner__text">
                  Showing the last known state. The client will reconnect and resume from the last
                  cursor.
                </span>
              </div>
              <Button size="sm" className="banner__action">
                Reconnect now
              </Button>
            </div>
          </div>
        </Specimen>

        <Specimen label="Empty state" note="An empty table says what it is empty of, and what to do next.">
          <div className="empty">
            <span className="empty__mark">
              <Plus className="icon" />
            </span>
            <span className="empty__title">No sessions in this instance.</span>
            <span className="empty__text">
              Spawn a session from the command palette or the primary action. The fleet view will
              add it without a reconnect.
            </span>
            <Button size="sm" variant="primary">
              <Plus className="btn__icon icon" />
              Spawn session
            </Button>
          </div>
        </Specimen>

        <div className="toast-region" aria-live="polite" aria-label="Notifications">
          {toasts.map((toast) => (
            <div className={`toast toast--${toast.tone}`} key={toast.id} role="status">
              <ToastIcon tone={toast.tone} />
              <div className="toast__body">
                <span className="toast__title">{toast.title}</span>
                <span className="toast__text">{toast.text}</span>
              </div>
              <button
                type="button"
                className="toast__close"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
              >
                <X className="icon" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="palette"
        index="16"
        title="Command palette"
        description="Every operator action has a command. The palette is the keyboard surface for the dashboard: search, grouped results, one active row, and the keys that move it."
      >
        <Specimen
          label="Palette · static specimen"
          note="The active row is a cyan rule plus a wash. Results are grouped by object type."
        >
          <div className="palette-frame">
            <div className="palette">
              <div className="palette__search">
                <Search className="icon" />
                <input
                  className="palette__input"
                  defaultValue="permit"
                  aria-label="Command search"
                  placeholder="Search commands, sessions, events…"
                />
                <span className="palette__hint">ESC</span>
              </div>

              <div className="palette__group">
                <div className="palette__group-label">Actions</div>
                <div className="palette__item" data-active>
                  <Shield className="icon" />
                  <span>Permit #9c1e07 · run shell command</span>
                  <span className="palette__shortcut">↵</span>
                </div>
                <div className="palette__item">
                  <Shield className="icon" />
                  <span>Permit all pending requests</span>
                  <span className="palette__item-meta">1 session</span>
                </div>
                <div className="palette__item">
                  <Power className="icon" />
                  <span>Close #2d9f6a · flaky-test-triage</span>
                  <span className="palette__item-meta">failed</span>
                </div>
              </div>

              <div className="palette__group">
                <div className="palette__group-label">Sessions</div>
                <div className="palette__item">
                  <span className="lamp lamp--warn" />
                  <Handle id="9c1e07" />
                  <span>codex-probe</span>
                  <span className="palette__item-meta">waiting for permission</span>
                </div>
                <div className="palette__item">
                  <span className="lamp lamp--accent" />
                  <Handle id="4f2a9c" />
                  <span>refactor-auth</span>
                  <span className="palette__item-meta">running · turn 07</span>
                </div>
              </div>

              <div className="palette__group">
                <div className="palette__group-label">Events</div>
                <div className="palette__item">
                  <Terminal className="icon" />
                  <span>Find tool calls named “refresh”</span>
                  <span className="palette__item-meta">Bash</span>
                </div>
                <div className="palette__item">
                  <MessageSquare className="icon" />
                  <span>Read last agent message</span>
                  <span className="palette__item-meta">4f2a9c</span>
                </div>
              </div>

              <div className="palette__foot">
                <span className="palette__foot-hint">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  navigate
                </span>
                <span className="palette__foot-hint">
                  <Kbd>↵</Kbd>
                  run
                </span>
                <span className="palette__foot-hint">
                  <Kbd>ESC</Kbd>
                  close
                </span>
                <span style={{ marginLeft: "auto" }}>6 results</span>
              </div>
            </div>
          </div>
        </Specimen>

        <Specimen label="Search as a filter" note="The palette reuses the search field and the status lamp; it invents no new control.">
          <div className="row row--wide">
            <SearchField className="field" style={{ maxWidth: 360 }}>
              <Label className="field__label">Try a query shape</Label>
              <div className="field__search">
                <Search className="field__search-icon icon" />
                <Input className="field__input" placeholder="status:waiting backend:codex" />
              </div>
            </SearchField>
            <div className="row">
              <Status status="waiting_permission" />
              <Handle id="9c1e07" />
              <span className="caption">codex-probe</span>
            </div>
          </div>
        </Specimen>
      </Section>
    </>
  );
}
