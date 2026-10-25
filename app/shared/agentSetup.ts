import { scopeLabels, type tokenScopes } from "./capabilities";

type Scope = (typeof tokenScopes)[number];
export type AgentSetup = {
  endpoint: string;
  applicationUrl: string;
  credential?: { token: string; label: string; scopes: readonly string[] };
};

export function mcpClientConfiguration(
  endpoint: string,
  token = "YOUR_KAZI_TOKEN",
) {
  return JSON.stringify(
    {
      mcpServers: {
        kazi: {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer " + token },
        },
      },
    },
    null,
    2,
  );
}

/** Build only on an explicit copy action; credentials stay in component memory. */
export function agentSetupInstructions({
  endpoint,
  applicationUrl,
  credential,
}: AgentSetup) {
  const scopes = credential?.scopes ?? [];
  const access = credential
    ? `Connection: ${JSON.stringify(credential.label)}\nGranted permissions:\n${scopes.map((scope) => `- ${scope}: ${scopeLabels[scope as Scope] ?? scope}`).join("\n")}\nThis Kazi credential expires after 30 days and can be revoked from Connections.`
    : `A Kazi connection token is required. Ask me for one if I have not provided it. I can create it at ${applicationUrl.replace(/\/$/, "")}/connections?tab=mcp. Use only the permissions I select.`;
  return `Connect this AI client to my Kazi account through MCP.

Server name: kazi
Transport: Streamable HTTP
Server URL: ${endpoint}
Authentication: Authorization: Bearer ${credential?.token ?? "YOUR_KAZI_TOKEN"}

${access}

Setup:
1. Check whether this client supports a remote MCP server with a custom Authorization header. Use the client's supported configuration format or setup interface. If you cannot change its MCP configuration, give me the exact steps to complete it.
2. Add the Kazi server without replacing other MCP servers. Use the connection below as a reference; adapt the syntax to this client:

${mcpClientConfiguration(endpoint, credential?.token)}

3. Keep the token in this client's private credential store or private local configuration. Do not put it in a source repository, public link, logs, or your reply. Kazi setup does not need Clerk, Convex, Google, or other service-admin keys. If no Kazi token is provided, ask for it instead of inventing one or attempting a connection with the placeholder.
4. Initialize the MCP connection and discover its available tools. ${!credential || scopes.includes("read") ? "Verify access with a read-only request for my available Kazi tasks or projects." : "Verify initialization and tool discovery only; this credential does not include read access."} Do not create, edit, schedule, or delete work as part of this setup check.
5. Report whether setup and verification succeeded, or explain the specific blocker. Wait for my work request before changing records. Follow the granted scopes and Kazi's existing approval rules; do not request broader credentials automatically.

If the server URL is localhost, this client must be running on the same computer or have an explicitly configured route to it. A cloud agent cannot reach my localhost directly.`;
}
