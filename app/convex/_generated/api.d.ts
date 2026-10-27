/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as calendar from "../calendar.js";
import type * as commands from "../commands.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as identityConfig from "../identityConfig.js";
import type * as identityCore from "../identityCore.js";
import type * as jobs from "../jobs.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as serviceActivation from "../serviceActivation.js";
import type * as store from "../store.js";
import type * as tokens from "../tokens.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  calendar: typeof calendar;
  commands: typeof commands;
  crons: typeof crons;
  crypto: typeof crypto;
  files: typeof files;
  http: typeof http;
  identity: typeof identity;
  identityConfig: typeof identityConfig;
  identityCore: typeof identityCore;
  jobs: typeof jobs;
  reports: typeof reports;
  seed: typeof seed;
  serviceActivation: typeof serviceActivation;
  store: typeof store;
  tokens: typeof tokens;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
