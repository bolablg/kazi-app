import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { Brand } from "./Brand";
import { BrandAttribution } from "./BrandAttribution";
import "./welcome.css";

const days = [
  { day: "Mon", title: "Focus", tone: "orange", position: 1 },
  { day: "Tue", title: "Create", tone: "pink", position: 2 },
  { day: "Wed", title: "Review", tone: "blue", position: 0 },
  { day: "Thu", title: "Focus", tone: "orange", position: 2 },
  { day: "Fri", title: "Review", tone: "blue", position: 1 },
];

/** Shared presentation only: each caller retains its own authentication flow. */
export function WelcomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="welcome-page">
      <a className="skip-link" href="#welcome-sign-in">
        Skip to sign in
      </a>
      <header className="welcome-header">
        <a className="welcome-brand" href="/" aria-label="Kazi home">
          <Brand />
        </a>
        <a className="welcome-privacy" href="/privacy">
          Privacy policy
        </a>
      </header>
      <main className="welcome-main">
        <section className="welcome-story" aria-label="Welcome to Kazi">
          <div className="welcome-story-copy">
            <h2>
              Your day.
              <br />
              <span>In motion.</span>
            </h2>
            <p className="welcome-story-caption">Make room for what matters.</p>
          </div>
          <div className="welcome-week" aria-hidden="true">
            <div className="welcome-week-heading">
              <span>
                <CalendarDays size={17} /> A week in motion
              </span>
              <span className="welcome-week-indicators">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="welcome-week-grid">
              {days.map(({ day, title, tone, position }) => (
                <div className="welcome-week-day" key={day}>
                  <span>{day}</span>
                  <div className="welcome-week-hours">
                    {Array.from({ length: 4 }, (_, row) => (
                      <div className="welcome-week-hour" key={row} />
                    ))}
                    <div
                      className={`welcome-week-event ${tone}`}
                      style={{ top: `${position * 22 + 8}%` }}
                    >
                      <span className="welcome-week-event-dot" />
                      <strong>{title}</strong>
                      <span className="welcome-week-event-line" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          className="welcome-sign-in"
          id="welcome-sign-in"
          tabIndex={-1}
          aria-label="Sign in to Kazi"
        >
          <div className="welcome-sign-in-content">{children}</div>
        </section>
      </main>
      <BrandAttribution />
    </div>
  );
}
