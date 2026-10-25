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
import { InfoTip } from "./InfoTip";
import { ScrollTable } from "./ScrollTable";
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
const clientConfiguration = (token = "YOUR_KAZI_TOKEN") =>
  JSON.stringify(
    {
      mcpServers: {
        kazi: {
          type: "http",
          url: endpoint(),
          headers: { Authorization: "Bearer " + token },
        },
      },
    },
    null,
    2,
  );
export function ConnectionsOverview() {
  const { state, actorId, demo, tokens } = useData();
  const cal = state.calendars.find((c) => c.ownerId === actorId);
  const externalConnected =
    !!cal?.selectedIds.length && ["native", "connected"].includes(cal.status);
  const agents = tokens.filter((t) => t.lastUsedAt);
  const active = tokens.filter((t) => credentialStatus(t) === "Active").length;
  return (
    <div className="settings-form connections-form connections-overview">
      <section className="settings-section">
        <h2>Your connections</h2>
        <p>Manage access to your calendar and the tools that use Kazi.</p>
        <Link className="connection-item" to="/connections?tab=calendar">
          <span className="service-icon calendar">
            <CalendarDays size={21} />
          </span>
          <span>
            <strong>Calendar availability</strong>
            <small>Optional Google free/busy connection</small>
          </span>
          <span className="connection-status">
            <i className={externalConnected ? "connected" : ""} />
            {cal?.status === "demo"
              ? "Demo calendar"
              : externalConnected
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
            <i className={active ? "connected" : ""} />
            {demo
              ? "Not configured"
              : active
                ? `${active} active credential${active === 1 ? "" : "s"}`
                : "Ready to connect"}
          </span>
          <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className="settings-section">
        <div className="section-line">
          <div className="section-title-group">
            <h2>Agents & clients</h2>
            <InfoTip label="About agents and clients">
              Your agent uses Kazi through an MCP client such as Codex or Claude
              Code. Clients appear after an authenticated request; last seen
              does not indicate a persistent connection.
            </InfoTip>
          </div>
          <Link className="text-button" to="/connections?tab=mcp">
            Manage access <ArrowUpRight size={13} />
          </Link>
        </div>
        <AgentTable />
        <p className="muted settings-footnote">
          {agents.length} clients seen ·{" "}
          {tokens.filter((t) => credentialStatus(t) === "Active").length} active
          credentials.
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
    <ScrollTable className="connection-table-wrap" label="Connection details">
      <table className="connection-table client-table">
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
    </ScrollTable>
  ) : (
    <div className="connection-empty">
      <Plug size={22} />
      <div>
        <strong>No clients seen yet</strong>
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
    <div className="settings-form connections-form">
      <section className="settings-section">
        <div className="section-line">
          <div>
            <div className="section-title-group">
              <h2>Connect an MCP client</h2>
              <InfoTip label="About MCP setup">
                MCP lets an agent use Kazi through a compatible client. Use a
                Streamable HTTP server, with a separate scoped credential for
                each client. Approval of a proposed plan still happens in Kazi.
              </InfoTip>
            </div>
          </div>
          <span className="badge neutral">
            {demo ? "Not configured" : "Server ready"}
          </span>
        </div>
        <ol className="mcp-setup-steps" aria-label="MCP setup steps">
          <li>
            <span className="mcp-step-number" aria-hidden="true">
              1
            </span>
            <div>
              <strong>Create a credential</strong>
              <p>Choose a client name and the permissions it needs below.</p>
              <button
                className="button secondary"
                onClick={() => setOpen(true)}
              >
                <Plus size={14} />
                Add connection
              </button>
            </div>
          </li>
          <li>
            <span className="mcp-step-number" aria-hidden="true">
              2
            </span>
            <div>
              <strong>Add Kazi to your client</strong>
              <p>
                Use this server URL and{" "}
                <code>Authorization: Bearer YOUR_KAZI_TOKEN</code>.
              </p>
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
              <button
                className="text-button"
                disabled={demo}
                onClick={() =>
                  run(
                    () => navigator.clipboard.writeText(clientConfiguration()),
                    "Setup template copied; replace YOUR_KAZI_TOKEN",
                  )
                }
              >
                <Copy size={14} />
                Copy JSON template
              </button>
              <InfoTip label="Using the MCP setup template">
                This HTTP JSON template works with clients such as Claude Code.
                Replace YOUR_KAZI_TOKEN with your token. Other clients may use a
                different configuration format or a setup form; enter the server
                URL and authorization header there instead.
              </InfoTip>
            </div>
          </li>
          <li>
            <span className="mcp-step-number" aria-hidden="true">
              3
            </span>
            <div>
              <strong>Connect and verify</strong>
              <p>
                Ask your client to list your Kazi tasks. It will appear in
                Agents & clients after its first request.
              </p>
              <Link className="text-button" to="/connections?tab=activity">
                View tool activity <ArrowUpRight size={13} />
              </Link>
            </div>
          </li>
        </ol>
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
        </div>
        {tokens.length ? (
          <ScrollTable
            className="connection-table-wrap"
            label="Connection details"
          >
            <table className="connection-table credential-table">
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
          </ScrollTable>
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
        <div className="section-title-group">
          <h2>Agents & clients</h2>
          <InfoTip label="About client access">
            Client names and versions are self-reported. Each credential grants
            your own permissions within its selected scopes. Revoke its
            credential to stop future access.
          </InfoTip>
        </div>
        <AgentTable />
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
            <div className="inline-info mcp-token-notice">
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
            <button
              className="button secondary"
              onClick={() =>
                run(
                  () =>
                    navigator.clipboard.writeText(clientConfiguration(token)),
                  "Client configuration copied",
                )
              }
            >
              <Copy size={14} />
              Copy client configuration
            </button>
            <p className="inline-info">
              This token is only shown once. Keep it private; the copied
              configuration includes the token.
            </p>
            <p>
              Use “Copy client configuration” to set up your client, or use the
              server URL on the MCP setup page with the header{" "}
              <code>Authorization: Bearer YOUR_TOKEN</code>. The client appears
              in Agents & clients after use.
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
            <fieldset className="mcp-permissions">
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
    <div className="settings-form connections-form">
      <section className="settings-section">
        <h2>Recent MCP activity</h2>
        <p>
          The most recent 50 tool calls for your credentials. Task text,
          arguments, and secrets are not recorded here.
        </p>
        {mcpActivity.length ? (
          <ScrollTable
            className="connection-table-wrap"
            label="Connection details"
          >
            <table className="connection-table activity-table">
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
          </ScrollTable>
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
