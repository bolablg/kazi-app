import deployment from "../server/mcp-deployment.js";
import { createMcpProxy, unavailableMcp } from "../server/mcp-proxy.js";

const proxy = createMcpProxy(deployment.upstream);

export default {
  fetch(request: Request) {
    // A cached build artifact must never cross Vercel environments.
    if (deployment.environment !== process.env.VERCEL_ENV)
      return unavailableMcp();
    return proxy(request);
  },
};
