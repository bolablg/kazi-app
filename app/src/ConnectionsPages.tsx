import { tokenScopes, scopeLabels } from "../shared/capabilities";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Plug,
  Terminal,
  Cable,
} from "lucide-react";
import { useData, type Data } from "./data";
import { Modal, useUI } from "./components";
import { InfoTip } from "./InfoTip";
import { ScrollTable } from "./ScrollTable";
import {
  agentSetupInstructions,
  mcpClientConfiguration,
} from "../shared/agentSetup";
import { mcpEndpoint } from "../shared/mcpEndpoint";
const endpoint = () =>
  mcpEndpoint(window.location.origin, import.meta.env.VITE_KAZI_MCP_URL);
const dateTime = (at?: number) =>
  at ? new Date(at).toLocaleString() : "Never used";
const credentialStatus = (t: Data["tokens"][number]) =>
  t.revoked ? "Revoked" : t.expiresAt <= Date.now() ? "Expired" : "Active";
const clientConfiguration = (token?: string) =>
  mcpClientConfiguration(endpoint(), token);
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
    [issued, setIssued] = useState<{
      token: string;
      label: string;
      scopes: string[];
    }>(),
    [showToken, setShowToken] = useState(false),
    [copyStatus, setCopyStatus] = useState<{ text: string; error?: boolean }>(),
    [saving, setSaving] = useState(false);
  const setupGeneration = useRef(0);
  useEffect(
    () => () => {
      setupGeneration.current++;
    },
    [],
  );
  const token = issued?.token ?? "";
  const closeSetup = () => {
    setupGeneration.current++;
    setOpen(false);
    setIssued(undefined);
    setShowToken(false);
    setCopyStatus(undefined);
    setSaving(false);
  };
  const copyIssued = async (value: string, message: string) => {
    const generation = setupGeneration.current;
    try {
      await navigator.clipboard.writeText(value);
      if (generation === setupGeneration.current)
        setCopyStatus({ text: message });
    } catch {
      if (generation === setupGeneration.current)
        setCopyStatus({
          text: "Copy failed. Allow clipboard access and try again.",
          error: true,
        });
    }
  };
  const copySetup = (withCredential: boolean) =>
    withCredential
      ? copyIssued(
          agentSetupInstructions({
            endpoint: endpoint(),
            applicationUrl: location.origin,
            credential: issued,
          }),
          "Agent setup copied, including this connection’s private key",
        )
      : run(
          () =>
            navigator.clipboard.writeText(
              agentSetupInstructions({
                endpoint: endpoint(),
                applicationUrl: location.origin,
              }),
            ),
          "Setup guide copied; add a Kazi connection key when prompted",
        );
  return (
    <div className="settings-form connections-form mcp-settings">
      <section className="settings-section mcp-onboarding">
        <div className="section-line">
          <div className="mcp-onboarding-title">
            <span className="settings-emblem" data-tone="pink">
              <Cable size={22} />
            </span>
            <div>
              <div className="section-title-group">
                <h2>Connect your agent</h2>
                <InfoTip label="About MCP setup">
                  Paste the setup guide into an agent that supports remote MCP.
                  It can adapt the instructions to its client’s configuration.
                  Create a separate Kazi key for each agent and choose its
                  permissions. Your Clerk and Convex service keys are not
                  needed.
                </InfoTip>
              </div>
              <p>Create a connection, then let your agent handle setup.</p>
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
              <strong>Choose its access</strong>
              <p>Name the connection and select permissions.</p>
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
              <strong>Copy agent setup</strong>
              <p>
                After creating a key, copy the complete guide and paste it into
                your agent.
              </p>
              <button
                className="text-button"
                disabled={demo}
                onClick={() => copySetup(false)}
              >
                <Copy size={14} /> Copy setup guide
              </button>
            </div>
          </li>
          <li>
            <span className="mcp-step-number" aria-hidden="true">
              3
            </span>
            <div>
              <strong>Verify the connection</strong>
              <p>
                Your agent checks access. Its first request appears in activity.
              </p>
              <Link className="text-button" to="/connections?tab=activity">
                View tool activity <ArrowUpRight size={13} />
              </Link>
            </div>
          </li>
        </ol>
        <details className="mcp-manual-setup">
          <summary>Manual setup &amp; server details</summary>
          <div className="mcp-manual-content">
            <label>MCP server URL</label>
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
            <code>Authorization: Bearer YOUR_KAZI_TOKEN</code>
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
            <p className="settings-footnote">
              Streamable HTTP · Bearer token · 30-day keys
            </p>
          </div>
        </details>
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
        onClose={closeSetup}
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
          <div className="form mcp-issued">
            <div className="mcp-issued-heading">
              <span className="settings-emblem" data-tone="teal">
                <Check size={22} />
              </span>
              <div>
                <h3>Ready for your agent</h3>
                <p>
                  {issued?.label} · {issued?.scopes.length}{" "}
                  {issued?.scopes.length === 1 ? "permission" : "permissions"} ·
                  30 days
                </p>
              </div>
            </div>
            <button
              className="button primary copy-agent-setup"
              onClick={() => copySetup(true)}
            >
              <Copy size={16} />
              Copy agent setup
            </button>
            <p className="mcp-private-note">
              Includes your private connection key. Share only with the agent
              you want to connect.
            </p>
            <details className="mcp-other-options">
              <summary>Token &amp; client configuration</summary>
              <div className="mcp-other-content">
                <label htmlFor="issued-mcp-token">New MCP token</label>
                <div className="mcp-secret-field">
                  <input
                    id="issued-mcp-token"
                    aria-label="New MCP token"
                    type={showToken ? "text" : "password"}
                    readOnly
                    value={token}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={showToken ? "Hide token" : "Show token"}
                    aria-pressed={showToken}
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <div className="integration-actions">
                  <button
                    className="button secondary"
                    onClick={() => copyIssued(token, "Token copied")}
                  >
                    <Copy size={14} />
                    Copy token
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      copyIssued(
                        clientConfiguration(token),
                        "Client configuration copied",
                      )
                    }
                  >
                    <Copy size={14} />
                    Copy client configuration
                  </button>
                </div>
              </div>
            </details>
            {copyStatus && (
              <p
                className={
                  copyStatus.error ? "mcp-copy-status error" : "mcp-copy-status"
                }
                role={copyStatus.error ? "alert" : "status"}
              >
                {copyStatus.text}
              </p>
            )}
            <p className="settings-footnote">
              This key is shown only now. Create a new connection if you lose
              it.
            </p>
            <div className="modal-footer">
              <button className="button secondary" onClick={closeSetup}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const label = String(f.get("label")),
                scopes = f.getAll("scope").map(String);
              const generation = setupGeneration.current;
              setSaving(true);
              try {
                const value = await run(() => mintToken(label, scopes));
                if (value && generation === setupGeneration.current) {
                  setIssued({ token: value, label, scopes });
                  setShowToken(false);
                }
              } finally {
                if (generation === setupGeneration.current) setSaving(false);
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
                onClick={closeSetup}
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
