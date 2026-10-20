import { ChevronUp, FolderOpen, X } from "lucide-react";
import { Button } from "../components/Button";
import type { DirectoryListing } from "../store/store";

/** Bridge-backed directory picker for the spawn cwd field. */
export function CwdBrowser({
  listing,
  loading,
  error,
  onNavigate,
  onUse,
  onClose,
}: {
  listing: DirectoryListing | null;
  loading: boolean;
  error: string | null;
  onNavigate: (path: string) => void;
  onUse: (path: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="cwd-browser">
      <div className="cwd-browser__head">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!listing?.parent || loading}
          onPress={() => {
            if (listing?.parent) onNavigate(listing.parent);
          }}
          title="Parent directory"
        >
          <ChevronUp className="btn__icon icon" />
          Up
        </Button>
        <span className="cwd-browser__path" title={listing?.path}>
          {listing?.path ?? "Loading..."}
        </span>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={loading}
          onPress={onClose}
          aria-label="Close directory browser"
        >
          <X className="btn__icon icon" />
        </Button>
      </div>
      {listing && listing.roots.length > 1 ? (
        <div className="cwd-browser__roots">
          {listing.roots.map((root) => (
            <Button
              size="sm"
              variant="ghost"
              key={root}
              onPress={() => onNavigate(root)}
            >
              {root}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="cwd-browser__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cwd-browser__list">
        {loading ? (
          <span className="cwd-browser__empty">Loading directories...</span>
        ) : listing?.entries.length ? (
          listing.entries.map((entry) => (
            <button
              type="button"
              className="cwd-browser__entry"
              key={entry.path}
              onClick={() => onNavigate(entry.path)}
              title={entry.path}
            >
              <FolderOpen className="icon" />
              <span>{entry.name}</span>
            </button>
          ))
        ) : (
          <span className="cwd-browser__empty">No subdirectories.</span>
        )}
      </div>
      <div className="cwd-browser__foot">
        <span className="caption">
          {listing ? `${listing.entries.length} folders` : ""}
        </span>
        <Button
          size="sm"
          variant="primary"
          isDisabled={!listing || loading}
          onPress={() => {
            if (listing) onUse(listing.path);
          }}
        >
          Use this folder
        </Button>
      </div>
    </div>
  );
}
