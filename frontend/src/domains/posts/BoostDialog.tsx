import { useEffect, useRef } from "react";
import type { PostIntentStats } from "../../api/types";
import { Button } from "../../shared/ui";
import { formatPercent } from "../../shared/format";

export function BoostDialog({
  post,
  onClose,
  onOpen,
}: {
  post: PostIntentStats;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="boost-dialog"
      aria-labelledby="boost-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="section-heading">
        <h2 id="boost-title">Boost this post</h2>
        <Button aria-label="Close boost" onClick={onClose}>
          ✕
        </Button>
      </header>
      <p className="boost-caption">{post.post.caption || "Untitled post"}</p>
      <p className="boost-signal">
        <strong>
          {post.total_comments ? formatPercent(post.purchase_intent_rate) : "—"}
        </strong>{" "}
        purchase intent · {post.intent_counts.purchase_intent}/
        {post.total_comments} comments
      </p>
      <div className="notice notice--demo">
        Paid promotion is not connected yet. No ad will be created or budget
        spent.
      </div>
      <div className="actions">
        <Button
          primary
          onClick={() => {
            onClose();
            onOpen(post.post.id);
          }}
        >
          Review post details ↗
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </dialog>
  );
}
