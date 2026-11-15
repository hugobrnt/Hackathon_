import { Button, Icon } from "../../shared/ui";
export function Landing({
  onDemo,
  onStart,
  onResume,
}: {
  onDemo: () => void;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <a href="#/landing" className="wordmark">
          signal
        </a>
        <div className="landing-links">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#questions">FAQ</a>
        </div>
        <div className="actions">
          <Button onClick={onResume}>Open workspace</Button>
          <Button primary onClick={onStart}>
            Connect my channels
          </Button>
        </div>
      </nav>
      <main>
        <section className="hero">
          <span className="pill">SOCIAL INTELLIGENCE. REAL NEXT STEPS.</span>
          <h1>
            Find buying signals.
            <br />
            Act on what people say.
          </h1>
          <p>
            Spot high-intent posts, uncover product feedback and understand what
            your audience wants next.
          </p>
          <div className="actions">
            <Button primary onClick={onDemo}>
              Explore the demo →
            </Button>
            <Button onClick={onStart}>Connect my channels</Button>
          </div>
          <small>No account or API key needed for the demo.</small>
          <div className="platform-strip">
            <Icon name="instagram" />
            <span>Instagram</span>
            <Icon name="linkedin" />
            <span>LinkedIn</span>
            <span>TikTok</span>
            <span>Facebook</span>
            <span>X</span>
          </div>
        </section>
        <section id="product" className="landing-preview">
          <div className="preview-top">
            <span className="wordmark">signal</span>
            <span className="pill">A closer look at your audience</span>
          </div>
          <div className="preview-grid">
            <div>
              <span className="eyebrow">YOUR NEXT MOVE</span>
              <h2>
                More than a popular post.
                <br />A useful signal.
              </h2>
              <p>
                Understand why a specific product demo brings people closer to
                trying your product.
              </p>
              <Button primary onClick={onDemo}>
                Explore the dashboard ↗
              </Button>
            </div>
            <div className="preview-metrics">
              <div>
                <small>PURCHASE INTENT RATE</small>
                <strong>24.0%</strong>
                <span>12 of 50 audience comments · Example post</span>
              </div>
              <blockquote>
                “Where can I try this before my interview?”
                <small>Purchase intent · Source comment</small>
              </blockquote>
              <div className="preview-bars">
                <span style={{ width: "90%" }} />
                <span style={{ width: "56%" }} />
                <span style={{ width: "38%" }} />
              </div>
            </div>
          </div>
        </section>
        <section className="landing-section">
          <h2>From audience noise to your next move.</h2>
          <div className="value-grid">
            {[
              [
                "posts",
                "Find posts with buying signals",
                "Rank content by intent and volume. Understand which formats deserve another test.",
              ],
              [
                "insights",
                "Hear what your audience needs",
                "Find praise, objections, feature requests and problems, with the original comments.",
              ],
              [
                "analytics",
                "See what changes over time",
                "Track expressed intent without confusing comments, clicks and actual purchases.",
              ],
            ].map(([icon, title, text]) => (
              <article className="panel" key={title}>
                <Icon name={icon} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-section subtle" id="how-it-works">
          <h2>Your brand. Your channels. Your next decision.</h2>
          <div className="value-grid">
            {[
              [
                "01",
                "Connect your channels",
                "Start with your social accounts. Brand context is optional.",
              ],
              [
                "02",
                "Import and analyze",
                "Bring in posts, metrics and comments. See the classification behind each signal.",
              ],
              [
                "03",
                "Act on the evidence",
                "Explore top posts, investigate requests and make better content decisions.",
              ],
            ].map(([n, t, s]) => (
              <article key={n}>
                <span className="eyebrow">{n}</span>
                <h3>{t}</h3>
                <p>{s}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-section faq" id="questions">
          <h2>A few things before you connect.</h2>
          {[
            [
              "Does purchase intent mean a sale?",
              "No. It is a comment-classification signal. Revenue needs separate product tracking.",
            ],
            [
              "Can I try this without an Instagram account?",
              "Yes. The offline demo includes posts, source comments and classifications. It makes no API calls.",
            ],
            [
              "Does this version send automatic DMs?",
              "Not yet. The demo includes a clearly marked conversation simulation. Live sending and advertising require the next backend modules.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="landing-cta">
          <h2>Your audience is already telling you something.</h2>
          <Button primary onClick={onDemo}>
            See what the signals say →
          </Button>
        </section>
      </main>
      <footer>
        <span className="wordmark">signal</span>
        <p>Intent. Insights. Better decisions.</p>
        <button className="text-link" onClick={onResume}>
          Open workspace ↗
        </button>
      </footer>
    </div>
  );
}
