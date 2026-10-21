import { Copy } from "lucide-react";
import { Button } from "../../components/Button";
import type { OrphanDraft } from "../../store/store";
import { copyWithToast } from "../ui";

/** Drafts for sessions that no longer exist stay local and copyable. */
export function OrphanDrafts({ orphans }: { orphans: OrphanDraft[] }) {
  if (orphans.length === 0) return null;
  return (
    <section className="orphan-block" aria-label="Orphaned drafts">
      <div className="orphan-block__head">
        <span>Orphaned drafts</span>
        <span>{orphans.length}</span>
      </div>
      <p className="orphan-block__text">
        These drafts belonged to sessions that are no longer in this instance. They
        stay local and copyable; the dashboard never retargets them.
      </p>
      {orphans.map((draft) => (
        <div className="orphan-row" key={draft.key}>
          <span className="orphan-row__key">{draft.key}</span>
          <span className="orphan-row__text">{draft.text}</span>
          <Button size="sm" onPress={() => void copyWithToast(draft.text, "draft")}>
            <Copy className="btn__icon icon" />
            Copy
          </Button>
        </div>
      ))}
    </section>
  );
}
