export const SERVICE_ACTIVATION_PATH = "/api/account/service-activation";
export type ActivationDates = {
  activatedAt: number | null;
  firstObservedAt: number;
};
export type ServiceActivationSummary = {
  version: 1;
  serviceId: "kazi";
  environment: "development" | "production";
  activation: ActivationDates | null;
};

export function parseServiceActivation(
  value: unknown,
  environment: ServiceActivationSummary["environment"],
): ServiceActivationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  if (
    summary.version !== 1 ||
    summary.serviceId !== "kazi" ||
    summary.environment !== environment ||
    Object.keys(summary).some(
      (key) =>
        !["version", "serviceId", "environment", "activation"].includes(key),
    )
  )
    return null;
  if (summary.activation === null)
    return { version: 1, serviceId: "kazi", environment, activation: null };
  const activation = summary.activation;
  if (
    !activation ||
    typeof activation !== "object" ||
    Array.isArray(activation)
  )
    return null;
  const dates = activation as Record<string, unknown>;
  const timestamp = (date: unknown): date is number =>
    typeof date === "number" && Number.isSafeInteger(date) && date >= 0;
  if (
    !(dates.activatedAt === null || timestamp(dates.activatedAt)) ||
    !timestamp(dates.firstObservedAt) ||
    Object.keys(dates).some(
      (key) => !["activatedAt", "firstObservedAt"].includes(key),
    )
  )
    return null;
  return {
    version: 1,
    serviceId: "kazi",
    environment,
    activation: {
      activatedAt: dates.activatedAt,
      firstObservedAt: dates.firstObservedAt,
    },
  };
}

export async function boundedJson(
  response: Response,
  maximum = 4096,
): Promise<unknown> {
  if (
    !response.headers.get("content-type")?.includes("application/json") ||
    Number(response.headers.get("content-length") ?? 0) > maximum ||
    !response.body
  )
    throw new Error("Invalid service summary");
  const reader = response.body.getReader();
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) throw new Error("Invalid service summary");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export const serviceActivationHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Authorization",
};
