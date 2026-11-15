import type { SocialAccount } from "../../api/types";
import type { DataMode } from "../../api/source";
import { Button, Empty, Heading, Icon } from "../../shared/ui";
export const PLATFORMS = [
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["twitter", "X"],
] as const;
export function Connections({
  mode,
  accounts,
  busy,
  onConnect,
  onSync,
  onImport,
  onDemo,
  onLive,
  onHome,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
  busy: boolean;
  onConnect: (p: string) => void;
  onSync: () => void;
  onImport: (id: string) => void;
  onDemo: () => void;
  onLive: () => void;
  onHome: () => void;
}) {
  return (
    <>
      <Heading
        title="Connect your channels."
        subtitle="Choose where your brand lives. One secure authorization per channel."
      >
        <Button onClick={onSync} disabled={busy || mode === "demo"}>
          Refresh accounts
        </Button>
      </Heading>
      {mode === "demo" && (
        <div className="notice notice--demo">
          <strong>Offline demo</strong> One sample Instagram account is
          available.
          <Button onClick={onLive}>Use connected accounts</Button>
        </div>
      )}
      <div className="networks-grid">
        {PLATFORMS.map(([key, name]) => {
          const connected = accounts.filter((a) => a.platform === key);
          return (
            <button
              className="network-card"
              key={key}
              onClick={() => onConnect(key)}
              disabled={busy || mode === "demo"}
              aria-label={"Connect " + name}
            >
              {["instagram", "linkedin"].includes(key) ? (
                <Icon name={key} />
              ) : (
                <span className="network-letter">{name.slice(0, 1)}</span>
              )}
              <strong>{name}</strong>
              <span className="network-plus">
                {connected.length ? "✓" : "+"}
              </span>
              <small>
                {connected.length ? "Account connected" : "Connect account"}
              </small>
            </button>
          );
        })}
      </div>
      <p className="footnote">
        These are the five platforms currently accepted by the backend.
        Additional Zernio integrations can be added later.
      </p>
      <section className="panel">
        <h2>Your accounts</h2>
        {!accounts.length ? (
          <Empty
            title="No account connected yet"
            action={
              <Button onClick={onDemo}>Try the offline demo instead</Button>
            }
          >
            Connect a channel above, or refresh accounts already authorized in
            Zernio.
          </Empty>
        ) : (
          accounts.map((a) => (
            <div className="connected-account" key={a.id}>
              <div className="avatar">
                {(a.username ?? a.platform).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{a.username ?? a.platform}</strong>
                <small>
                  {a.platform} · {a.is_demo ? "Sample data" : "Connected"}
                  {a.last_imported_at ? " · Previously imported" : ""}
                </small>
              </div>
              <Button onClick={() => onImport(a.id)} disabled={busy}>
                {a.is_demo ? "Open demo" : "Import posts & comments"}
              </Button>
            </div>
          ))
        )}
      </section>
      <div className="actions">
        <Button onClick={onHome}>Go to dashboard →</Button>
        <span className="muted small">
          Authorization happens on the provider’s website via Zernio.
        </span>
      </div>
    </>
  );
}
