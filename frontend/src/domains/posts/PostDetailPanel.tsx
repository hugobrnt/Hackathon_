import { useMemo, useState } from "react";
import type { Intent, Message, PostDetail } from "../../api/types";
import { formatCount, formatDate, formatPercent, formatScore } from "../../shared/format";
import { IntentBadge } from "./IntentBar";
import { INTENT_LABELS, INTENT_ORDER, SENTIMENT_LABELS } from "./intents";

interface Props {
  detail: PostDetail;
  onClose: () => void;
}

/** F6: intent breakdown, key comments and all the comments of one post. */
export function PostDetailPanel({ detail, onClose }: Props) {
  const [filter, setFilter] = useState<Intent | "all">("all");
  const { post } = detail;
  const audience = detail.comments.filter((c) => !c.author_is_owner);
  const visible = useMemo(
    () => (filter === "all" ? detail.comments : detail.comments.filter((c) => c.classification?.intent === filter)),
    [detail.comments, filter],
  );
  const maxCount = Math.max(1, ...INTENT_ORDER.map((i) => detail.intent_counts[i]));

  return (
    <aside className="detail" aria-label="Détail du post">
      <header className="detail__header">
        <div className="post-cell">
          {post.picture ? <img className="thumb thumb--lg" src={post.picture} alt="" /> : null}
          <div>
            <p className="caption">{post.caption || "(sans texte)"}</p>
            <p className="muted small">
              {formatDate(post.created_time)}
              {post.permalink && (
                <>
                  {" · "}
                  <a href={post.permalink} target="_blank" rel="noreferrer">
                    Voir sur {post.platform}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Fermer le détail">
          ✕
        </button>
      </header>

      <section className="kpis" aria-label="KPIs">
        <Kpi label="Intent Score" value={formatScore(detail.intent_score)} hint="sur 3" strong />
        <Kpi label="Purchase Intent Rate" value={formatPercent(detail.purchase_intent_rate)} />
        <Kpi label="Signaux d'achat" value={formatPercent(detail.buying_signal_rate)} hint="achat + questions" />
        <Kpi label="À valider" value={String(detail.needs_review)} />
      </section>

      <section className="metrics" aria-label="Métriques de la plateforme">
        <Metric label="Vues" value={post.view_count} />
        <Metric label="Likes" value={post.like_count} />
        <Metric label="Commentaires" value={post.comment_count} />
        <Metric label="Partages" value={post.share_count} />
        <Metric label="Reposts" value={post.repost_count} />
      </section>

      <section>
        <h3>Répartition des intentions</h3>
        <p className="muted small">
          {detail.classified_comments} / {detail.total_comments} commentaires de l'audience classés
        </p>
        <ul className="breakdown">
          {INTENT_ORDER.map((intent) => (
            <li key={intent}>
              <button
                type="button"
                className={`breakdown__row${filter === intent ? " is-active" : ""}`}
                onClick={() => setFilter(filter === intent ? "all" : intent)}
                aria-pressed={filter === intent}
              >
                <span className="breakdown__label">{INTENT_LABELS[intent]}</span>
                <span className="breakdown__track">
                  <span
                    className={`breakdown__fill intent--${intent}`}
                    style={{ width: `${(detail.intent_counts[intent] / maxCount) * 100}%` }}
                  />
                </span>
                <span className="num">{detail.intent_counts[intent]}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Sentiment :{" "}
          {(["positive", "neutral", "negative"] as const)
            .map((s) => `${SENTIMENT_LABELS[s]} ${detail.sentiment_counts[s]}`)
            .join(" · ")}
        </p>
      </section>

      <section>
        <h3>Commentaires clés</h3>
        {detail.key_comments.length === 0 ? (
          <p className="muted">Aucun signal d'achat, aucune question ni objection sur ce post.</p>
        ) : (
          <ul className="comments">
            {detail.key_comments.map((c) => (
              <CommentItem key={c.id} comment={c} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="section-title">
          <h3>Tous les commentaires ({filter === "all" ? audience.length : visible.length})</h3>
          {filter !== "all" && (
            <button type="button" className="btn btn--ghost small" onClick={() => setFilter("all")}>
              Retirer le filtre « {INTENT_LABELS[filter]} »
            </button>
          )}
        </div>
        <ul className="comments">
          {visible.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </ul>
      </section>
    </aside>
  );
}

function Kpi({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`kpi${strong ? " kpi--strong" : ""}`}>
      <div className="kpi__value">{value}</div>
      <div className="kpi__label">{label}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="metric-tile">
      <span className="metric-tile__value">{formatCount(value)}</span>
      <span className="muted small">{label}</span>
    </div>
  );
}

function CommentItem({ comment }: { comment: Message }) {
  const c = comment.classification;
  return (
    <li className={`comment${comment.parent_external_id ? " comment--reply" : ""}`}>
      <div className="comment__head">
        <strong>{comment.author_name ?? "Inconnu"}</strong>
        {comment.author_is_owner && <span className="badge badge--owner">Vous</span>}
        {c && <IntentBadge intent={c.intent} />}
        {c?.needs_review && <span className="badge badge--warn">À valider</span>}
        <span className="muted small">{formatDate(comment.created_time)}</span>
      </div>
      <p className="comment__text">{comment.text}</p>
      {c && (
        <p className="muted small">
          {SENTIMENT_LABELS[c.sentiment]} · confiance {Math.round(c.confidence * 100)} % · {c.rationale}
        </p>
      )}
      {!c && !comment.author_is_owner && <p className="muted small">Classification en cours…</p>}
    </li>
  );
}
