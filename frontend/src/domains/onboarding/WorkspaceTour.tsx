import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "../../shared/ui";
export const tourSteps = [
  {
    view: "dashboard",
    label: "Spot the strongest signals",
    text: "Start with the purchase-intent rate and the comments behind your next move.",
    next: "Explore posts",
  },
  {
    view: "posts",
    label: "Open the evidence",
    text: "Use Details ↗ on a post to inspect its metrics and the original comments.",
    next: "Explore insights",
  },
  {
    view: "insights",
    label: "Understand what to fix or build",
    text: "Filter feature requests, objections or problems. Every insight has a source.",
    next: "Try a DM",
  },
  {
    view: "conversations",
    label: "Turn a comment into a measurable action",
    text: "Select a pending DM, Simulate send, then Simulate a click. Check the Tracking tab to see the result.",
    next: "Finish tour",
  },
];
export function WorkspaceTour({
  step,
  onNext,
  onDismiss,
  onResume,
  view,
}: {
  step: number;
  onNext: () => void;
  onDismiss: () => void;
  onResume: () => void;
  view: string;
}) {
  const reduce = useReducedMotion(),
    s = tourSteps[step];
  if (!s) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={step}
        className="workspace-tour"
        aria-label="Guided demo"
        initial={{ opacity: 0, y: reduce ? 0 : -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
      >
        <span className="tour-number">{step + 1}/4</span>
        <div>
          <strong>{s.label}</strong>
          <p>{s.text}</p>
        </div>
        <div className="actions">
          <Button primary onClick={view === s.view ? onNext : onResume}>
            {view === s.view ? s.next : "Continue tour"} →
          </Button>
          <button className="text-link small" onClick={onDismiss}>
            Skip tour
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
