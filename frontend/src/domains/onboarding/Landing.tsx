import { PlatformBadge } from "../../shared/PlatformBadge";
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
          <span className="pill">PERFORMANCE. STRATEGY. COMMUNITY.</span>
          <h1>
            Turn social attention
            <br />
            into product demand.
          </h1>
          <p>
            Find your strongest posts, understand what makes people buy, and
            start the conversations that bring them to your product.
          </p>
          <div className="actions">
            <Button primary onClick={onDemo}>
              Start the guided demo →
            </Button>
            <Button onClick={onStart}>Connect my channels</Button>
          </div>
          <small>No account or API key needed for the demo.</small>
          <div className="platform-strip">
            {["instagram", "linkedin", "tiktok", "facebook", "twitter"].map(
              (platform) => <PlatformBadge key={platform} platform={platform} label />,
            )}
          </div>
        </section>
        <section id="product" className="landing-preview">
          <div className="preview-top">
            <span className="wordmark">signal</span>
            <span className="pill">From performance to action</span>
          </div>
          <div className="preview-grid">
            <div>
              <span className="eyebrow">YOUR NEXT MOVE</span>
              <h2>
                Your best post.
                <br />
                Your next opportunity.
              </h2>
              <p>
                See which content creates buying intent. Use the comments to
                choose what to promote, what to say next, and who to follow up
                with.
              </p>
              <Button primary onClick={onDemo}>
                Start the guided demo ↗
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
          <h2>Understand what works. Decide what’s next. Take action.</h2>
          <div className="value-grid">
            {[
              [
                "posts",
                "Analyze performance and buying intent",
                "Compare your posts across channels. Find the content that attracts interested prospects, beyond views and likes.",
              ],
              [
                "insights",
                "Guide your commercial strategy",
                "Turn objections, product requests and customer feedback into clearer offers and better content decisions.",
              ],
              [
                "conversations",
                "Activate your community",
                "Follow up on eligible comments with personalized DMs. Guide interested people to your product and track their clicks.",
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
          <h2>One brand. Every channel. A clear next step.</h2>
          <div className="value-grid">
            {[
              [
                "01",
                "Connect your channels",
                "Start with your social accounts. Brand context is optional.",
              ],
              [
                "02",
                "Find your opportunities",
                "See your strongest posts and open each product insight to read the comments behind it.",
              ],
              [
                "03",
                "Start the right conversation",
                "Use your product context to prepare DMs, review them, and follow the clicks they generate.",
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
          <h2>Your questions, answered.</h2>
          {[
            [
              "Does purchase intent mean a sale?",
              "No. It is a comment-classification signal. Revenue needs separate product tracking.",
            ],
            [
              "Can I try this without an Instagram account?",
              "Yes. Try the full guided journey: connect sample channels, explore posts and insights, send a simulated DM and see its click in tracking.",
            ],
            [
              "Can I send real DMs?",
              "Yes, from a connected account: save your product, configure Auto-DM on a post, then process or approve its messages. The offline demo simulates the same workflow without sending anything.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="landing-cta">
          <h2>Your next opportunity is already in your comments.</h2>
          <Button primary onClick={onDemo}>
            Try the complete demo →
          </Button>
        </section>
      </main>
      <footer>
        <span className="wordmark">signal</span>
        <p>Understand demand. Guide your strategy. Activate your community.</p>
        <button className="text-link" onClick={onResume}>
          Open workspace ↗
        </button>
      </footer>
    </div>
  );
}
