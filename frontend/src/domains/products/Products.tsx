import { useEffect, useState } from "react";
import type { DataMode } from "../../api/source";
import type { SocialAccount } from "../../api/types";
import type { CatalogProduct } from "./types";
import { catalogFor, groupCatalog, saveCatalogAcrossChannels } from "./api";
import { ProductForm } from "../community/ProductForm";
import type { ProductInput } from "../../api/outreach-types";
import { Button, Heading } from "../../shared/ui";
import { PlatformBadge } from "../../shared/PlatformBadge";
import { safeExternalUrl } from "../../shared/storage";
import "./products.css";
export function Products({
  mode,
  accounts,
}: {
  mode: DataMode;
  accounts: SocialAccount[];
}) {
  const [rows, setRows] = useState<CatalogProduct[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<CatalogProduct[] | null>(null),
    [channels, setChannels] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    Promise.all(accounts.map((a) => catalogFor(mode).list(a.id, c.signal)))
      .then((v) => {
        if (!c.signal.aborted) setRows(v.flat());
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [mode, accounts.map((a) => a.id).join("|"), revision]);
  async function save(input: ProductInput) {
    if (!channels.length) return;
    setBusy(true);
    setError("");
    try {
      await saveCatalogAcrossChannels(
        mode,
        channels,
        {
          business_type: input.business_type,
          title: input.name,
          landing_url: input.landing_url,
          description: input.description,
          is_active: true,
        },
        editing ?? [],
      );
      setEditing(null);
      setNotice("Product saved. New comments can be matched to this product.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save product.");
    } finally {
      setBusy(false);
      setRevision((n) => n + 1);
    }
  }
  async function archive(group: CatalogProduct[]) {
    setBusy(true);
    setError("");
    try {
      await saveCatalogAcrossChannels(
        mode,
        group.map((p) => p.account_id),
        { ...group[0], is_active: !group.some((p) => p.is_active) },
        group,
      );
      setNotice(
        "Catalog updated. Existing conversations keep their product history.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update product.");
    } finally {
      setBusy(false);
      setRevision((n) => n + 1);
    }
  }
  const groups = groupCatalog(rows);
  return (
    <div className="catalog-page">
      <Heading
        title="Products"
        subtitle="The pages your agent can recommend, with the facts it can use to answer."
      >
        <Button
          primary
          disabled={!accounts.length || busy}
          onClick={() => {
            setEditing([]);
            setChannels(accounts.map((a) => a.id));
          }}
        >
          + Add product
        </Button>
      </Heading>
      {error && (
        <div role="alert" className="notice notice--error">
          {error}
          <Button onClick={() => setRevision((n) => n + 1)}>
            Retry loading
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {editing !== null && (
        <section className="panel catalog-editor">
          <div className="section-heading">
            <h2>{editing.length ? "Edit product" : "New product"}</h2>
            <Button disabled={busy} onClick={() => setEditing(null)}>
              Close
            </Button>
          </div>
          <ProductForm
            key={editing.map((p) => p.id).join(",") || "new"}
            product={
              editing[0] ? { ...editing[0], name: editing[0].title } : null
            }
            busy={busy || !channels.length}
            onSave={save}
            submitLabel="Save product"
          />
          <fieldset className="catalog-channels">
            <legend>Available on</legend>
            {accounts.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={channels.includes(a.id)}
                  disabled={busy || editing.some((p) => p.account_id === a.id)}
                  onChange={(e) =>
                    setChannels(
                      e.target.checked
                        ? [...channels, a.id]
                        : channels.filter((id) => id !== a.id),
                    )
                  }
                />
                <PlatformBadge platform={a.platform} />
                {a.username ?? a.platform}
              </label>
            ))}
          </fieldset>
        </section>
      )}
      {loading ? (
        <p role="status">Loading catalog…</p>
      ) : !groups.length ? (
        <div className="empty-state">
          <h2>Add your first product</h2>
          <p>A name, a product page and a description are enough to start.</p>
        </div>
      ) : (
        <div className="catalog-list">
          {groups.map((group) => {
            const p = group[0],
              active = group.some((v) => v.is_active),
              url = safeExternalUrl(p.landing_url);
            return (
              <article className="panel catalog-card" key={p.landing_url}>
                <div className="section-heading">
                  <div>
                    <h2>{p.title}</h2>
                    <span className="pill">
                      {active ? "Active" : "Archived"}
                    </span>
                  </div>
                  <div className="actions">
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setEditing(group);
                        setChannels(group.map((v) => v.account_id));
                      }}
                    >
                      Edit
                    </Button>
                    <Button disabled={busy} onClick={() => void archive(group)}>
                      {active ? "Archive" : "Restore"}
                    </Button>
                  </div>
                </div>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    {p.landing_url} ↗
                  </a>
                )}
                <p>{p.description}</p>
                <div className="catalog-channel-tags">
                  {group.map((v) => {
                    const a = accounts.find((a) => a.id === v.account_id);
                    return (
                      <span className="pill" key={v.id}>
                        <PlatformBadge platform={a?.platform ?? ""} />
                        {a?.username ?? v.account_id}
                        {!v.is_active ? " · archived" : ""}
                      </span>
                    );
                  })}
                </div>
                {group.some(
                  (v) => v.description !== p.description || v.title !== p.title,
                ) && (
                  <p className="notice">
                    Product details differ across channels. Edit to align them.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
