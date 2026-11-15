import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "../../shared/ui";
import { acceptsTourAction, TOUR_EVENT, tourSteps } from "./tour-model";
export { tourSteps } from "./tour-model";
type Box = { left: number; top: number; width: number; height: number };
export function WorkspaceTour({
  step,
  onNext,
  onBack,
  onDismiss,
  onResume,
  view,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onDismiss: () => void;
  onResume: () => void;
  view: string;
}) {
  const reduce = useReducedMotion(),
    s = tourSteps[step];
  const [followup, setFollowup] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [completed, setCompleted] = useState(false),
    [dialogOpen, setDialogOpen] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLElement>(null);
  const [cardHeight, setCardHeight] = useState(280);
  useEffect(() => {
    if (!card.current) return;
    const observer = new ResizeObserver(() => {
      if (card.current)
        setCardHeight(card.current.getBoundingClientRect().height);
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [dialogOpen]);
  useEffect(() => {
    setCompleted(false);
    const action = (e: Event) => {
      if (acceptsTourAction(step, (e as CustomEvent).detail))
        setCompleted(true);
    };
    window.addEventListener(TOUR_EVENT, action);
    return () => window.removeEventListener(TOUR_EVENT, action);
  }, [step]);
  useEffect(() => {
    if (!s) return;
    let target: HTMLElement | null = null,
      frame = 0;
    setBox(null);
    const measure = () => {
      frame = 0;
      setSize({ width: window.innerWidth, height: window.innerHeight });
      setDialogOpen(!!document.querySelector("dialog[open]"));
      let found =
        view === s.view
          ? document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`)
          : null;
      const nextTarget = found?.dataset.tourNext;
      if (nextTarget)
        found =
          document.querySelector<HTMLElement>(`[data-tour="${nextTarget}"]`) ??
          found;
      if (s.target === "dm-send" && found?.hasAttribute("disabled"))
        found =
          document.querySelector<HTMLElement>('[data-tour="dm-product"]') ??
          found;
      setFollowup(!!nextTarget);
      if (found !== target) {
        if (target) resize.unobserve(target);
        target = found;
        if (target) {
          resize.observe(target);
          target.scrollIntoView({
            block: "center",
            behavior: reduce ? "instant" : "smooth",
          });
        }
      }
      if (!target) {
        setBox(null);
        return;
      }
      const r = target.getBoundingClientRect();
      const left = Math.max(8, r.left - 7),
        top = Math.max(8, r.top - 7);
      const width = Math.min(window.innerWidth - 8, r.right + 7) - left;
      const height = Math.min(window.innerHeight - 8, r.bottom + 7) - top;
      setBox(width > 0 && height > 0 ? { left, top, width, height } : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.querySelector("#root")!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "data-tour", "data-tour-next", "disabled"],
    });
    const reposition = () => {
      target?.scrollIntoView({
        block: "center",
        behavior: reduce ? "instant" : "smooth",
      });
      schedule();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", schedule, true);
    measure();
    title.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, view, s, reduce]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]"))
        onDismiss();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onDismiss]);
  if (!s || dialogOpen) return null;
  const width = Math.min(350, size.width - 24),
    gap = 20,
    estimatedHeight = cardHeight;
  let left = (size.width - width) / 2,
    top = Math.max(12, (size.height - estimatedHeight) / 2);
  if (box) {
    if (
      size.width >= 760 &&
      box.left + box.width + gap + width < size.width - 12
    ) {
      left = box.left + box.width + gap;
      top = box.top;
    } else if (size.width >= 760 && box.left - gap - width >= 12) {
      left = box.left - gap - width;
      top = box.top;
    } else {
      left = Math.min(size.width - width - 12, Math.max(12, box.left));
      top =
        box.top + box.height + gap + estimatedHeight < size.height
          ? box.top + box.height + gap
          : box.top - estimatedHeight - gap;
    }
  }
  top = Math.max(12, Math.min(size.height - estimatedHeight - 12, top));
  const transition = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 280, damping: 30 };
  return createPortal(
    <div className="guided-tour-layer">
      {box && (
        <motion.div
          className="guided-tour-spotlight"
          aria-hidden="true"
          animate={box}
          transition={transition}
          initial={false}
        />
      )}
      <motion.aside
        ref={card}
        className="guided-tour-card"
        aria-label="Guided demo"
        animate={{ left, top, width }}
        transition={transition}
        initial={false}
      >
        <div
          className="guided-tour-progress"
          aria-label={`Step ${step + 1} of ${tourSteps.length}`}
        >
          {tourSteps.map((_, i) => (
            <span key={i} className={i <= step ? "done" : ""} />
          ))}
        </div>
        <div className="guided-tour-top">
          <span>
            GUIDED DEMO · {step + 1}/{tourSteps.length}
          </span>
          <button aria-label="Close guided tour" onClick={onDismiss}>
            ×
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: reduce ? 0 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : -12 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <h2 ref={title} tabIndex={-1}>
              {s.label}
            </h2>
            <p>
              {followup
                ? "Open the highlighted feature request to read the comments behind it."
                : s.text}
            </p>
            {s.action && (
              <div className="guided-tour-feedback" role="status">
                {completed
                  ? "✓ Done — see what changed, then continue."
                  : s.action
                    ? "Try the highlighted action to continue."
                    : ""}
              </div>
            )}
            <div className="guided-tour-actions">
              <Button disabled={step === 0} onClick={onBack}>
                Back
              </Button>
              <Button
                primary
                disabled={view === s.view && !!s.action && !completed}
                onClick={view === s.view ? onNext : onResume}
              >
                {view === s.view ? s.next : "Return to this step"} →
              </Button>
            </div>
            <div className="guided-tour-bottom">
              <button onClick={onDismiss}>End tour</button>
              {s.action && !completed && (
                <button onClick={onNext}>Skip this step →</button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.aside>
    </div>,
    document.body,
  );
}
