#!/usr/bin/env bash
# Create all app secrets in AWS Secrets Manager at once.
# Run after setup.sh, once you have all API keys.
# Usage: bash infra/aws/secrets-create.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

# ── Fill in these values ─────────────────────────────────────
DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://postgres:PASSWORD@RDS_ENDPOINT:5432/smartjobapply}"
SYNC_DATABASE_URL="${SYNC_DATABASE_URL:-postgresql://postgres:PASSWORD@RDS_ENDPOINT:5432/smartjobapply}"
REDIS_URL="${REDIS_URL:-redis://ELASTICACHE_ENDPOINT:6379/0}"
SECRET_KEY=$(openssl rand -hex 32)
OPENAI_API_KEY="${OPENAI_API_KEY:-sk-...}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-...}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-...}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-smartjobapply-resumes-ACCOUNT_ID}"
SENDGRID_API_KEY="${SENDGRID_API_KEY:-SG....}"
APIFY_API_TOKEN="${APIFY_API_TOKEN:-apify_api_...}"
# ─────────────────────────────────────────────────────────────

SECRET_VALUE=$(cat <<EOF
{
  "DATABASE_URL":          "$DATABASE_URL",
  "SYNC_DATABASE_URL":     "$SYNC_DATABASE_URL",
  "REDIS_URL":             "$REDIS_URL",
  "SECRET_KEY":            "$SECRET_KEY",
  "OPENAI_API_KEY":        "$OPENAI_API_KEY",
  "AWS_ACCESS_KEY_ID":     "$AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY": "$AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME":        "$S3_BUCKET_NAME",
  "SENDGRID_API_KEY":      "$SENDGRID_API_KEY",
  "APIFY_API_TOKEN":       "$APIFY_API_TOKEN"
}
EOF
)

echo "Creating/updating secret smartjobapply/prod ..."
aws secretsmanager create-secret \
  --name "smartjobapply/prod" \
  --description "SmartJobApply production secrets" \
  --secret-string "$SECRET_VALUE" \
  --region "$AWS_REGION" 2>/dev/null || \
aws secretsmanager put-secret-value \
  --secret-id "smartjobapply/prod" \
  --secret-string "$SECRET_VALUE" \
  --region "$AWS_REGION"

echo "Done. SECRET_KEY=$SECRET_KEY — also add to GitHub Secrets."
