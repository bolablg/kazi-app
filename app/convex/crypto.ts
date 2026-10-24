export async function sha256(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function invitationToken(
  subject: string,
  workspace: string,
  requestId: string,
): Promise<string> {
  const secret = process.env.INVITATION_SIGNING_KEY;
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure INVITATION_SIGNING_KEY with at least 32 random characters on Convex.",
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(JSON.stringify([subject, workspace, requestId])),
  );
  return [...new Uint8Array(signature)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const bytes = (base64: string) =>
  Uint8Array.from(atob(base64), (x) => x.charCodeAt(0));
export async function encrypt(
  value: string,
): Promise<{ ciphertext: string; iv: string }> {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || bytes(raw).length !== 32)
    throw new Error("Configure a 32-byte TOKEN_ENCRYPTION_KEY on Convex.");
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(raw),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipher))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}
export async function decrypt(value: {
  ciphertext: string;
  iv: string;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(process.env.TOKEN_ENCRYPTION_KEY ?? ""),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(value.iv) },
      key,
      bytes(value.ciphertext),
    ),
  );
}
