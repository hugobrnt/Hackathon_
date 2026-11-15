import { Button } from "../../shared/ui";
export function ConnectionFallback({
  expanded = false,
  busy,
  onInstagram,
  onRefresh,
}: {
  expanded?: boolean;
  busy: boolean;
  onInstagram: () => void;
  onRefresh: () => void;
}) {
  return (
    <details className="connection-help" open={expanded || undefined}>
      <summary>Connection didn’t finish?</summary>
      <p>
        Use an Instagram Business or Creator account. Sign in, accept the
        permissions, then click Continue on Zernio to return to Signal.
      </p>
      <div className="actions">
        <Button disabled={busy} onClick={onInstagram}>
          Connect Instagram through Facebook
        </Button>
        <Button disabled={busy} onClick={onRefresh}>
          Check connection
        </Button>
        <a
          className="text-link"
          href="https://zernio.com/dashboard"
          target="_blank"
          rel="noreferrer"
        >
          Open Zernio ↗
        </a>
      </div>
      <small>
        The Facebook option requires a Page linked to your Instagram account.
        You can also connect in Zernio, then check here.
      </small>
    </details>
  );
}
