# Third-party notices

Kazi application source uses the root MIT license. Dependencies keep their own licenses; consult the shipped package LICENSE files and lockfile before redistribution. The lockfile pins the complete transitive graph.

| Direct package            | Locked version | Declared license  | Use         |
| ------------------------- | -------------- | ----------------- | ----------- |
| @clerk/react              | 6.18.1         | MIT               | Runtime     |
| @js-temporal/polyfill     | 0.5.1          | ISC               | Runtime     |
| @modelcontextprotocol/sdk | 1.32.2         | MIT               | Runtime     |
| @radix-ui/react-dialog    | 1.3.1          | MIT               | Runtime     |
| convex                    | 1.48.0         | Apache-2.0        | Runtime     |
| lucide-react              | 1.61.0         | ISC               | Runtime     |
| react                     | 19.3.1         | MIT               | Runtime     |
| react-dom                 | 19.3.1         | MIT               | Runtime     |
| react-router-dom          | 7.18.4         | MIT               | Runtime     |
| zod                       | 4.6.7          | MIT               | Runtime     |
| @edge-runtime/vm          | 5.0.0          | MIT               | Development |
| @playwright/test          | 1.64.1         | Apache-2.0        | Development |
| @testing-library/jest-dom | 7.0.1          | MIT               | Development |
| @testing-library/react    | 16.3.3         | MIT               | Development |
| @types/node               | 26.6.5         | MIT               | Development |
| @types/react              | 19.3.0         | MIT               | Development |
| @types/react-dom          | 19.3.0         | MIT               | Development |
| @vitejs/plugin-react      | 6.1.2          | MIT               | Development |
| convex-test               | 0.0.65         | Apache-2.0        | Development |
| jsdom                     | 29.1.1         | MIT               | Development |
| prettier                  | 3.9.10         | MIT               | Development |
| sharp                     | 0.35.5         | Apache-2.0        | Development |
| tsx                       | 4.23.15        | MIT               | Development |
| typescript                | 7.0.2          | Apache-2.0        | Development |
| vite                      | 8.3.5          | MIT               | Development |
| vite-plugin-pwa           | 2.0.0          | MIT               | Development |
| vitest                    | 4.1.12         | MIT               | Development |
| wrangler                  | 4.152.0        | MIT OR Apache-2.0 | Development |

The interface uses system fonts and original vector app icons. Retained font license notices are included alongside this guide.

Added dependencies: `@noble/hashes` 2.4.0 (MIT), used for namespaced deterministic resource identifiers, and `@dnd-kit/core` 6.3.1 (MIT), used for pointer/touch/keyboard board interaction. Their transitive dependencies remain pinned in the package lock. The local Convex binary/dashboard are downloaded by the official Convex CLI and are not embedded in the application bundle.
