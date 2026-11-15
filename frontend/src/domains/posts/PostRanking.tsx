import type { PostIntentStats, PostSortKey } from "../../api/types";
import { formatCount, formatDate, formatPercent, formatScore, truncate } from "../../shared/format";
import { IntentBar } from "./IntentBar";

export const SORT_LABELS: Record<PostSortKey, string> = {
  intent_score: "Intent Score",
  purchase_intent_rate: "Purchase Intent Rate",
  buying_signal_rate: "Signaux d'achat",
  comments: "Commentaires",
  likes: "Likes",
  views: "Vues",
  shares: "Partages",
  recent: "Plus récents",
};

interface Props {
  stats: PostIntentStats[];
  selectedId: number | null;
  onSelect: (postId: number) => void;
}

/** F5: the posts sorted from the best to the worst Intent Score. */
export function PostRanking({ stats, selectedId, onSelect }: Props) {
  if (stats.length === 0) {
    return (
      <div className="empty">
        Aucun post. Importez un compte ou chargez les données de démo.
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="ranking">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Post</th>
            <th scope="col" className="num" title="(achat × 3 + question × 2 + objection) ÷ commentaires">
              Intent Score
            </th>
            <th scope="col" className="num" title="Commentaires « achat » ÷ commentaires">
              PIR
            </th>
            <th scope="col">Intentions</th>
            <th scope="col" className="num metric">Vues</th>
            <th scope="col" className="num metric">Likes</th>
            <th scope="col" className="num metric">Comm.</th>
            <th scope="col" className="num metric">Partages</th>
            <th scope="col" className="num metric">Reposts</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr
              key={s.post.id}
              className={s.post.id === selectedId ? "is-selected" : undefined}
              onClick={() => onSelect(s.post.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.post.id)}
              tabIndex={0}
              aria-selected={s.post.id === selectedId}
            >
              <td className="rank">{s.rank}</td>
              <td>
                <div className="post-cell">
                  {s.post.picture ? (
                    <img className="thumb" src={s.post.picture} alt="" loading="lazy" />
                  ) : (
                    <div className="thumb thumb--empty" />
                  )}
                  <div>
                    <div className="caption">{truncate(s.post.caption || "(sans texte)", 80)}</div>
                    <div className="muted small">
                      {formatDate(s.post.created_time)} · {s.total_comments} comm. audience
                      {s.unclassified_comments > 0 && ` · ${s.unclassified_comments} en cours`}
                      {s.needs_review > 0 && <span className="warn"> · {s.needs_review} à valider</span>}
                    </div>
                  </div>
                </div>
              </td>
              <td className="num strong">{formatScore(s.intent_score)}</td>
              <td className="num">{formatPercent(s.purchase_intent_rate)}</td>
              <td className="bar-cell">
                <IntentBar counts={s.intent_counts} total={s.total_comments} />
              </td>
              <td className="num metric">{formatCount(s.post.view_count)}</td>
              <td className="num metric">{formatCount(s.post.like_count)}</td>
              <td className="num metric">{formatCount(s.post.comment_count)}</td>
              <td className="num metric">{formatCount(s.post.share_count)}</td>
              <td className="num metric">{formatCount(s.post.repost_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
