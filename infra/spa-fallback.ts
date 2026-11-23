/**
 * Runs inside a CloudFront Function, where it is injected via `toString()`,
 * so it must stay self-contained and reference nothing outside its own body.
 */
export function spaFallbackUri(uri: string): string {
  const isApiRequest = uri === "/api" || uri.startsWith("/api/");
  const lastSegment = uri.slice(uri.lastIndexOf("/") + 1);
  const isFileRequest = lastSegment.includes(".");
  return isApiRequest || isFileRequest ? uri : "/index.html";
}
