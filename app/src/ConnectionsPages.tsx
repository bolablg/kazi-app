import { tokenScopes, scopeLabels } from "../shared/capabilities";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  KeyRound,
  Plus,
  Plug,
  Terminal,
} from "lucide-react";
import { useData, type Data } from "./data";
import { Modal, useUI } from "./components";
const endpoint = () => {
  const configured = import.meta.env.VITE_CONVEX_SITE_URL;
  if (configured) return configured.replace(/\/$/, "") + "/mcp";
  const backend = new URL(
    import.meta.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210",
  );
  if (["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname))
    backend.port = "3211";
  else
    backend.hostname = backend.hostname.replace(
      /\.convex\.cloud$/,
      ".convex.site",
    );
  return backend.origin + "/mcp";
};
const dateTime = (at?: number) =>
  at ? new Date(at).toLocaleString() : "Never used";
const credentialStatus = (t: Data["tokens"][number]) =>
  t.revoked ? "Revoked" : t.expiresAt <= Date.now() ? "Expired" : "Active";
export function ConnectionsOverview() {
  const { state, actorId, demo, tokens } = useData();
  const cal = state.calendars.find((c) => c.ownerId === actorId);
  const agents = tokens.filter((t) => t.lastUsedAt);
  return (
    <div className="settings-form connections-overview">
      <section className="settings-section">
        <h2>Your connections</h2>
        <p>Manage access to your calendar and the tools that use Kazi.</p>
        <Link className="connection-item" to="/connections?tab=calendar">
          <span className="service-icon calendar">
            <CalendarDays size={21} />
          </span>
          <span>
            <strong>Kazi agenda</strong>
            <small>
              Calendar subscriptions and optional external availability
            </small>
          </span>
          <span className="connection-status">
            <i
              className={
                ["native", "connected"].includes(cal?.status ?? "")
                  ? "connected"
                  : ""
              }
            />
            {cal?.status === "demo"
              ? "Demo calendar"
              : ["native", "connected"].includes(cal?.status ?? "")
                ? "Connected"
                : "Not connected"}
          </span>
          <ArrowUpRight size={15} />
        </Link>
        <Link className="connection-item" to="/connections?tab=mcp">
          <span className="service-icon">
            <Plug size={21} />
          </span>
          <span>
            <strong>MCP server</strong>
            <small>Connect Codex, Claude Code, and other MCP clients</small>
          </span>
          <span className="connection-status">
            <i />
            {demo ? "Not configured" : "Configured"}
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className="settings-section">
        <div className="section-line">
          <h2>Agents & clients</h2>
          <Link className="text-button" to="/connections?tab=mcp">
            Manage access <ArrowUpRight size={13} />
          </Link>
        </div>
        <AgentTable />
        <p className="muted settings-footnote">
          {agents.length} clients seen ·{" "}
          {tokens.filter((t) => credentialStatus(t) === "Active").length} active
          credentials. Last seen records authenticated requests; it does not
          indicate a persistent connection.
        </p>
      </section>
      {demo && (
        <div className="setup-notice">
          <Terminal size={18} />
          <div>
            <strong>Connections are not live in this demo</strong>
            <p>
              Connect Clerk and Convex to create MCP credentials. Google
              availability is optional and needs Google OAuth configuration.
            </p>
            <Link className="text-button" to="/settings?tab=account">
              Set up your account <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
function AgentTable() {
  const { tokens } = useData();
  const seen = tokens.filter((t) => t.lastUsedAt);
  return seen.length ? (
    <div className="connection-table-wrap">
      <table className="connection-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Credential</th>
            <th>Last seen</th>
            <th>Last tool</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {seen.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{t.clientName ?? "Unidentified client"}</strong>
                <small>
                  {t.clientVersion
                    ? `Version ${t.clientVersion} · reported by client`
                    : "No client name reported"}
                </small>
              </td>
              <td>{t.label}</td>
              <td>{dateTime(t.lastUsedAt)}</td>
              <td>
                <code>{t.lastTool ?? "—"}</code>
              </td>
              <td>
                <span className="badge neutral">{credentialStatus(t)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="connection-empty">
      <Plug size={22} />
      <div>
        <strong>No agents connected yet</strong>
        <p>
          Create a credential, then use it in your MCP client. The client will
          appear here after its first authenticated request.
        </p>
      </div>
    </div>
  );
}
export function McpSettings() {
  const { demo, mintToken, tokens, revokeToken, online } = useData();
  const { run } = useUI();
  const [open, setOpen] = useState(false),
    [token, setToken] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <div className="settings-form">
      <section className="settings-section">
        <div className="section-line">
          <div>
            <h2>MCP server</h2>
            <p>Use your Kazi account from an MCP client.</p>
          </div>
          <span className="badge neutral">
            {demo ? "Not configured" : "Configured"}
          </span>
        </div>
        <div className="endpoint-row">
          <code>
            {demo ? "Configure Convex to get your endpoint" : endpoint()}
          </code>
          <button
            className="icon-button"
            aria-label="Copy MCP endpoint"
            disabled={demo}
            onClick={() =>
              run(
                () => navigator.clipboard.writeText(endpoint()),
                "Endpoint copied",
              )
            }
          >
            <Copy size={15} />
          </button>
        </div>
        <div className="diagnostic-row">
          <span>Transport</span>
          <strong>Streamable HTTP</strong>
        </div>
        <div className="diagnostic-row">
          <span>Authentication</span>
          <strong>Bearer token · expires after 30 days</strong>
        </div>
      </section>
      <section className="settings-section">
        <div className="section-line">
          <div>
            <h2>Credentials</h2>
            <p>Create one credential for each client or device.</p>
          </div>
          <button className="button secondary" onClick={() => setOpen(true)}>
            <Plus size={14} />
            Add connection
          </button>
        </div>
        {tokens.length ? (
          <div className="connection-table-wrap">
            <table className="connection-table">
              <thead>
                <tr>
                  <th>Name & permissions</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.label}</strong>
                      <small>{t.scopes.join(" · ")}</small>
                    </td>
                    <td>{dateTime(t.lastUsedAt)}</td>
                    <td>{new Date(t.expiresAt).toLocaleDateString()}</td>
                    <td>{credentialStatus(t)}</td>
                    <td>
                      {credentialStatus(t) === "Active" && (
                        <button
                          className="text-button danger-text"
                          disabled={!online}
                          onClick={() =>
                            run(() => revokeToken(t.id), "Credential revoked")
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="connection-empty">
            <KeyRound size={22} />
            <div>
              <strong>No MCP credentials</strong>
              <p>
                Read, task updates, and plan previews can be granted separately.
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="settings-section">
        <h2>Agents & clients</h2>
        <AgentTable />
        <p className="muted settings-footnote">
          Client names are reported by the client. A credential grants your own
          permissions; plan approval still opens in Kazi.
        </p>
      </section>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setToken("");
        }}
        title="Add MCP connection"
        description="Create a scoped credential for one client."
      >
        {demo ? (
          <div className="form">
            <div className="inline-info">
              MCP is not configured in this local preview. Connect Clerk and
              Convex before creating a real credential.
            </div>
            <Link
              className="button secondary"
              onClick={() => setOpen(false)}
              to="/settings?tab=account"
            >
              View account setup <ArrowUpRight size={14} />
            </Link>
          </div>
        ) : token ? (
          <div className="form">
            <div className="inline-info">
              <Check size={16} />
              Credential created. Copy it before closing this dialog.
            </div>
            <label>
              New MCP token
              <input aria-label="New MCP token" readOnly value={token} />
            </label>
            <button
              className="button secondary"
              onClick={() =>
                run(() => navigator.clipboard.writeText(token), "Token copied")
              }
            >
              <Copy size={14} />
              Copy token
            </button>
            <p>
              In your client, add a Streamable HTTP server with the endpoint
              above and the header <code>Authorization: Bearer YOUR_TOKEN</code>
              . The client appears in Agents & clients after use.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setToken("");
                setOpen(false);
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setSaving(true);
              try {
                const value = await run(() =>
                  mintToken(
                    String(f.get("label")),
                    f.getAll("scope").map(String),
                  ),
                );
                if (value) setToken(value);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Connection name
              <input
                name="label"
                required
                maxLength={80}
                placeholder="Codex on my laptop"
              />
            </label>
            <fieldset>
              <legend>Permissions</legend>
              {tokenScopes.map((scope) => (
                <label className="check-label" key={scope}>
                  <input
                    name="scope"
                    value={scope}
                    type="checkbox"
                    defaultChecked={scope === "read"}
                  />
                  {scopeLabels[scope]}
                </label>
              ))}
            </fieldset>
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button disabled={saving || !online} className="button primary">
                {saving ? "Creating…" : "Create credential"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
export function McpActivity() {
  const { mcpActivity } = useData();
  return (
    <div className="settings-form">
      <section className="settings-section">
        <h2>Recent MCP activity</h2>
        <p>
          The most recent 50 tool calls for your credentials. Task text,
          arguments, and secrets are not recorded here.
        </p>
        {mcpActivity.length ? (
          <div className="connection-table-wrap">
            <table className="connection-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Connection</th>
                  <th>Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {mcpActivity.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <code>{a.tool}</code>
                    </td>
                    <td>{a.label}</td>
                    <td>{dateTime(a.at)}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (a.outcome === "success" ? "olive" : "clay")
                        }
                      >
                        {a.outcome === "success" ? "Succeeded" : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="connection-empty">
            <Terminal size={22} />
            <div>
              <strong>No MCP activity</strong>
              <p>
                Tool calls appear here after a client uses your Kazi connection.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
