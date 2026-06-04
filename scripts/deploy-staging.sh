#!/bin/bash
set -e

# Staging deployment script
# Usage: ./scripts/deploy-staging.sh [version]

VERSION=${1:-$(git rev-parse --short HEAD)}
ENVIRONMENT="staging"

echo "🚀 Deploying to $ENVIRONMENT (version: $VERSION)"

# Validate environment
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS credentials not set. Please configure AWS credentials."
    exit 1
fi

# Get ECR login
echo "📦 Logging into ECR..."
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

ECR_REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Build and push web
echo "🌐 Building web image..."
docker build -f infra/docker/Dockerfile.web.prod -t $ECR_REGISTRY/overturn-web:$VERSION .
docker tag $ECR_REGISTRY/overturn-web:$VERSION $ECR_REGISTRY/overturn-web:$ENVIRONMENT
docker push $ECR_REGISTRY/overturn-web:$VERSION
docker push $ECR_REGISTRY/overturn-web:$ENVIRONMENT

# Build and push worker
echo "⚙️  Building worker image..."
docker build -f infra/docker/Dockerfile.worker.prod -t $ECR_REGISTRY/overturn-worker:$VERSION .
docker tag $ECR_REGISTRY/overturn-worker:$VERSION $ECR_REGISTRY/overturn-worker:$ENVIRONMENT
docker push $ECR_REGISTRY/overturn-worker:$VERSION
docker push $ECR_REGISTRY/overturn-worker:$ENVIRONMENT

# Deploy to ECS
echo "🚀 Deploying to ECS..."
aws ecs update-service --cluster overturn-$ENVIRONMENT --service web --force-new-deployment
aws ecs update-service --cluster overturn-$ENVIRONMENT --service worker --force-new-deployment

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
aws ecs wait services-stable --cluster overturn-$ENVIRONMENT --services web
aws ecs wait services-stable --cluster overturn-$ENVIRONMENT --services worker

echo "✅ Deployment complete!"
echo "🌐 Staging URL: https://staging.overturn.com"
