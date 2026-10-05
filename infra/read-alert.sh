#!/usr/bin/env bash
# An email when the project's Firestore reads over the last 24 hours pass 60% of the free plan's
# daily 50,000 (docs/one-site.md "Budgets"). Cloud Monitoring, free; safe to re-run: the channel and
# the policy are found by name and updated.
#
#   ALERT_EMAIL=you@example.com infra/read-alert.sh <project> [threshold]
#
# Reads are counted as Firestore bills them against the quota: documents returned
# (`document/read_count`) plus one for every query and aggregation request, which Firestore bills
# at least one read even when it returns nothing and which `read_count` leaves out. The window is
# the last 24 hours, not the quota's Pacific day, so the email comes early rather than late.
set -euo pipefail
PROJECT=${1:?usage: ALERT_EMAIL=… read-alert.sh <project> [threshold]}
THRESHOLD=${2:-30000}
EMAIL=${ALERT_EMAIL:?ALERT_EMAIL is not set}
API=https://monitoring.googleapis.com/v3/projects/$PROJECT
auth=(-H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json")
CHANNEL_NAME="Huishouden budget alerts"
POLICY_NAME="Firestore reads over 60% of the free quota"

gcloud services enable monitoring.googleapis.com --project "$PROJECT" >/dev/null

channel=$(curl -sf "${auth[@]}" -G "$API/notificationChannels" --data-urlencode "filter=type=\"email\" AND display_name=\"$CHANNEL_NAME\"" | jq -r '.notificationChannels[0].name // empty')
channel_body=$(jq -n --arg n "$CHANNEL_NAME" --arg e "$EMAIL" '{type: "email", displayName: $n, labels: {email_address: $e}}')
if [[ -z "$channel" ]]; then
  channel=$(curl -sf "${auth[@]}" -X POST "$API/notificationChannels" -d "$channel_body" | jq -r .name)
  echo "  created the email channel"
else
  curl -sf "${auth[@]}" -X PATCH "https://monitoring.googleapis.com/v3/$channel?updateMask=labels" -d "$channel_body" >/dev/null
  echo "  email channel up to date"
fi

query="(sum(increase(firestore_googleapis_com:document_read_count{monitored_resource=\"firestore_instance\"}[1d])) or vector(0)) + (sum(increase(firestore_googleapis_com:api_request_count{monitored_resource=\"datastore_request\",api_method=~\"RunQuery|RunAggregationQuery\"}[1d])) or vector(0)) > $THRESHOLD"
policy_body=$(jq -n --arg n "$POLICY_NAME" --arg q "$query" --arg c "$channel" --arg t "$THRESHOLD" '{
  displayName: $n,
  combiner: "OR",
  documentation: {mimeType: "text/markdown", content: ("Firestore has billed more than " + $t + " reads in the last 24 hours. The free (Spark) plan stops every read at 50,000 a day until midnight Pacific, for every app. Find the source: pwa-kit docs/one-site.md \"Budgets\".")},
  conditions: [{displayName: ("Reads in 24 hours over " + $t), conditionPrometheusQueryLanguage: {query: $q, duration: "0s", evaluationInterval: "300s"}}],
  alertStrategy: {autoClose: "86400s"},
  notificationChannels: [$c]
}')
policy=$(curl -sf "${auth[@]}" -G "$API/alertPolicies" --data-urlencode "filter=display_name=\"$POLICY_NAME\"" | jq -r '.alertPolicies[0].name // empty')
if [[ -z "$policy" ]]; then
  curl -sf "${auth[@]}" -X POST "$API/alertPolicies" -d "$policy_body" >/dev/null
  echo "  created the alert: $POLICY_NAME ($THRESHOLD reads in 24 hours)"
else
  curl -sf "${auth[@]}" -X PATCH "https://monitoring.googleapis.com/v3/$policy" -d "$policy_body" >/dev/null
  echo "  alert up to date: $POLICY_NAME ($THRESHOLD reads in 24 hours)"
fi
