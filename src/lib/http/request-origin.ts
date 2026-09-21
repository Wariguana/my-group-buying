import "server-only";

import type { NextRequest } from "next/server";

function parseOriginHeader(value: string | null): URL | null {
  if (!value || value !== value.trim() || value.includes(",")) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || value !== parsed.origin
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getRequestTargetOrigin(request: NextRequest): URL | null {
  // Match Next.js Server Actions semantics by preferring the proxy-supplied
  // public host. Deployments must replace, not pass through, client-supplied
  // forwarding headers. Comma-separated/ambiguous values are rejected here.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (
    !host
    || host !== host.trim()
    || host.includes(",")
    || /[\s/@\\?#]/.test(host)
  ) {
    return null;
  }

  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  let protocol: "http:" | "https:";
  if (forwardedProtocol !== null) {
    if (forwardedProtocol === "http") protocol = "http:";
    else if (forwardedProtocol === "https") protocol = "https:";
    else return null;
  } else if (request.nextUrl.protocol === "http:" || request.nextUrl.protocol === "https:") {
    protocol = request.nextUrl.protocol;
  } else {
    return null;
  }

  try {
    const target = new URL(`${protocol}//${host}`);
    if (!target.hostname || target.username || target.password || target.pathname !== "/") return null;
    return target;
  } catch {
    return null;
  }
}

export function getSameRequestOrigin(request: NextRequest): URL | null {
  const origin = parseOriginHeader(request.headers.get("origin"));
  const requestTargetOrigin = getRequestTargetOrigin(request);
  return origin && requestTargetOrigin?.origin === origin.origin ? origin : null;
}
