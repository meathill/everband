export type RouteAuthErrorCode = "unauthenticated" | "forbidden";

export function getRouteAuthErrorCode(cause: unknown): RouteAuthErrorCode | null {
  if (!(cause instanceof Error)) return null;
  if (cause.message === "unauthenticated" || cause.message === "forbidden") {
    return cause.message;
  }
  return null;
}
