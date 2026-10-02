#!/usr/bin/env bash
# Creates (or tops up) a Firebase project for a family of PWAs and wires each app repo for keyless
# CI deploys. Safe to re-run: every step checks before it creates.
#
#   infra/bootstrap.sh path/to/apps.conf
#
# apps.conf is a bash file defining:
#   PROJECT=<firebase project id>
#   GITHUB_OWNER=<github user or org>
#   APPS=( "<repo>:<hosting site>:<web app display name or empty>" ... )
# Optional: POOL, PROVIDER, SA_NAME (defaults: github, github, github-deploy);
#   ALSO_TRUSTED_OWNERS="<user or org> ..." — other owners whose repos may also deploy (each repo is
#   still allowed separately), e.g. while repos move between a user and an org.
#
# Prerequisites (once per machine), all as the same Google account:
#   npx firebase-tools login ; gcloud auth login ; gh auth login
set -euo pipefail

CONFIG=${1:?usage: bootstrap.sh path/to/apps.conf}
# shellcheck source=/dev/null
source "$CONFIG"
: "${PROJECT:?PROJECT missing in $CONFIG}" "${GITHUB_OWNER:?GITHUB_OWNER missing in $CONFIG}"
POOL=${POOL:-github}
PROVIDER=${PROVIDER:-github}
SA_NAME=${SA_NAME:-github-deploy}
DISPLAY_NAME=${DISPLAY_NAME:-$PROJECT}

firebase() { npx --yes firebase-tools@14 "$@"; }
step() { printf '\n== %s\n' "$*"; }

step "Firebase project $PROJECT"
if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  firebase projects:create "$PROJECT" --display-name "$DISPLAY_NAME" || true
fi
if ! firebase projects:list --json | jq -e --arg p "$PROJECT" '.result[] | select(.projectId == $p)' >/dev/null; then
  gcloud services enable firebase.googleapis.com --project "$PROJECT"
  # 403 here on a project you own means this Google account has not accepted the Firebase terms:
  # open https://console.firebase.google.com, choose "Add project" > this project, accept, re-run.
  firebase projects:addfirebase "$PROJECT"
fi
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

step "APIs"
gcloud services enable --project "$PROJECT" \
  firebasehosting.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  identitytoolkit.googleapis.com sheets.googleapis.com drive.googleapis.com

step "Deploy service account"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "GitHub Actions deploy"
for role in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer roles/serviceusage.apiKeysViewer roles/run.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition None >/dev/null
done
echo "$SA"

step "Workload Identity Federation (GitHub OIDC: owner $GITHUB_OWNER, main branch only)"
# Numeric owner id, not the name: a renamed account's old name could be claimed by someone else.
OWNER_IDS=""
for owner in "$GITHUB_OWNER" ${ALSO_TRUSTED_OWNERS:-}; do
  OWNER_IDS+="${OWNER_IDS:+, }'$(gh api "users/$owner" --jq .id)'"
done
WIF_CONDITION="assertion.repository_owner_id in [$OWNER_IDS] && assertion.ref == 'refs/heads/main'"
gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT" --location global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT" --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT" --location global --workload-identity-pool "$POOL" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT" --location global \
       --workload-identity-pool "$POOL" --display-name "GitHub" \
       --issuer-uri "https://token.actions.githubusercontent.com" \
       --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
       --attribute-condition "$WIF_CONDITION"
# Re-applied every run so older providers pick up the stricter condition.
gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --project "$PROJECT" --location global \
  --workload-identity-pool "$POOL" --attribute-condition "$WIF_CONDITION" >/dev/null
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

for entry in "${APPS[@]}"; do
  IFS=: read -r repo site app_name <<<"$entry"
  step "$repo → $site.web.app"

  if [[ "$site" != "$PROJECT" ]]; then
    firebase hosting:sites:get "$site" --project "$PROJECT" >/dev/null 2>&1 \
      || firebase hosting:sites:create "$site" --project "$PROJECT"
  fi

  # Each repo is allowed separately; the provider condition limits tokens to main-branch runs.
  gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
    --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_OWNER/$repo" >/dev/null

  if ! gh repo view "$GITHUB_OWNER/$repo" >/dev/null 2>&1; then
    echo "repo $GITHUB_OWNER/$repo not found; skipping variables"
    continue
  fi
  gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_OWNER/$repo" --body "$WIF_PROVIDER"
  gh variable set GCP_DEPLOY_SA --repo "$GITHUB_OWNER/$repo" --body "$SA"
  # Deploys run in the production environment; only main may deploy to it.
  gh api -X PUT "repos/$GITHUB_OWNER/$repo/environments/production" --input - >/dev/null <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
  gh api -X POST "repos/$GITHUB_OWNER/$repo/environments/production/deployment-branch-policies" -f name=main -f type=branch >/dev/null 2>&1 || true
  # release-please opens release PRs with GITHUB_TOKEN; the default token stays read-only.
  gh api -X PUT "repos/$GITHUB_OWNER/$repo/actions/permissions/workflow" \
    -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true >/dev/null

  if [[ -n "$app_name" ]]; then
    app_id=$(firebase apps:list WEB --project "$PROJECT" --json | jq -r --arg n "$app_name" '.result[] | select(.displayName == $n) | .appId' | head -1)
    if [[ -z "$app_id" ]]; then
      app_id=$(firebase apps:create WEB "$app_name" --project "$PROJECT" --json | jq -r '.result.appId')
    fi
    # Web SDK config is public by design (it ships in the bundle); access is enforced by Auth and rules.
    config=$(firebase apps:sdkconfig WEB "$app_id" --project "$PROJECT" --json | jq '.result.sdkConfig')
    gh variable set VITE_FIREBASE_API_KEY --repo "$GITHUB_OWNER/$repo" --body "$(jq -r .apiKey <<<"$config")"
    # The project's default auth domain is the only redirect URI the auto-created OAuth client allows;
    # using the app's own domain needs its /__/auth/handler added to that client in the console.
    gh variable set VITE_FIREBASE_AUTH_DOMAIN --repo "$GITHUB_OWNER/$repo" --body "$PROJECT.firebaseapp.com"
    gh variable set VITE_FIREBASE_PROJECT_ID --repo "$GITHUB_OWNER/$repo" --body "$PROJECT"
    gh variable set VITE_FIREBASE_APP_ID --repo "$GITHUB_OWNER/$repo" --body "$app_id"
    gh variable set VITE_FIREBASE_MESSAGING_SENDER_ID --repo "$GITHUB_OWNER/$repo" --body "$(jq -r .messagingSenderId <<<"$config")"
    # For silent One Tap sign-in (@huishouden/pwa-kit/auth): the OAuth client Firebase created for
    # Google sign-in. Public, like the rest of the web config. Empty until Google sign-in is enabled.
    client_id=$(curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT" \
      "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/defaultSupportedIdpConfigs/google.com" | jq -r '.clientId // empty')
    [[ -n "$client_id" ]] && gh variable set VITE_GOOGLE_CLIENT_ID --repo "$GITHUB_OWNER/$repo" --body "$client_id"
  fi
done

step "Auth authorized domains"
# Firebase Auth only accepts sign-ins from listed domains. Needs Auth initialised (console step 1).
AUTH_API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config"
auth_headers=(-H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT")
current=$(curl -s "${auth_headers[@]}" "$AUTH_API")
if jq -e '.authorizedDomains' >/dev/null <<<"$current"; then
  wanted=$(for entry in "${APPS[@]}"; do IFS=: read -r _ site _ <<<"$entry"; echo "$site.web.app"; done)
  domains=$(jq -c --arg w "$wanted" '(.authorizedDomains + ($w | split("\n") | map(select(. != "")))) | unique' <<<"$current")
  curl -s -X PATCH "${auth_headers[@]}" -H "Content-Type: application/json" \
    "$AUTH_API?updateMask=authorizedDomains" -d "{\"authorizedDomains\": $domains}" | jq -c '.authorizedDomains'
else
  echo "Auth not initialised yet; do console step 1, then re-run."
fi

step "Done"
cat <<EOF
Manual steps the APIs don't cover (project $PROJECT):
  1. Firebase console > Authentication > Get started > Sign-in method > Google > Enable
     (initialises Auth on the free plan and creates the OAuth web client; no supported API does either)
  2. Google Cloud console > Google Auth Platform > Clients > the "Web client (auto created by Google
     Service)" > Authorized JavaScript origins: add https://<site>.web.app for each app using silent
     sign-in (@huishouden/pwa-kit/auth). Then re-run this script so apps get VITE_GOOGLE_CLIENT_ID.
EOF
