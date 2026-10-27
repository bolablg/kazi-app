// Existing fixtures exercise the explicitly staged compatibility configuration.
// Strict-policy tests override or remove this setting to test fail-closed behavior.
process.env.KAZI_SERVICE_ACCESS_MODE = "compat";
