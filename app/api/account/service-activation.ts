import deployment from "../../server/mcp-deployment.js";
import {
  createServiceActivationProxy,
  unavailableServiceActivation,
} from "../../server/service-activation-proxy.js";

export default {
  fetch(request: Request) {
    if (
      deployment.environment !== "production" ||
      deployment.environment !== process.env.VERCEL_ENV
    )
      return unavailableServiceActivation();
    return createServiceActivationProxy(
      deployment.upstream,
      "production",
    )(request);
  },
};
