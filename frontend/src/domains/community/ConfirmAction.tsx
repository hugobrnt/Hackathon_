import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../../shared/ui";
export interface ActionConfirmation {
  title: string;
  body: ReactNode;
  label: string;
  action: () => Promise<void>;
}
export function ConfirmAction({
  value,
  busy,
  onClose,
  onConfirm,
}: {
  value: ActionConfirmation;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="boost-dialog confirm-send"
      aria-labelledby="confirm-send-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="section-heading">
        <h2 id="confirm-send-title">{value.title}</h2>
        <Button aria-label="Cancel action" disabled={busy} onClick={onClose}>
          ✕
        </Button>
      </header>
      <div className="confirmation-body">{value.body}</div>
      <div className="actions">
        <Button primary disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : value.label}
        </Button>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </dialog>
  );
}
