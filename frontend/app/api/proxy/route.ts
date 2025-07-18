import { NextResponse } from "next/server"

/**
 * Simple streaming proxy that fetches the remote resource on the server and
 * pipes it back to the client. This allows the frontend to request third-party
 * assets (e.g. Azure Blob Storage PDFs) without running into browser CORS
 * restrictions because the request is made server-side.
 *
 * Usage: `/api/proxy?url=<ENCODED_URL>`
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return new NextResponse("Missing 'url' query parameter", { status: 400 })
  }

  try {
    // Forward client request headers (especially Range) to support partial content
    const forwardedHeaders = new Headers(request.headers)
    forwardedHeaders.delete("host") // Host header should reflect the upstream, remove to avoid mismatch

    const upstreamResponse = await fetch(targetUrl, {
      // Use same method (GET) implicitly
      headers: forwardedHeaders,
    })

    // Clone headers from the upstream but ensure we expose the important ones
    // to the browser and avoid blocked headers like "transfer-encoding".
    const headers = new Headers(upstreamResponse.headers)
    headers.set("Access-Control-Allow-Origin", "*")

    // Some headers are disallowed by the browser when coming from a Service
    // Worker/Proxy. Remove them if present to avoid runtime errors.
    headers.delete("content-encoding")
    headers.delete("transfer-encoding")

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    })
  } catch (err) {
    console.error("Proxy fetch failed:", err)
    return new NextResponse("Failed to fetch the requested resource", { status: 500 })
  }
} 