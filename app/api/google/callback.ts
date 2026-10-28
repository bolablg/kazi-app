import deployment from "../../server/mcp-deployment.js";
import {
  createCalendarProxy,
  unavailableCalendar,
} from "../../server/calendar-proxy.js";

const proxy = createCalendarProxy(
  deployment.upstream,
  deployment.applicationUrl,
);
export default {
  fetch(request: Request) {
    if (deployment.environment !== process.env.VERCEL_ENV)
      return unavailableCalendar();
    return proxy(request);
  },
};
