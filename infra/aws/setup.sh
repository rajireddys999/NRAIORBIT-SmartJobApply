#!/usr/bin/env bash
# ============================================================
# NRAIORBIT SmartJobApply — One-shot AWS bootstrap script
# Run ONCE from your local machine after `aws configure`
# Usage: bash infra/aws/setup.sh
# ============================================================
set -euo pipefail

# ── Config — edit these ──────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT="smartjobapply"
ENV="prod"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 16)}"
# ─────────────────────────────────────────────────────────────

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "==> AWS Account : $ACCOUNT_ID"
echo "==> Region      : $AWS_REGION"
echo "==> Project     : $PROJECT"
echo ""

# ── 1. ECR repositories ──────────────────────────────────────
echo "[1/9] Creating ECR repositories..."
for repo in backend frontend; do
  aws ecr describe-repositories --repository-names "${PROJECT}-${repo}" \
    --region "$AWS_REGION" 2>/dev/null || \
  aws ecr create-repository \
    --repository-name "${PROJECT}-${repo}" \
    --region "$AWS_REGION" \
    --image-scanning-configuration scanOnPush=true \
    --query 'repository.repositoryUri' --output text
done

# ── 2. VPC (default) — use existing ─────────────────────────
echo "[2/9] Getting default VPC..."
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" --output text --region "$AWS_REGION")
echo "    VPC: $VPC_ID"

SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" --output text --region "$AWS_REGION" | tr '\t' ',')
echo "    Subnets: $SUBNET_IDS"

# ── 3. Security groups ───────────────────────────────────────
echo "[3/9] Creating security groups..."

# Backend SG (App Runner connects out — no inbound needed)
BACKEND_SG=$(aws ec2 create-security-group \
  --group-name "${PROJECT}-backend-sg" \
  --description "SmartJobApply backend" \
  --vpc-id "$VPC_ID" --region "$AWS_REGION" \
  --query GroupId --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT}-backend-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION")

# DB SG — allow 5432 from backend SG
DB_SG=$(aws ec2 create-security-group \
  --group-name "${PROJECT}-db-sg" \
  --description "SmartJobApply RDS" \
  --vpc-id "$VPC_ID" --region "$AWS_REGION" \
  --query GroupId --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT}-db-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION")

aws ec2 authorize-security-group-ingress \
  --group-id "$DB_SG" \
  --protocol tcp --port 5432 \
  --source-group "$BACKEND_SG" \
  --region "$AWS_REGION" 2>/dev/null || true

# Redis SG
REDIS_SG=$(aws ec2 create-security-group \
  --group-name "${PROJECT}-redis-sg" \
  --description "SmartJobApply Redis" \
  --vpc-id "$VPC_ID" --region "$AWS_REGION" \
  --query GroupId --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT}-redis-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$AWS_REGION")

aws ec2 authorize-security-group-ingress \
  --group-id "$REDIS_SG" \
  --protocol tcp --port 6379 \
  --source-group "$BACKEND_SG" \
  --region "$AWS_REGION" 2>/dev/null || true

# ── 4. RDS PostgreSQL ────────────────────────────────────────
echo "[4/9] Creating RDS PostgreSQL (db.t3.micro)..."
aws rds create-db-instance \
  --db-instance-identifier "${PROJECT}-db" \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version "16.3" \
  --master-username postgres \
  --master-user-password "$DB_PASSWORD" \
  --db-name smartjobapply \
  --allocated-storage 20 \
  --storage-type gp2 \
  --no-multi-az \
  --publicly-accessible \
  --vpc-security-group-ids "$DB_SG" \
  --region "$AWS_REGION" 2>/dev/null || echo "    RDS already exists or creating..."

echo "    DB Password: $DB_PASSWORD  ← SAVE THIS"

# ── 5. ElastiCache Redis ─────────────────────────────────────
echo "[5/9] Creating ElastiCache Redis (cache.t3.micro)..."
aws elasticache create-cache-cluster \
  --cache-cluster-id "${PROJECT}-redis" \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version "7.0" \
  --num-cache-nodes 1 \
  --security-group-ids "$REDIS_SG" \
  --region "$AWS_REGION" 2>/dev/null || echo "    Redis already exists or creating..."

# ── 6. S3 bucket ─────────────────────────────────────────────
echo "[6/9] Creating S3 bucket for resumes..."
BUCKET_NAME="${PROJECT}-resumes-${ACCOUNT_ID}"
aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$AWS_REGION" \
  $([ "$AWS_REGION" != "us-east-1" ] && echo "--create-bucket-configuration LocationConstraint=$AWS_REGION") \
  2>/dev/null || echo "    Bucket already exists"

aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  --region "$AWS_REGION" 2>/dev/null || true

echo "    S3 Bucket: $BUCKET_NAME"

# ── 7. IAM role for ECS tasks ────────────────────────────────
echo "[7/9] Creating ECS task execution role..."
aws iam create-role \
  --role-name "${PROJECT}-ecs-task-role" \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }' --region "$AWS_REGION" 2>/dev/null || true

aws iam attach-role-policy \
  --role-name "${PROJECT}-ecs-task-role" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
  2>/dev/null || true

aws iam attach-role-policy \
  --role-name "${PROJECT}-ecs-task-role" \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess \
  2>/dev/null || true

# ── 8. ECS Cluster ───────────────────────────────────────────
echo "[8/9] Creating ECS cluster..."
aws ecs create-cluster \
  --cluster-name "${PROJECT}-cluster" \
  --capacity-providers FARGATE \
  --region "$AWS_REGION" 2>/dev/null || echo "    Cluster already exists"

# ── 9. CloudWatch log groups ─────────────────────────────────
echo "[9/9] Creating CloudWatch log groups..."
for svc in backend worker beat; do
  aws logs create-log-group \
    --log-group-name "/ecs/${PROJECT}/${svc}" \
    --region "$AWS_REGION" 2>/dev/null || true
done

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Bootstrap complete! Add these GitHub Secrets:       ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  AWS_ACCOUNT_ID      = $ACCOUNT_ID       ║"
echo "║  AWS_REGION          = $AWS_REGION                   ║"
echo "║  AWS_ACCESS_KEY_ID   = (from IAM user)               ║"
echo "║  AWS_SECRET_ACCESS_KEY = (from IAM user)             ║"
echo "║  DB_PASSWORD         = $DB_PASSWORD  ║"
echo "║  S3_BUCKET_NAME      = $BUCKET_NAME ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next: Wait ~10 min for RDS + Redis to provision, then"
echo "get their endpoints and add to GitHub Secrets + .env"
echo ""
echo "RDS endpoint (run after ~10 min):"
echo "  aws rds describe-db-instances --db-instance-identifier ${PROJECT}-db"
echo "  --query 'DBInstances[0].Endpoint.Address' --output text"
echo ""
echo "Redis endpoint:"
echo "  aws elasticache describe-cache-clusters --cache-cluster-id ${PROJECT}-redis"
echo "  --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text"
