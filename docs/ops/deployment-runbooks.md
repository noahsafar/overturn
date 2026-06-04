# Deployment Runbooks

This document contains runbooks for common deployment and operational scenarios.

## Table of Contents

1. [Initial Deployment](#initial-deployment)
2. [Rolling Updates](#rolling-updates)
3. [Rollback Procedures](#rollback-procedures)
4. [Emergency Procedures](#emergency-procedures)
5. [Database Operations](#database-operations)
6. [Monitoring and Alerts](#monitoring-and-alerts)

---

## Initial Deployment

### Prerequisites Checklist

- [ ] All BAAs signed with vendors
- [ ] AWS account configured with appropriate permissions
- [ ] Domain name obtained and DNS configured
- [ ] SSL certificates obtained
- [ ] Database instance provisioned (RDS PostgreSQL)
- [ ] ECR repositories created
- [ ] ECS clusters configured
- [ ] Secrets stored in AWS Secrets Manager
- [ ] Monitoring tools configured (Sentry, Grafana, Prometheus)
- [ ] Log aggregation configured (if using external service)

### Step-by-Step Initial Deployment

#### 1. Prepare Environment Variables

```bash
# Copy the production environment template
cp infra/environments/production.env.example .env.production

# Fill in all required values
vim .env.production

# Validate the environment file
cd packages/shared && pnpm run validate-env
```

#### 2. Build and Push Docker Images

```bash
# Build web image
docker build -f infra/docker/Dockerfile.web.prod -t overturn-web:latest .

# Build worker image
docker build -f infra/docker/Dockerfile.worker.prod -t overturn-worker:latest .

# Tag for ECR
docker tag overturn-web:latest <ECR_REPO>/overturn-web:latest
docker tag overturn-worker:latest <ECR_REPO>/overturn-worker:latest

# Push to ECR
docker push <ECR_REPO>/overturn-web:latest
docker push <ECR_REPO>/overturn-worker:latest
```

#### 3. Run Database Migrations

```bash
# Backup database first
./packages/db/scripts/migrate.sh production migrate
```

#### 4. Deploy to ECS

```bash
# Update ECS task definitions
aws ecs register-task-definition --cli-input-json file://infra/ecs/task-definition-web.json
aws ecs register-task-definition --cli-input-json file://infra/ecs/task-definition-worker.json

# Update ECS service
aws ecs update-service --cluster overturn-production --service overturn-web --force-new-deployment
aws ecs update-service --cluster overturn-production --service overturn-worker --force-new-deployment
```

#### 5. Verify Deployment

```bash
# Check service status
aws ecs describe-services --cluster overturn-production --services overturn-web

# Check health endpoint
curl https://app.overturn.com/api/health

# Check worker health
curl https://worker.overturn.com/health

# Verify logs
aws logs tail /ecs/overturn-web --follow
aws logs tail /ecs/overturn-worker --follow
```

---

## Rolling Updates

### Standard Rolling Update

Use the GitHub Actions workflow for safe rolling updates:

```bash
# Trigger from GitHub
# Or use the deploy script
./scripts/deploy-production.sh deploy
```

The workflow will:
1. Build new Docker images
2. Run database migrations
3. Deploy new task definition
4. Perform health checks
5. Roll back on failure

### Manual Rolling Update

If automation fails, manually perform rolling update:

```bash
# 1. Build and push new images
docker build -f infra/docker/Dockerfile.web.prod -t overturn-web:v1.2.3 .
docker push overturn-web:v1.2.3

# 2. Update ECS service with new version
aws ecs update-service \
  --cluster overturn-production \
  --service overturn-web \
  --task-definition overturn-web:v1.2.3 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=50"

# 3. Monitor deployment
aws ecs describe-services --cluster overturn-production --services overturn-web --query 'services[0].deployments[0]'

# 4. Verify health
watch -n 5 'curl -s https://app.overturn.com/api/health | jq'
```

### Zero-Downtime Deployment Strategy

For critical updates requiring zero downtime:

1. **Blue-Green Deployment**
   - Create new ECS service (green)
   - Deploy to green environment
   - Test thoroughly
   - Switch traffic using load balancer
   - Decommission old service (blue)

2. **Canary Deployment**
   - Deploy to single instance first
   - Monitor for 30 minutes
   - Gradually increase traffic
   - Full rollout if stable

---

## Rollback Procedures

### Immediate Rollback (Automated)

The GitHub Actions workflow includes automatic rollback on failure:

```bash
# Trigger rollback
./scripts/deploy-production.sh rollback
```

### Manual Rollback

If automated rollback fails:

```bash
# 1. Identify previous stable version
aws ecs describe-task-definition --task-definition overturn-web --query 'taskDefinition.revision'

# 2. Rollback to previous version
aws ecs update-service \
  --cluster overturn-production \
  --service overturn-web \
  --task-definition overturn-web:<PREVIOUS_REVISION> \
  --force-new-deployment

# 3. Monitor rollback
aws ecs describe-services --cluster overturn-production --services overturn-web
```

### Database Rollback

If database migration caused issues:

```bash
# 1. Identify problematic migration
ls packages/db/prisma/migrations/

# 2. Rollback migration
./packages/db/scripts/migrate.sh production rollback <migration_name>

# 3. If rollback fails, restore from backup
pg_restore -d $DATABASE_URL packages/db/backups/overturn_production_<TIMESTAMP>.sql

# 4. Revert code
git revert <commit-hash>
git push origin main

# 5. Redeploy
./scripts/deploy-production.sh deploy
```

---

## Emergency Procedures

### Application Not Responding

**Symptoms**: Health checks failing, timeouts

**Steps**:

1. **Check ECS Service Status**
   ```bash
   aws ecs describe-services --cluster overturn-production --services overturn-web
   ```

2. **Check Instance Health**
   ```bash
   aws ecs describe-tasks --cluster overturn-production --tasks <TASK_ID>
   ```

3. **View Recent Logs**
   ```bash
   aws logs tail /ecs/overturn-web --since 5m
   ```

4. **Check Database Connectivity**
   ```bash
   # Connect to RDS instance
   psql $DATABASE_URL
   ```

5. **Restart if Necessary**
   ```bash
   aws ecs update-service --cluster overturn-production --service overturn-web --force-new-deployment
   ```

### High Error Rates

**Symptoms**: Sentry showing increased error rate

**Steps**:

1. **Identify Error Pattern**
   - Check Sentry for error trends
   - Identify common error messages
   - Check if errors are user-specific or system-wide

2. **Check Recent Deployments**
   ```bash
   git log -5
   aws ecs describe-services --cluster overturn-production --services overturn-web
   ```

3. **Scale Resources if Needed**
   ```bash
   aws ecs update-service --cluster overturn-production --service overturn-web --desired-count 5
   ```

4. **Enable Debug Mode**
   ```bash
   # Add to environment
   DEBUG_LOGS=true
   ```

5. **Rollback if Recent Deployment**
   ```bash
   ./scripts/deploy-production.sh rollback
   ```

### Database Performance Issues

**Symptoms**: Slow queries, timeouts

**Steps**:

1. **Check RDS Metrics**
   - CPU utilization
   - Connection count
   - Disk I/O

2. **Identify Slow Queries**
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

3. **Check for Locks**
   ```sql
   SELECT * FROM pg_stat_activity WHERE state = 'active';
   ```

4. **Kill Long-Running Queries if Safe**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'active' AND query_start < now() - interval '5 minutes';
   ```

5. **Scale Database if Needed**
   ```bash
   aws rds modify-db-instance --db-instance-identifier overturn-prod --db-instance-class db.t3.large
   ```

### Security Incident

**Symptoms**: Suspicious activity, potential breach

**Steps**:

1. **Assess Scope**
   - Check audit logs
   - Identify affected systems
   - Determine data exposure

2. **Containment**
   - Block suspicious IPs
   - Rotate compromised credentials
   - Enable additional logging

3. **Notification**
   - Notify security team
   - Notify affected users
   - Document incident

4. **Recovery**
   - Patch vulnerabilities
   - Restore from clean backups
   - Implement additional safeguards

---

## Database Operations

### Routine Maintenance

#### Database Backup Verification

```bash
# List recent backups
aws rds describe-db-snapshots --db-instance-identifier overturn-prod

# Verify backup can be restored
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier overturn-verification \
  --db-snapshot-identifier overturn-prod-snapshot-<TIMESTAMP>
```

#### Index Maintenance

```sql
-- Check for unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexname NOT LIKE '%_pkey';

-- Reindex fragmented indexes
REINDEX INDEX CONCURRENTLY index_name;
```

#### Statistics Update

```sql
-- Update table statistics
ANALYZE denials;
ANALYZE appeals;
ANALYZE claims;
```

### Data Cleanup

#### Removing Old Records

```sql
-- Archive old appeals (older than 90 days)
CREATE TABLE appeals_archive AS
SELECT * FROM appeals
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete from main table
DELETE FROM appeals
WHERE created_at < NOW() - INTERVAL '90 days';

-- Verify and drop archive when safe
-- DROP TABLE appeals_archive;
```

---

## Monitoring and Alerts

### Critical Alerts

Configure these alerts in Grafana/Prometheus:

1. **Application Down**
   - Health check failing for 2 minutes
   - Severity: P1
   - Action: Page on-call engineer

2. **High Error Rate**
   - Error rate > 5% for 5 minutes
   - Severity: P1
   - Action: Page on-call engineer

3. **Database Connection Issues**
   - Failed connections > 10% for 5 minutes
   - Severity: P1
   - Action: Page on-call engineer + DBA

4. **High Latency**
   - P95 latency > 5 seconds for 10 minutes
   - Severity: P2
   - Action: Notify on-call engineer

5. **Disk Space Low**
   - Disk usage > 80%
   - Severity: P2
   - Action: Email on-call engineer

### Warning Alerts

1. **Elevated Error Rate**
   - Error rate > 1% for 15 minutes
   - Severity: P3
   - Action: Email team

2. **High CPU Usage**
   - CPU > 70% for 15 minutes
   - Severity: P3
   - Action: Email team

3. **Memory Pressure**
   - Memory usage > 80%
   - Severity: P3
   - Action: Email team

### Daily Health Checks

Run these daily:

```bash
#!/bin/bash
# Daily health check script

echo "=== Overturn Daily Health Check ==="
echo "Date: $(date)"
echo ""

# Check web service
echo "Web Service Status:"
curl -s https://app.overturn.com/api/health | jq .

echo ""
echo "Worker Service Status:"
curl -s https://worker.overturn.com/health | jq .

echo ""
echo "Database Connections:"
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

echo ""
echo "Recent Errors:"
sentry-cli projects issues --query "is:unresolved" --stats "30d"
```

### Weekly Reviews

Review these items weekly:

1. **Error Trends**
   - Sentry error report
   - Common error patterns
   - Resolution status

2. **Performance Metrics**
   - API latency percentiles
   - Database query performance
   - LLM call success rates

3. **Resource Utilization**
   - CPU/memory trends
   - Disk usage
   - Network I/O

4. **Cost Review**
   - AWS costs
   - LLM API costs
   - Third-party service costs

---

## Troubleshooting Guide

### Common Issues

#### Issue: Health Check Failing

**Diagnosis**:
```bash
curl -v https://app.overturn.com/api/health
```

**Solutions**:
1. Check if database is accessible
2. Verify environment variables
3. Check for recently deployed changes
4. Review application logs

#### Issue: Database Connection Pool Exhausted

**Diagnosis**:
```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Solutions**:
1. Kill idle connections
2. Increase pool size
3. Scale database instance
4. Check for connection leaks

#### Issue: High Memory Usage

**Diagnosis**:
```bash
docker stats <container_id>
```

**Solutions**:
1. Check for memory leaks
2. Restart affected containers
3. Scale up instance type
4. Profile memory usage

---

## Runbook Maintenance

Keep runbooks up to date:

1. **After Each Incident**
   - Document what happened
   - Update relevant procedures
   - Add new scenarios if needed

2. **Monthly Review**
   - Verify all procedures still accurate
   - Update with new infrastructure
   - Remove outdated information

3. **Quarterly Drills**
   - Practice rollback procedures
   - Test alert responsiveness
   - Verify backup/restore procedures
