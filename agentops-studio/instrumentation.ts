// Next.js calls `register()` exactly once, when the server process boots —
// before any request is handled. This is the one place we start the OTEL SDK.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Only run on the Node.js server runtime (not edge, not the browser).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/otel/register");
  }
}
