import type { Intent } from "../../api/types";
import { INTENT_LABELS, INTENT_ORDER } from "./intents";

interface Props {
  counts: Record<Intent, number>;
  total: number;
}

/** Stacked bar of the intents of a post. The unclassified part stays empty. */
export function IntentBar({ counts, total }: Props) {
  if (total === 0) return <div className="intent-bar intent-bar--empty" aria-label="Aucun commentaire" />;
  const label = INTENT_ORDER.filter((i) => counts[i] > 0)
    .map((i) => `${INTENT_LABELS[i]} : ${counts[i]}`)
    .join(", ");
  return (
    <div className="intent-bar" role="img" aria-label={label} title={label}>
      {INTENT_ORDER.map((intent) =>
        counts[intent] > 0 ? (
          <span
            key={intent}
            className={`intent-bar__part intent--${intent}`}
            style={{ width: `${(counts[intent] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

export function IntentBadge({ intent }: { intent: Intent }) {
  return <span className={`badge intent--${intent}`}>{INTENT_LABELS[intent]}</span>;
}
