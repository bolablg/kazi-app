import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { UserProfile, useClerk, useUser } from "@clerk/react";
import { AccountIdentityContext } from "./IdentityScreens";
import { prepareIdentitySignOut } from "./identityConfig";
import {
  ChevronDown,
  Users,
  Settings,
  Plug,
  LogOut,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { useData } from "./data";
import { Avatar, useUI } from "./components";

function ProfilePhoto() {
  const { user } = useUser();
  return user?.imageUrl ? (
    <img className="profile-photo" src={user.imageUrl} alt="Your profile" />
  ) : (
    <UserRound size={24} />
  );
}
function SignOut() {
  const { signOut } = useClerk();
  const { run } = useUI();
  return (
    <button
      onClick={() =>
        void run(() => {
          prepareIdentitySignOut();
          return signOut({ redirectUrl: "/" });
        })
      }
    >
      <LogOut size={15} />
      Sign out
    </button>
  );
}
export function AccountMenu() {
  const { state, actorId, demo, local } = useData();
  const me = state.members.find((m) => m.id === actorId)!;
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node))
        menu.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="account-menu" ref={menu}>
      <summary aria-label="User menu">
        {demo || local ? (
          <Avatar name={me.name} color="blue" />
        ) : (
          <ProfilePhoto />
        )}
        <span className="account-menu-name">
          <strong>{me.name}</strong>
          <small>
            {local ? "Local development" : demo ? "Demo account" : me.email}
          </small>
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="account-popover">
        <div className="account-popover-header">
          <strong>{me.name}</strong>
          <span>{me.email}</span>
          <small className="role-badge">
            {me.role === "owner"
              ? "Owner"
              : me.role === "admin"
                ? "Manager"
                : me.role}
          </small>
        </div>
        <Link
          to="/settings?tab=account"
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <UserRound size={15} />
          My account
        </Link>
        <Link
          to="/settings"
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <Settings size={15} />
          Settings
        </Link>
        <Link
          to="/connections"
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <Plug size={15} />
          Connections
        </Link>
        <Link
          to="/teams"
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <Users size={15} />
          Team & people
        </Link>
        {!demo && !local && <SignOut />}
        <Link
          to="/privacy"
          onClick={(event) =>
            event.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <ShieldCheck size={15} />
          Privacy policy
        </Link>
        {demo && (
          <span className="account-demo-note">
            Local demo · sign-in not configured
          </span>
        )}
      </div>
    </details>
  );
}
export function AccountSettings() {
  const { state, actorId, demo, local } = useData();
  const me = state.members.find((member) => member.id === actorId)!;
  if (!demo && !local)
    return (
      <section
        className="embedded-account-profile"
        aria-label="Account profile and security"
      >
        <AccountIdentityContext />
        <UserProfile
          routing="hash"
          fallback={<p role="status">Loading your account…</p>}
          appearance={{
            variables: {
              colorPrimary: "#8A3C0C",
              colorForeground: "#111111",
              colorMutedForeground: "#55565C",
              fontFamily: '"Atlassian Sans", sans-serif',
              borderRadius: "0.5rem",
            },
            elements: {
              rootBox: { width: "100%", maxWidth: "none" },
              cardBox: {
                width: "100%",
                maxWidth: "none",
                boxShadow: "none",
                border: "0",
                borderRadius: "0",
              },
              card: {
                boxShadow: "none",
                borderRadius: "0",
                backgroundColor: "#fff",
              },
              navbar: {
                backgroundColor: "#fff9f5",
                borderRight: "1px solid #e5e8ee",
                boxShadow: "none",
              },
              scrollBox: { borderRadius: "0", boxShadow: "none" },
              pageScrollBox: { backgroundColor: "#fff" },
              navbarButton: {
                minHeight: "44px",
                borderRadius: "8px",
                padding: "10px 12px",
              },
            },
          }}
        />
      </section>
    );
  return (
    <div className="settings-form account-settings">
      <section className="settings-section">
        <h2>My account</h2>
        <div className="account-profile account-identity">
          <Avatar name={me.name} color="blue" />
          <div>
            <strong>{me.name}</strong>
            <p>{me.email}</p>
          </div>
          <span className="badge neutral">
            {local ? "Local development" : "Demo account"}
          </span>
        </div>
        <dl className="account-identity-details">
          <div>
            <dt>Email</dt>
            <dd>{me.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>
              {me.role === "owner"
                ? "Owner"
                : me.role === "admin"
                  ? "Manager"
                  : me.role}
            </dd>
          </div>
        </dl>
        <p className="inline-info">
          {local ? "This local development session" : "This demo"} uses a sample
          account. Profile and security settings are available when you sign in
          to Kazi.
        </p>
      </section>
    </div>
  );
}
