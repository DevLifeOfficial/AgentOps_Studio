#!/bin/bash
INPUTS=(
  "Summarize the latest developments in AI observability"
  "Research competitor pricing for observability platforms"
  "Draft a report on Q3 infrastructure costs"
  "Find recent papers on LLM agent reliability"
  "Summarize customer feedback from the last sprint"
  "Analyze recent incident patterns in production"
  "Compile a list of OpenTelemetry best practices"
  "Research trends in multi-agent orchestration"
  "Summarize the SigNoz hackathon rules"
  "Draft release notes for the latest deploy"
  "Find case studies on AI agent observability"
  "Research token cost optimization strategies"
  "Summarize recent SRE postmortems"
  "Draft a proposal for improved alerting"
  "Research LLM eval frameworks"
  "Summarize competitor feature comparisons"
  "Analyze latency trends across services"
  "Draft a changelog for this release"
)

echo "Firing ${#INPUTS[@]} demo runs over ~12 minutes..."
for input in "${INPUTS[@]}"; do
  curl -s -X POST localhost:3000/api/agent/run \
    -H "content-type: application/json" \
    -d "{\"input\":\"${input}\"}" > /dev/null
  echo "  -> ran: ${input}"
  sleep $((20 + RANDOM % 40))
done

echo "Done. Check the dashboard in a minute or two once metrics batch-export."
