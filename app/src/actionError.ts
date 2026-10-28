import { ConvexError } from "convex/values";

export function actionErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    if (typeof error.data === "string") return error.data;
    if (
      error.data &&
      typeof error.data === "object" &&
      "message" in error.data &&
      typeof error.data.message === "string"
    )
      return error.data.message;
  }
  return error instanceof Error
    ? error.message
    : "This action could not be saved. Please try again.";
}
