import { Button } from "../../shared/ui";
export function ConnectionFallback({
  busy,
  onInstagram,
  onRefresh,
}: {
  busy: boolean;
  onInstagram: () => void;
  onRefresh: () => void;
}) {
  return (
    <details className="connection-help">
      <summary>Connection didn’t finish?</summary>
      <p>
        Instagram needs a professional account. After signing in, complete the
        authorization before returning here.
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
