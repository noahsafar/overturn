#!/bin/bash
set -e

# Production deployment script
# Usage: ./scripts/deploy-production.sh [version]
# WARNING: This deploys to production!

VERSION=${1:-$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)}
ENVIRONMENT="production"

echo "⚠️  DEPLOYING TO PRODUCTION (version: $VERSION)"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Deployment cancelled."
    exit 1
fi

# Validate environment
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "❌ AWS credentials not set. Please configure AWS credentials."
    exit 1
fi

# Run pre-deployment checks
echo "🔍 Running pre-deployment checks..."
pnpm test || { echo "❌ Tests failed"; exit 1; }
pnpm --filter @overturn/db db:validate || { echo "❌ Schema validation failed"; exit 1; }

# Create pre-deployment snapshot
echo "💾 Creating pre-deployment snapshot..."
SNAPSHOT_ID="pre-deploy-$(date +%Y%m%d-%H%M%S)"
aws rds create-db-snapshot \
    --db-instance-identifier overturn-production \
    --db-snapshot-identifier $SNAPSHOT_ID

echo "✅ Snapshot created: $SNAPSHOT_ID"

# Get ECR login
echo "📦 Logging into ECR..."
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

ECR_REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Build and push web
echo "🌐 Building web image..."
docker build -f infra/docker/Dockerfile.web.prod -t $ECR_REGISTRY/overturn-web:$VERSION .
docker tag $ECR_REGISTRY/overturn-web:$VERSION $ECR_REGISTRY/overturn-web:$ENVIRONMENT
docker tag $ECR_REGISTRY/overturn-web:$VERSION $ECR_REGISTRY/overturn-web:latest
docker push $ECR_REGISTRY/overturn-web:$VERSION
docker push $ECR_REGISTRY/overturn-web:$ENVIRONMENT
docker push $ECR_REGISTRY/overturn-web:latest

# Build and push worker
echo "⚙️  Building worker image..."
docker build -f infra/docker/Dockerfile.worker.prod -t $ECR_REGISTRY/overturn-worker:$VERSION .
docker tag $ECR_REGISTRY/overturn-worker:$VERSION $ECR_REGISTRY/overturn-worker:$ENVIRONMENT
docker tag $ECR_REGISTRY/overturn-worker:$VERSION $ECR_REGISTRY/overturn-worker:latest
docker push $ECR_REGISTRY/overturn-worker:$VERSION
docker push $ECR_REGISTRY/overturn-worker:$ENVIRONMENT
docker push $ECR_REGISTRY/overturn-worker:latest

# Deploy to ECS (rolling update)
echo "🚀 Deploying to ECS..."
aws ecs update-service --cluster overturn-$ENVIRONMENT --service web --force-new-deployment
aws ecs update-service --cluster overturn-$ENVIRONMENT --service worker --force-new-deployment

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
aws ecs wait services-stable --cluster overturn-$ENVIRONMENT --services web || { echo "❌ Web deployment failed"; exit 1; }
aws ecs wait services-stable --cluster overturn-$ENVIRONMENT --services worker || { echo "❌ Worker deployment failed"; exit 1; }

# Run migrations
echo "🗄️  Running database migrations..."
RDS_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier overturn-production --query "DBInstances[0].Endpoint.Address" --output text)
PHI_ENC_KEY=$(aws secrets-manager get-secret-value --secret-id overturn/production/phi_enc_key --query "SecretString" --output text)

export DATABASE_URL="postgresql://overturn:${DATABASE_PASSWORD}@${RDS_ENDPOINT}:5432/overturn"
export PHI_ENC_KEY=$PHI_ENC_KEY

pnpm --filter @overturn/db migrate:deploy

# Run smoke tests
echo "🧪 Running smoke tests..."
curl -f https://app.overturn.com/api/health || { echo "❌ Health check failed"; exit 1; }
pnpm e2e || { echo "❌ E2E tests failed"; exit 1; }

echo "✅ Production deployment complete!"
echo "📊 Monitoring: https://sentry.io/..."
echo "📈 Dashboard: https://grafana.overturn.com"
