import { Notice } from "../../components/Notice";

/** The one failure shape shared by the spawn draft and the resume dialog. */
export function SpawnErrorNotice({
  title,
  message,
  details,
  className,
}: {
  title: string;
  message: string;
  details: string | null;
  className?: string;
}) {
  return (
    <Notice tone="danger" title={title} className={className}>
      {message}
      {details ? (
        <details className="dialog-details">
          <summary>Adapter stderr / details</summary>
          <pre>{details}</pre>
        </details>
      ) : null}
    </Notice>
  );
}
