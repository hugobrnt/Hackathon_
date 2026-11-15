import type { SocialAccount } from "../../api/types";
import type { DataMode } from "../../api/source";
import { Button, Empty, Heading } from "../../shared/ui";
import { SOCIAL_PLATFORMS } from "../../shared/platforms";
import { PlatformBadge } from "../../shared/PlatformBadge";
export const PLATFORMS = SOCIAL_PLATFORMS;
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
              disabled={busy || mode === "demo" || key === "bluesky"}
              title={
                key === "bluesky"
                  ? "Connect in Zernio, then refresh accounts"
                  : key === "snapchat"
                    ? "Closed-beta access required"
                    : undefined
              }
              aria-label={"Connect " + name}
            >
              <PlatformBadge platform={key} />
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
