#!/usr/bin/env bash
# Creates an Application Load Balancer in front of the ECS backend service.
# This gives you a stable HTTPS URL for the API.
# Run AFTER ecs-services-create.sh.
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
VPC_ID="${VPC_ID:-vpc-xxx}"
SUBNET_IDS="${SUBNET_IDS:-subnet-xxx subnet-yyy}"   # space-separated for ALB
BACKEND_SG="${BACKEND_SG:-sg-xxx}"
CLUSTER="smartjobapply-cluster"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "[1/4] Creating ALB..."
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name smartjobapply-alb \
  --subnets $SUBNET_IDS \
  --security-groups "$BACKEND_SG" \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region "$AWS_REGION" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)
echo "    ALB ARN: $ALB_ARN"

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query "LoadBalancers[0].DNSName" --output text --region "$AWS_REGION")
echo "    ALB DNS: $ALB_DNS"

echo "[2/4] Creating target group..."
TG_ARN=$(aws elbv2 create-target-group \
  --name smartjobapply-backend-tg \
  --protocol HTTP --port 8000 \
  --vpc-id "$VPC_ID" \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --region "$AWS_REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text)
echo "    Target Group ARN: $TG_ARN"

echo "[3/4] Creating HTTP listener (redirect to HTTPS)..."
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP --port 80 \
  --default-actions "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region "$AWS_REGION" > /dev/null

echo "[4/4] Done. Next steps:"
echo "  1. Request an ACM certificate for your domain in us-east-1"
echo "  2. Add HTTPS listener (port 443) pointing to target group: $TG_ARN"
echo "  3. Update ECS backend service to use load balancer: $ALB_ARN"
echo "  4. Set BACKEND_URL GitHub secret to: https://$ALB_DNS"
echo "     (or your custom domain after DNS setup)"
