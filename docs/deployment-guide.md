# Production Deployment Guide

Complete guide for deploying Overturn to staging and production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Initial Setup](#initial-setup)
4. [Deployment Methods](#deployment-methods)
5. [Environment Configuration](#environment-configuration)
6. [Rolling Updates](#rolling-updates)
7. [Rollback Procedures](#rollback-procedures)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts & Services

- **AWS Account** with BAA signed
- **GitHub** repository access
- **Clerk** HIPAA tier account with BAA
- **Anthropic** API account with ZDR endpoint and BAA
- **Sentry** account for error tracking
- **Langfuse** account for LLM observability
- **Stripe** account with BAA
- **Documo** account with BAA
- **Lob** account with BAA
- **Resend** account with BAA
- **Browserbase** account with BAA

### Local Tools

- Docker 20+
- AWS CLI 2+
- pnpm 9+
- Python 3.12+
- uv (Python package manager)

### AWS Services Setup

1. **ECR Repositories** (created via Terraform)
   - `overturn-web`
   - `overturn-worker`

2. **ECS Clusters** (created via Terraform)
   - `overturn-staging`
   - `overturn-production`

3. **RDS Instances** (created via Terraform)
   - `overturn-staging`
   - `overturn-production`

4. **Secrets Manager** (created via Terraform)
   - `overturn/staging/phi_enc_key`
   - `overturn/production/phi_enc_key`
   - Database credentials
   - API keys

---

## Architecture Overview

### Components

```
                    ┌─────────────────────────────────────────────┐
                    │              AWS CloudFront                 │
                    │              (SSL Termination)              │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │           Vercel (Web App)                  │
                    │       or ECS Fargate (optional)            │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │         ECS Fargate (Worker)                │
                    │  - Appeal Drafting Workflows               │
                    │  - Submission Automation                  │
                    │  - Follow-up Processing                   │
                    └──────────────────┬──────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
┌───────▼────────┐          ┌────────▼────────┐         ┌──────────▼─────────┐
│  RDS Postgres  │          │  Temporal Cloud  │         │   S3 Buckets      │
│  + pgvector    │◄────────►│  (Orchestration)│         │   - Artifacts      │
└────────────────┘          └─────────────────┘         │   - Audit logs     │
                                                            │   - Screenshots    │
                                                            └───────────────────┘
```

### Data Flow

1. **Web App** receives user requests
2. **Worker** processes workflows via Temporal
3. **RDS** stores all application data
4. **S3** stores artifacts and audit logs
5. **External APIs** (Clerk, Anthropic, Documo, etc.) integrate via secure connections

---

## Initial Setup

### 1. Configure AWS Credentials

```bash
aws configure
# Enter your AWS credentials
# Default region: us-east-1
```

### 2. Create ECR Repositories

```bash
# Web repository
aws ecr create-repository --repository-name overturn-web --image-tag-mutability MUTABLE

# Worker repository
aws ecr create-repository --repository-name overturn-worker --image-tag-mutability MUTABLE
```

### 3. Generate PHI Encryption Key

```bash
node -e "console.log('PHI_ENC_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Store this in AWS Secrets Manager:
```bash
aws secrets-manager create-secret \
  --name overturn/production/phi_enc_key \
  --secret-string "YOUR_BASE64_KEY_HERE"
```

### 4. Configure Environment Variables

Copy the appropriate environment template:
```bash
cp infra/environments/staging.env.example infra/environments/staging.env
cp infra/environments/production.env.example infra/environments/production.env
```

Fill in all required values.

---

## Deployment Methods

### Method 1: GitHub Actions (Recommended)

#### Staging Deployment

Push to `staging` branch:
```bash
git checkout staging
git merge main
git push origin staging
```

#### Production Deployment

Create and push a version tag:
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Or trigger manually via GitHub Actions UI.

### Method 2: Manual Deployment

#### Staging

```bash
chmod +x scripts/deploy-staging.sh
./scripts/deploy-staging.sh
```

#### Production

```bash
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh v1.0.0
```

---

## Environment Configuration

### Required Secrets

Configure these in GitHub Secrets (for CI/CD) or AWS Secrets Manager:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `DATABASE_PASSWORD` | RDS master password | `SecurePassword123!` |
| `CLERK_SECRET_KEY` | Clerk secret | `sk_live_...` |
| `ANTHROPIC_API_KEY` | Anthropic API key | `sk-ant-...` |
| `BROWSERBASE_API_KEY` | Browserbase key | `bbs_...` |
| `SENTRY_AUTH_TOKEN` | Sentry auth token | `sntrys_...` |
| `STRIPE_SECRET_KEY` | Stripe secret | `sk_live_...` |

### Environment-Specific Configuration

**Staging:**
- Lower cost instances
- Development mode features enabled
- Test data only
- Relaxed rate limits

**Production:**
- High-availability instances
- All security features enabled
- Real PHI handling
- Strict rate limits
- Enhanced monitoring

---

## Rolling Updates

### ECS Deployment Strategy

Both web and worker use ECS rolling updates:

1. **New task definition** created with new image tag
2. **ECS scheduler** gradually replaces old tasks
3. **Health checks** verify new tasks are healthy
4. **Old tasks** terminated after new tasks healthy

### Update Process

```bash
# Update web service
aws ecs update-service \
  --cluster overturn-production \
  --service web \
  --force-new-deployment

# Update worker service
aws ecs update-service \
  --cluster overturn-production \
  --service worker \
  --force-new-deployment

# Wait for stability
aws ecs wait services-stable \
  --cluster overturn-production \
  --services web,worker
```

### Database Migrations

Migrations run automatically during deployment via CI/CD:

```bash
# Manual migration (if needed)
export DATABASE_URL="postgresql://..."
export PHI_ENC_KEY="..."
pnpm --filter @overturn/db migrate:deploy
```

---

## Rollback Procedures

### Automatic Rollback

CI/CD automatically rolls back if:
- Smoke tests fail
- Health checks fail
- Error rate increases significantly

### Manual Rollback

#### Step 1: Identify Previous Task Definition

```bash
aws ecs list-task-definitions \
  --family-prefix overturn-web \
  --sort DESC \
  --max-items 5
```

#### Step 2: Rollback Web Service

```bash
aws ecs update-service \
  --cluster overturn-production \
  --service web \
  --task-definition overturn-web:PREVIOUS_VERSION
```

#### Step 3: Rollback Worker Service

```bash
aws ecs update-service \
  --cluster overturn-production \
  --service worker \
  --task-definition overturn-worker:PREVIOUS_VERSION
```

#### Step 4: Database Rollback (if needed)

```bash
# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier overturn-production

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier overturn-production-rollback \
  --db-snapshot-identifier pre-deploy-TIMESTAMP
```

---

## Monitoring

### Key Metrics

**Application Metrics:**
- Request rate and error rate
- Response times (p50, p95, p99)
- Database connection pool usage
- Temporal workflow queue depth
- LLM token usage and costs

**Business Metrics:**
- Appeals submitted per hour
- Submission success rate
- Appeal win rate
- Time to submission

### Monitoring Tools

**Sentry** (Error Tracking):
- URL: https://sentry.io/organizations/overturn/
- Monitors: Application errors, performance issues
- Alerts: Critical errors, increased error rate

**Langfuse** (LLM Observability):
- URL: https://app.langfuse.com/
- Monitors: LLM calls, token usage, costs
- Alerts: Unusual patterns, high costs

**CloudWatch** (AWS Infrastructure):
- ECS task health
- RDS performance
- Lambda functions (if used)
- API Gateway (if used)

### Alert Configuration

Configure alerts for:

**Critical (Page Immediately):**
- Error rate >5%
- Response time p95 >5s
- Database connections >90% pool
- Any service down
- Security incidents

**Warning (Page within 15 minutes):**
- Error rate >1%
- Response time p95 >2s
- Database connections >70% pool
- High workflow queue depth

**Info (Daily Digest):**
- Deployment summaries
- Performance trends
- Cost summaries

---

## Troubleshooting

### Common Issues

#### 1. Deployment Fails

**Symptoms:** CI/CD deployment fails

**Diagnosis:**
```bash
# Check GitHub Actions logs
# Check ECS task history
aws ecs describe-tasks --cluster overturn-production --tasks <task-id>
```

**Resolution:**
- Verify Docker images built successfully
- Check ECR repository permissions
- Verify task definition roles and permissions
- Check CloudWatch Logs for application errors

#### 2. Database Connection Failures

**Symptoms:** Application can't connect to database

**Diagnosis:**
```bash
# Check RDS instance status
aws rds describe-db-instances --db-instance-identifier overturn-production

# Check security groups
aws ec2 describe-security-groups --group-ids <sg-id>
```

**Resolution:**
- Verify RDS instance is available
- Check security group allows traffic from ECS
- Verify DATABASE_URL is correct
- Check database connection limits

#### 3. High Memory/CPU Usage

**Symptoms:** ECS tasks using excessive resources

**Diagnosis:**
```bash
# Check task metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=web

# Check specific task
aws ecs describe-tasks --cluster overturn-production --tasks <task-id>
```

**Resolution:**
- Check for memory leaks in application
- Scale up task memory/CPU
- Check for runaway processes
- Review recent deployments for issues

#### 4. Temporal Workflow Failures

**Symptoms:** Workflows stuck or failing

**Diagnosis:**
```bash
# Check Temporal UI
# Query stuck workflows
```

**Resolution:**
- Check Temporal worker connectivity
- Verify activity timeouts are appropriate
- Check for non-deterministic workflow code
- Review workflow execution history

### Emergency Procedures

#### Service Outage

1. **Identify scope** - Which services affected?
2. **Check monitoring** - What do metrics show?
3. **Review recent changes** - Any deployments?
4. **Create incident channel** - `#incident-<name>`
5. **Implement workaround** - Can we bypass the issue?
6. **Escalate if needed** - Page on-call engineer

#### Data Issues

1. **Stop affected services** - Prevent further damage
2. **Preserve logs** - Save all relevant logs
3. **Assess impact** - What data affected?
4. **Implement recovery** - Restore from backup if needed
5. **Document incident** - What happened and why?

---

## Security Considerations

### PHI Protection

- All PHI encrypted at rest (AES-256)
- All PHI encrypted in transit (TLS 1.3)
- No PHI in logs or monitoring
- Regular security audits
- Access logging and review

### Access Control

- MFA required for all admin access
- Role-based access control (RBAC)
- Regular access reviews (quarterly)
- Principle of least privilege
- Audit all PHI access

### Compliance

- All BAAs signed with vendors
- HIPAA security requirements met
- Regular vulnerability scanning
- Incident response procedures
- Business continuity planning

---

## Related Documentation

- [Operations Runbooks](ops/runbooks.md)
- [Production Wiring](../production-wiring.md)
- [Build Summary](../BUILD_SUMMARY.md)
- [Development Spec](../planning/DEV%20SPEC.md)
