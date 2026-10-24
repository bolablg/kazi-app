# Local Convex development

Kazi can use the official local Convex backend without a cloud account, Docker, or PostgreSQL. It runs the same schema, functions, authorization, subscriptions, and scheduled jobs used by the hosted application. Local data lives in the project's ignored `.convex/` directory. The backend is a development deployment, not a production server.

## Start

From `app/`, use two terminals:

```sh
# Terminal 1 — keep this running
npm run backend:local
```

Wait until the backend is listening at `http://127.0.0.1:3210`. On a first start it downloads the official backend and dashboard; the first push may report that the auth issuer is missing. The setup command supplies the local issuer:

```sh
# Terminal 2
npm run dev:local
```

Open **http://127.0.0.1:5173**. The interface is labeled **Local development**. `dev:local` configures the development session, seeds synthetic data if the identity has no existing application, then starts Vite. If Vite is already running, use `npm run setup:local` instead. Existing local data is preserved on subsequent setup runs. Stop the Vite process and backend with Ctrl-C when done; restarting retains the local database.

The running backend is required for `convex run`, `convex env`, and the app. To open its dashboard, run `npx convex dashboard --env-file .env.convex.local` while the backend is running.

## What is local

- The backend runs at `http://127.0.0.1:3210`; its HTTP actions run at `http://127.0.0.1:3211`.
- `.env.convex.local` explicitly selects the anonymous local deployment. The wrapper refuses a cloud selector. No cloud project, paid account, or production deployment is created.
- `.env.development.local` enables the browser's loopback development mode. It is not loaded by production builds or the isolated browser-test server.
- A generated RSA signing key is stored in `.convex/local-auth/private.pem` with restrictive permissions. Vite's development middleware issues a short-lived JWT for one local developer identity, only on the loopback host and same origin. The Convex backend verifies its audience and signature, then applies normal membership/project/role checks.
- Local identity is a development convenience, not a real sign-in service. The account menu shows a development avatar/session and does not invoke Clerk profile or sign-out hooks. Hosted sign-in still uses Clerk.
- The local auth provider refuses a non-loopback Convex deployment. The production deployment check rejects the local frontend flag. The development token endpoint and local identity are eliminated from the production bundle.
- Synthetic data includes sample people, projects, historical work, and planning history. These are fixtures, not connected people or Google Calendar events. Google OAuth and real external MCP clients still require their normal configuration. Secrets and local database state are ignored by Git; do not publish them.

## Isolated demo and tests

```sh
npm run dev:demo
```

This serves the browser-storage demonstration at **http://127.0.0.1:5175**, separate from the Convex-backed development app. The Playwright suite uses this isolated server so browser test data cannot change the local development database:

```sh
KAZI_TEST_BROWSER=chrome npm run test:e2e -- --workers=1
```

A production build/preview remains the standalone demo unless production Clerk/Convex configuration is supplied. `npm run build` does not deploy anything.

## Verified locally

The app opened with an authenticated local Convex session. A captured task persisted across reload and a fresh browser context without demo localStorage. Its resource URL used opaque project/task IDs. The test task was then canceled. A cross-origin request to the local session endpoint received HTTP 403. No runtime errors were observed in this check.

See the official [local deployments guide](https://docs.convex.dev/cli/local-deployments), [agent mode](https://docs.convex.dev/cli/agent-mode), and [custom JWT integration](https://docs.convex.dev/auth/advanced/custom-jwt).

## Automatic browser updates

Vite's development server sends live updates and a debounced full reload after changes to `src`, `shared`, or `convex` source. Keep that server running. The development entry unregisters stale same-origin service workers and reloads once if a previous worker controlled the page. The production PWA keeps its update prompt and static-only offline cache.

## Existing cloud project

A read-only check on October 24, 2026 confirmed the existing CLI login can access **bolaji / kazi-app** and resolve its development deployment. No extra credential was needed for that lookup. The browser remains on local Convex; no cloud functions, data, or production deployment were changed.

Switching to hosted development requires hosted browser identity configuration (currently Clerk public key and issuer), selecting the intended development deployment, and updating the frontend public Convex URL. The loopback-only local session intentionally refuses cloud deployments. Keep production configuration separate. Do not paste private deploy keys or provider secrets into chat.
