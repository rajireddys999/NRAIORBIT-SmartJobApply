#!/usr/bin/env bash
# Create ECS Fargate services for backend, worker, and beat.
# Run AFTER: setup.sh, secrets-create.sh, and first Docker push.
# Usage: bash infra/aws/ecs-services-create.sh
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER="smartjobapply-cluster"
SUBNET_IDS="${SUBNET_IDS:-subnet-xxx,subnet-yyy}"        # comma-separated
BACKEND_SG="${BACKEND_SG:-sg-xxx}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Replace placeholders in task definitions
for f in infra/aws/ecs-task-backend.json infra/aws/ecs-task-worker.json infra/aws/ecs-task-beat.json; do
  sed -i.bak \
    -e "s/AWS_ACCOUNT_ID/$ACCOUNT_ID/g" \
    -e "s/AWS_REGION/$AWS_REGION/g" \
    "$f"
  rm "${f}.bak"
done

# Register task definitions
echo "Registering task definitions..."
aws ecs register-task-definition --cli-input-json file://infra/aws/ecs-task-backend.json --region "$AWS_REGION"
aws ecs register-task-definition --cli-input-json file://infra/aws/ecs-task-worker.json  --region "$AWS_REGION"
aws ecs register-task-definition --cli-input-json file://infra/aws/ecs-task-beat.json    --region "$AWS_REGION"

NETWORK="awsvpcConfiguration={subnets=[${SUBNET_IDS}],securityGroups=[${BACKEND_SG}],assignPublicIp=ENABLED}"

# Backend service (1 replica)
echo "Creating backend service..."
aws ecs create-service \
  --cluster "$CLUSTER" \
  --service-name smartjobapply-backend-svc \
  --task-definition smartjobapply-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "$NETWORK" \
  --region "$AWS_REGION" 2>/dev/null || echo "  backend service already exists"

# Worker service (1 replica — scale up when load increases)
echo "Creating worker service..."
aws ecs create-service \
  --cluster "$CLUSTER" \
  --service-name smartjobapply-worker-svc \
  --task-definition smartjobapply-worker \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "$NETWORK" \
  --region "$AWS_REGION" 2>/dev/null || echo "  worker service already exists"

# Beat service (ALWAYS 1 replica — only 1 scheduler)
echo "Creating beat service..."
aws ecs create-service \
  --cluster "$CLUSTER" \
  --service-name smartjobapply-beat-svc \
  --task-definition smartjobapply-beat \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "$NETWORK" \
  --region "$AWS_REGION" 2>/dev/null || echo "  beat service already exists"

echo ""
echo "All ECS services created. Check status:"
echo "  aws ecs list-services --cluster $CLUSTER --region $AWS_REGION"
