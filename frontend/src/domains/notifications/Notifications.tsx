import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../../shared/ui";
import "./notifications.css";
export interface Notice {
  text: string;
  error?: boolean;
}
interface Notification extends Notice {
  id: string;
  createdAt: string;
  read: boolean;
}
export function pushNotification(notice: Notice) {
  window.dispatchEvent(
    new CustomEvent("signal:notification", { detail: notice }),
  );
}
export function useNotifications() {
  const [notice, setLatest] = useState<Notice | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  function setNotice(value: Notice | null) {
    setLatest(value);
    if (value)
      setItems((old) =>
        [
          {
            ...value,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...old,
        ].slice(0, 40),
      );
  }
  useEffect(() => {
    const receive = (event: Event) =>
      setNotice((event as CustomEvent<Notice>).detail);
    window.addEventListener("signal:notification", receive);
    return () => window.removeEventListener("signal:notification", receive);
  }, []);
  return {
    notice,
    setNotice,
    items,
    markRead: () =>
      setItems((old) => old.map((item) => ({ ...item, read: true }))),
    clear: () => {
      setItems([]);
      setLatest(null);
    },
    remove: (id: string) =>
      setItems((old) => old.filter((item) => item.id !== id)),
  };
}
export function Notifications({
  items,
  markRead,
  clear,
  remove,
}: Pick<
  ReturnType<typeof useNotifications>,
  "items" | "markRead" | "clear" | "remove"
>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const unread = items.filter((item) => !item.read).length;
  useEffect(() => {
    if (open && unread) markRead();
  }, [open, unread, markRead]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="notification-center" ref={root}>
      <button
        ref={trigger}
        className="btn notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="notification-count">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="notification-panel"
        >
          <header>
            <h2>Notifications</h2>
            <button
              ref={close}
              className="notification-close"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              ×
            </button>
          </header>
          {!items.length ? (
            <p className="notification-empty">You’re all caught up.</p>
          ) : (
            <>
              <ol>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={item.error ? "notification-error" : ""}
                  >
                    <span className="notification-dot" aria-hidden="true">
                      {item.error ? "!" : "✓"}
                    </span>
                    <div>
                      {item.error && <strong>Action needed</strong>}
                      <p>{item.text}</p>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <button
                      className="notification-dismiss"
                      aria-label="Dismiss notification"
                      onClick={() => remove(item.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              <footer>
                <Button onClick={clear}>Clear all</Button>
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}
