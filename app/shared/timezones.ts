export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function availableTimeZones(current: string): string[] {
  let supported: string[] = [];
  try {
    supported = Intl.supportedValuesOf("timeZone");
  } catch {
    /* Older browsers keep a useful fallback. */
  }
  return [
    ...new Set(
      [
        current,
        deviceTimeZone(),
        "UTC",
        ...supported,
        "America/Chicago",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Africa/Lagos",
        "Africa/Nairobi",
        "Asia/Kolkata",
        "Asia/Tokyo",
        "Australia/Sydney",
      ].filter((zone): zone is string => !!zone),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
