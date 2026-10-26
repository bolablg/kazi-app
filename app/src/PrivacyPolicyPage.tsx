import { useEffect } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Mail,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./Brand";
import { BrandAttribution } from "./BrandAttribution";
import {
  privacyProfile,
  privacySections,
  type PrivacyBlock,
} from "../shared/privacyPolicy";

function PolicyBlock({ block }: { block: PrivacyBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "definitions":
      return (
        <dl className="privacy-definitions">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      );
    case "links":
      return (
        <ul className="privacy-resource-links">
          {block.items.map((item) => (
            <li key={item.href}>
              <a href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      );
  }
}

function Contents({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      aria-label={
        mobile ? "Mobile privacy policy contents" : "Privacy policy contents"
      }
    >
      <ol>
        {privacySections.map((section, index) => (
          <li key={section.id}>
            <a
              href={"#" + section.id}
              onClick={(event) =>
                event.currentTarget.closest("details")?.removeAttribute("open")
              }
            >
              <span aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PrivacyPolicyPage() {
  const draft = privacyProfile.status === "draft";
  useEffect(() => {
    const title = document.title;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = description?.content;
    const previousRobots = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const robots = previousRobots ?? document.createElement("meta");
    const previousRobotsContent = robots.content;
    robots.name = "robots";
    if (draft) robots.content = "noindex, follow";
    if (!previousRobots) document.head.append(robots);
    document.title = "Privacy policy · Kazi";
    if (description)
      description.content =
        "How Kazi handles account information, workspaces, calendars, connected agents, usage data, and your privacy rights.";
    return () => {
      document.title = title;
      if (description && previousDescription !== undefined)
        description.content = previousDescription;
      if (previousRobots) robots.content = previousRobotsContent;
      else robots.remove();
    };
  }, [draft]);
  return (
    <div className="privacy-page">
      <a className="privacy-skip" href="#privacy-content">
        Skip to policy
      </a>
      <header className="privacy-header">
        <a href="/" aria-label="Kazi home">
          <Brand />
        </a>
        <a className="privacy-open-app" href="/">
          Open Kazi
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </header>
      <main id="privacy-content" className="privacy-main">
        <div className="privacy-intro">
          <span className="privacy-eyebrow">
            <ShieldCheck size={16} aria-hidden="true" />
            Trust &amp; privacy
          </span>
          <h1>Privacy policy</h1>
          <p className="privacy-lead">
            Your work deserves clear boundaries. Here is how Kazi handles
            information, who can access it, and the choices available to you.
          </p>
          <div className="privacy-meta">
            <span className="privacy-draft-label">
              {draft ? "Draft for review" : "Privacy notice"}
            </span>
            <span>
              Prepared{" "}
              <time dateTime={privacyProfile.preparedOn}>
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(privacyProfile.preparedOn + "T12:00:00Z"))}
              </time>
            </span>
            <button type="button" onClick={() => window.print()}>
              <Printer size={15} aria-hidden="true" />
              Print or save
            </button>
          </div>
        </div>
        {draft && (
          <aside className="privacy-draft-notice" aria-label="Draft status">
            <strong>Prepared for legal and operational review</strong>
            <p>
              This draft describes Kazi's current features and proposed privacy
              commitments. Confirm provider locations, transfer agreements,
              retention and deletion procedures, and the adults-only eligibility
              rule before publishing it as an effective policy.
            </p>
          </aside>
        )}
        <div className="privacy-summary" aria-label="Privacy at a glance">
          <div>
            <strong>Your work stays within its access rules</strong>
            <p>
              Workspace permissions and the connections you authorize determine
              sharing.
            </p>
          </div>
          <div>
            <strong>Adoption counts have a limited purpose</strong>
            <p>
              Understand feature use without analyzing private task, file, or
              calendar contents.
            </p>
          </div>
          <div>
            <strong>You have a direct privacy contact</strong>
            <a
              href={`mailto:${privacyProfile.email}?subject=Kazi%20privacy%20request`}
            >
              <Mail size={15} aria-hidden="true" />
              Contact Bolaji BALOGOUN
            </a>
          </div>
        </div>
        <details className="privacy-mobile-contents">
          <summary>
            On this page
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <Contents mobile />
        </details>
        <div className="privacy-layout">
          <aside className="privacy-contents">
            <strong>On this page</strong>
            <Contents />
          </aside>
          <article className="privacy-article" aria-label="Kazi privacy policy">
            {privacySections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="privacy-section"
                aria-labelledby={section.id + "-heading"}
              >
                <h2 id={section.id + "-heading"}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </h2>
                {section.blocks.map((block, blockIndex) => (
                  <PolicyBlock key={blockIndex} block={block} />
                ))}
              </section>
            ))}
          </article>
        </div>
        <footer className="privacy-footer">
          <span>Kazi · Work management for people, teams, and agents.</span>
          <a
            href={`mailto:${privacyProfile.email}?subject=Kazi%20privacy%20request`}
          >
            Privacy contact
          </a>
          <a href="#privacy-content">Back to top</a>
        </footer>
      </main>
      <BrandAttribution />
    </div>
  );
}
