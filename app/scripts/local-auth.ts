import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
export const localSubject = "local-kazi-owner";
export const localIssuer = "http://127.0.0.1:5173";
export function localKeys() {
  const directory = resolve(process.cwd(), ".convex/local-auth");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, "private.pem");
  if (!existsSync(file)) {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(file, privateKey.export({ format: "pem", type: "pkcs8" }), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const privateKey = createPrivateKey(readFileSync(file));
  const jwk = {
    ...createPublicKey(privateKey).export({ format: "jwk" }),
    kid: "kazi-local",
    alg: "RS256",
    use: "sig",
  };
  return { privateKey, jwks: { keys: [jwk] } };
}
export function localAuthPlugin(enabled: boolean): Plugin {
  return {
    name: "kazi-loopback-development-auth",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      const keys = localKeys();
      server.middlewares.use("/__kazi_local_session", (request, response) => {
        if (
          request.method !== "GET" ||
          request.headers.host !== "127.0.0.1:5173" ||
          (request.headers.origin && request.headers.origin !== localIssuer) ||
          (request.headers["sec-fetch-site"] &&
            !["same-origin", "none"].includes(
              String(request.headers["sec-fetch-site"]),
            ))
        ) {
          response.writeHead(403).end("Local development only");
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        const encode = (v: unknown) =>
          Buffer.from(JSON.stringify(v)).toString("base64url");
        const body = `${encode({ alg: "RS256", typ: "JWT", kid: "kazi-local" })}.${encode({ sub: localSubject, iss: localIssuer, aud: "kazi-local", iat: now, exp: now + 3600, name: "Local Developer", email: "developer@localhost.test", email_verified: true })}`;
        const token = `${body}.${sign("RSA-SHA256", Buffer.from(body), keys.privateKey).toString("base64url")}`;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ token }));
      });
    },
  };
}
