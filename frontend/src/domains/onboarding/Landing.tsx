import { SOCIAL_PLATFORMS } from "../../shared/platforms";
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
          <Button onClick={onResume}>Sign in</Button>
          <Button primary onClick={onStart}>
            Create an account
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
              Guided demo →
            </Button>
            <Button onClick={onStart}>Create an account</Button>
          </div>
          <div className="platform-strip">
            {SOCIAL_PLATFORMS.map(([platform]) => (
              <PlatformBadge key={platform} platform={platform} label />
            ))}
          </div>
          <small>Connections powered by Zernio · Snapchat in closed beta</small>
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
                Explore Signal ↗
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
              "What can I learn from my audience?",
              "Discover buying signals, recurring questions, objections and feature requests. Open each insight to read the comments behind it and decide what to improve or say next.",
            ],
            [
              "Can I manage several social channels?",
              "Yes. Connect your brand’s channels in one workspace, then filter by channel or post. Available metrics and messaging features depend on each platform.",
            ],
            [
              "Do I stay in control of replies?",
              "Yes. Review drafts before sending, or enable automatic replies on eligible posts. Choose your tone and goal, and flag topics that should come back to you.",
            ],
            [
              "How does Signal find my strongest posts?",
              "Signal combines performance with the buying interest expressed in comments. Compare purchase intent rates, inspect the comments and boost the posts worth promoting.",
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
          <Button primary onClick={onStart}>
            Create an account →
          </Button>
        </section>
      </main>
      <footer>
        <span className="wordmark">signal</span>
        <p>Understand demand. Guide your strategy. Activate your community.</p>
        <button className="text-link" onClick={onResume}>
          Sign in ↗
        </button>
      </footer>
    </div>
  );
}
