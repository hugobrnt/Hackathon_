import type { SocialAccount } from "../../api/types";

interface Props {
  accounts: SocialAccount[];
  accountId: string | null;
  busy: string | null;
  onChange: (accountId: string) => void;
  onImport: () => void;
  onDemo: () => void;
  onClassify: () => void;
}

export function AccountBar({ accounts, accountId, busy, onChange, onImport, onDemo, onClassify }: Props) {
  const selected = accounts.find((a) => a.id === accountId);
  return (
    <div className="account-bar">
      <label className="field">
        <span className="field__label">Compte</span>
        <select value={accountId ?? ""} onChange={(e) => onChange(e.target.value)} disabled={accounts.length === 0}>
          {accounts.length === 0 && <option value="">Aucun compte</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.is_demo ? "Démo · " : ""}@{a.username ?? a.id} ({a.platform})
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onImport}
          disabled={!selected || selected.is_demo || busy !== null}
        >
          {busy === "import" ? "Import…" : "Importer"}
        </button>
        <button type="button" className="btn" onClick={onClassify} disabled={busy !== null}>
          {busy === "classify" ? "Classification…" : "Classer"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDemo} disabled={busy !== null}>
          {busy === "demo" ? "Chargement…" : "Données de démo"}
        </button>
      </div>
    </div>
  );
}
