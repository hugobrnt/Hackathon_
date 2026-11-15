export const TOUR_KEY = "signal:demo:tour:v2";
export const TOUR_EVENT = "signal:demo:tour-action";
export type TourAction = "feature-request" | "dm-sent" | "link-clicked";
export const tourSteps: {
  view: string;
  target: string;
  label: string;
  text: string;
  next: string;
  action?: TourAction;
  tab?: string;
}[] = [
  {
    view: "dashboard",
    target: "dashboard-signals",
    label: "Find buying signals",
    text: "This rate shows how many comments express buying intent. Start with the count behind it.",
    next: "Find the best post",
  },
  {
    view: "posts",
    target: "post-ranking",
    label: "Choose what to promote",
    text: "Compare posts across all channels, or filter to one channel. Open Details ↗ for metrics and comments.",
    next: "Understand your audience",
  },
  {
    view: "insights",
    target: "insights-channels",
    label: "One product. Every channel.",
    text: "Insights combine your channels. Use this filter or expand the breakdown to isolate a channel.",
    next: "Find a product request",
  },
  {
    view: "insights",
    target: "feature-filter",
    label: "What should you build next?",
    text: "Click Feature request to reveal the comments behind product requests.",
    next: "Try a conversation",
    action: "feature-request",
  },
  {
    view: "conversations",
    tab: "inbox",
    target: "dm-send",
    label: "Turn intent into a conversation",
    text: "Read the draft, then click Simulate send. No real message leaves this demo.",
    next: "Follow the link",
    action: "dm-sent",
  },
  {
    view: "conversations",
    tab: "inbox",
    target: "dm-click",
    label: "Follow a prospect’s next step",
    text: "Click Simulate a click to record a sample visit from this DM.",
    next: "See the result",
    action: "link-clicked",
  },
  {
    view: "conversations",
    tab: "tracking",
    target: "dm-tracking",
    label: "See what your DMs generated",
    text: "Sent DMs, clicked links and click-through rate update from your actions. You’ve completed the journey.",
    next: "Finish tour",
  },
];
export function acceptsTourAction(step: number, action: unknown) {
  return !!tourSteps[step]?.action && tourSteps[step].action === action;
}
export function reportTourAction(action: TourAction) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: action }));
}
