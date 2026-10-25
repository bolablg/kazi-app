// build-hosted-client.mjs writes the matching .js module after Convex has
// selected the backend. There is deliberately no checked-in fallback target.
declare const deployment: {
  environment: "production" | "preview";
  upstream: string;
};
export default deployment;
