import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

// SigNoz (via Foundry's default compose casting) exposes its OTLP HTTP
// receiver on localhost:4318. Override with OTEL_EXPORTER_OTLP_ENDPOINT
// in .env.local if you're pointing at SigNoz Cloud or a remote collector.
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const traceExporter = new OTLPTraceExporter({
  url: `${OTLP_ENDPOINT}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${OTLP_ENDPOINT}/v1/metrics`,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "agentops-studio",
    [SemanticResourceAttributes.SERVICE_VERSION]: "0.1.0",
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5000,
  }),
});

sdk.start();
console.log(`[otel] agentops-studio exporting to ${OTLP_ENDPOINT}`);

// Flush telemetry on shutdown so the last spans of a run aren't lost.
process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
