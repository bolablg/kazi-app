import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useClerk, useUser } from "@clerk/react";
import {
  ChevronDown,
  Users,
  Settings,
  Plug,
  LogOut,
  UserRound,
  ShieldCheck,
  ExternalLink,
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
    <button onClick={() => void run(() => signOut({ redirectUrl: "/" }))}>
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
            {me.role === "owner" ? "Owner" : me.role}
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
          to="/team"
          onClick={(e) =>
            e.currentTarget.closest("details")?.removeAttribute("open")
          }
        >
          <Users size={15} />
          Team & people
        </Link>
        {!demo && !local && <SignOut />}
        {demo && (
          <span className="account-demo-note">
            Local demo · sign-in not configured
          </span>
        )}
      </div>
    </details>
  );
}
function ManageAccount() {
  const { openUserProfile } = useClerk();
  const { user } = useUser();
  return (
    <>
      <div className="diagnostic-row">
        <span>Username</span>
        <strong>{user?.username ?? "Not set"}</strong>
      </div>
      <button className="button secondary" onClick={() => openUserProfile()}>
        <UserRound size={15} />
        Manage profile & password
        <ExternalLink size={13} />
      </button>
    </>
  );
}
export function AccountSettings() {
  const { state, actorId, demo, local } = useData();
  const me = state.members.find((m) => m.id === actorId)!;
  return (
    <div className="settings-form account-settings">
      <section className="settings-section">
        <h2>My account</h2>
        <div className="account-profile">
          {demo || local ? (
            <Avatar name={me.name} color="blue" />
          ) : (
            <ProfilePhoto />
          )}
          <div>
            <strong>{me.name}</strong>
            <p>{me.email}</p>
          </div>
          <span className="badge neutral">
            {local ? "Local development" : demo ? "Demo account" : "Signed in"}
          </span>
        </div>
        <div className="diagnostic-row">
          <span>Role</span>
          <strong>
            {me.role === "owner" ? "Owner · administrator access" : me.role}
          </strong>
        </div>
        <div className="diagnostic-row">
          <span>Authentication</span>
          <strong>
            {local
              ? "Local development session"
              : demo
                ? "Not configured"
                : "Clerk"}
          </strong>
        </div>
        {!demo && !local && <ManageAccount />}
      </section>
      {demo && (
        <section className="settings-section">
          <h2>Set up sign-in</h2>
          <p>
            This preview uses a sample account. To sign in with your own
            username and password, connect Clerk and Convex. The account owner
            has administrator access.
          </p>
          <ol className="setup-steps">
            <li>
              In Clerk’s User & authentication settings, enable{" "}
              <strong>Username</strong> and <strong>Password</strong>.
            </li>
            <li>Configure the Clerk JWT integration for Convex.</li>
            <li>
              Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> and{" "}
              <code>VITE_CONVEX_URL</code> to the application environment, then
              restart Kazi.
            </li>
          </ol>
          <p className="muted">
            Your own account supplies the credentials. The demo has no shared
            administrator password.{" "}
            <a
              className="text-button"
              href="https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options"
              target="_blank"
              rel="noreferrer"
            >
              Clerk sign-in setup <ExternalLink size={12} />
            </a>
          </p>
        </section>
      )}
      <section className="settings-section">
        <h2>Administration</h2>
        <p>
          Owners and admins manage people and invitations. Every member manages
          their own connected tools and calendar.
        </p>
        <div className="integration-actions">
          <Link to="/team" className="button secondary">
            <ShieldCheck size={15} />
            People & access
          </Link>
          <Link to="/connections" className="button secondary">
            <Plug size={15} />
            Manage connections
          </Link>
        </div>
      </section>
    </div>
  );
}
export function WorkspaceSettings() {
  const { state, actorId } = useData();
  const me = state.members.find((m) => m.id === actorId)!;
  return (
    <div className="settings-form">
      <section className="settings-section">
        <h2>Application details</h2>
        <div className="diagnostic-row">
          <span>Application</span>
          <strong>Kazi</strong>
        </div>
        <div className="diagnostic-row">
          <span>Your role</span>
          <strong>{me.role}</strong>
        </div>
        <div className="diagnostic-row">
          <span>Members</span>
          <strong>{state.members.length}</strong>
        </div>
        <Link className="button secondary" to="/team">
          Manage people & access
        </Link>
      </section>
      <section className="settings-section">
        <h2>Administration</h2>
        <p>
          {["owner", "admin"].includes(me.role)
            ? "You can invite members, grant project access, and revoke membership from People & access."
            : "Contact your owner to change membership or project access."}
        </p>
      </section>
    </div>
  );
}
