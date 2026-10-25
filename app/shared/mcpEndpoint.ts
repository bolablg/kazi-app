/** Hosted builds provide their own public URL; local clients use Vite's proxy. */
export function mcpEndpoint(applicationUrl: string, hostedEndpoint?: string) {
  return hostedEndpoint || new URL("/mcp", applicationUrl).href;
}
