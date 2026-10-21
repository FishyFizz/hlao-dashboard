import type { SessionView } from "../wire/protocol";

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function id(session: Pick<SessionView, "id">): string {
  return session.id;
}

export const cli = {
  read: (session: SessionView) => `hlao read ${id(session)} --since 0`,
  send: (session: SessionView, text: string) =>
    `hlao send ${id(session)} ${quote(text)}`,
  cancel: (session: SessionView, keepQueue: boolean) =>
    `hlao cancel ${id(session)}${keepQueue ? " --keep-queue" : ""}`,
  close: (session: SessionView, force: boolean) =>
    `hlao close ${id(session)}${force ? " --force" : ""}`,
  closeTree: (session: SessionView) => `hlao close ${id(session)} --tree`,
  forget: (session: SessionView) => `hlao close ${id(session)} --forget`,
  rename: (session: SessionView, name: string) =>
    name.trim()
      ? `hlao rename ${id(session)} ${quote(name.trim())}`
      : `hlao rename ${id(session)} --clear`,
  mode: (session: SessionView, modeId: string) =>
    `hlao mode ${id(session)} ${quote(modeId)}`,
  permit: (
    session: SessionView,
    optionId: string,
    options: { requestId?: string; always?: boolean } = {},
  ) =>
    `hlao permit ${id(session)} --option ${quote(optionId)}` +
    `${options.requestId ? ` --request ${quote(options.requestId)}` : ""}` +
    `${options.always ? " --always" : ""}`,
  drop: (session: SessionView, messageId: string) =>
    `hlao cancel ${id(session)} --keep-queue   # dashboard drop: ${messageId}`,
  reload: () => "hlao config validate",
  shutdown: (force: boolean) => `hlao down${force ? " --force" : ""}`,
  instance: (home: string) => `HLAO_HOME=${quote(home)} hlao list --all`,
  wire: (method: string, params: Record<string, unknown>) =>
    `wire ${method} ${JSON.stringify(params)}`,
};
