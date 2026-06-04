# Monitoring and Observability Setup Guide

Complete guide for setting up monitoring, alerting, and observability for Overturn.

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Stack](#monitoring-stack)
3. [Setup Instructions](#setup-instructions)
4. [Health Checks](#health-checks)
5. [Metrics Collection](#metrics-collection)
6. [Alerting Configuration](#alerting-configuration)
7. [Dashboard Setup](#dashboard-setup)
8. [Log Aggregation](#log-aggregation)
9. [Testing](#testing)

---

## Overview

Overturn uses a comprehensive monitoring stack to ensure production reliability:

- **Health Checks**: HTTP endpoints for service readiness
- **Metrics**: Prometheus-formatted metrics for performance monitoring
- **Logging**: Structured logging with PHI scrubbing
- **Error Tracking**: Sentry for exception monitoring
- **LLM Observability**: Langfuse for LLM call tracing
- **Dashboards**: Grafana for visualization
- **Alerting**: Prometheus Alertmanager for notifications

---

## Monitoring Stack

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Overturn Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Web App     │  │   Worker     │  │  Database    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           ▼                                 │
│                   ┌───────────────┐                         │
│                   │ Health Checks │                         │
│                   │ /health        │                         │
│                   └───────────────┘                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐   ┌───────▼────────┐   ┌───────▼────────┐
│   Sentry       │   │   Langfuse     │   │   Prometheus    │
│ (Error Track)  │   │ (LLM Tracing)  │   │ (Metrics)      │
└────────────────┘   └────────────────┘   └────────────────┘
                                                  │
                              ┌───────────────────┴──────────────┐
                              │                                     │
                     ┌────────▼─────────┐             ┌──────────▼─────────┐
                     │   Grafana        │             │  Alertmanager     │
                     │   (Dashboards)    │             │  (Alerting)       │
                     └───────────────────┘             └────────────────────┘
```

### Data Flow

1. **Services** emit metrics and logs
2. **Health checks** provide readiness/liveness endpoints
3. **Sentry** captures errors and exceptions
4. **Langfuse** traces LLM calls
5. **Prometheus** scrapes metrics
6. **Grafana** visualizes metrics
7. **Alertmanager** sends notifications

---

## Setup Instructions

### 1. Sentry Setup

**Create Sentry Project:**

1. Go to https://sentry.io/
2. Create new project: "overturn-production"
3. Get DSN: `https://xxx@sentry.io/xxx`

**Configure Environment Variables:**

```bash
# Production
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_TRACES_SAMPLE_RATE=0.1

# Staging
SENTRY_DSN=https://your-staging-sentry-dsn@sentry.io/staging-id
SENTRY_TRACES_SAMPLE_RATE=0.5
```

**Install Sentry Dependencies:**

```bash
# Web app
pnpm add @sentry/nextjs

# Worker (optional, Python Sentry)
pip install sentry-sdk
```

**Verify Setup:**

```bash
# Check Sentry initialization
curl https://app.overturn.com/api/health
# Should show sentry component as "healthy"
```

### 2. Langfuse Setup

**Create Langfuse Project:**

1. Go to https://langfuse.com/
2. Create new project: "overturn-llm-tracing"
3. Get API keys

**Configure Environment Variables:**

```bash
# Production
LANGFUSE_PUBLIC_KEY=your-public-key
LANGFUSE_SECRET_KEY=your-secret-key
LANGFUSE_HOST=https://langfuse.overturn.com  # Optional self-hosted

# Staging
LANGFUSE_PUBLIC_KEY=your-staging-public-key
LANGFUSE_SECRET_KEY=your-staging-secret-key
```

**Self-Hosting (for HIPAA compliance):**

```bash
# Deploy Langfuse in your HIPAA AWS account
git clone https://github.com/langfuse/langfuse.git
cd langfuse
docker-compose up -d
```

**Verify Setup:**

```bash
# Check Langfuse initialization
curl http://localhost:8001/health
# Should show langfuse component as "healthy"
```

### 3. Prometheus Setup

**Install and Configure Prometheus:**

```bash
# Install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/vX.X.X/prometheus-X.X.X.linux-amd64.tar.gz
tar xvfz prometheus-X.X.X.linux-amd64.tar.gz
cd prometheus-X.X.X.linux-amd64

# Copy our rules
cp infra/monitoring/prometheus-rules.yml /etc/prometheus/rules/
```

**Configure Prometheus (`prometheus.yml`):**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  - job_name: 'overturn-web'
    static_configs:
      - targets: ['web:3000']
    metrics_path: '/metrics'

  - job_name: 'overturn-worker'
    static_configs:
      - targets: ['worker:8001']
    metrics_path: '/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
```

**Start Prometheus:**

```bash
./prometheus --config.file=prometheus.yml
```

### 4. Grafana Setup

**Install Grafana:**

```bash
# Using Docker
docker run -d -p 3000:3000 --name grafana grafana/grafana
```

**Configure Prometheus Data Source:**

1. Login to Grafana (http://localhost:3000)
2. Add data source → Prometheus
3. URL: `http://prometheus:9090`
4. Access: proxy

**Import Dashboards:**

1. Go to Dashboards → Import
2. Upload `infra/monitoring/grafana-dashboards.json`
3. Select Prometheus data source
4. Save dashboards

**Dashboards Created:**
- Overturn Main Dashboard
- Overturn Business Metrics
- Overturn Security Dashboard

### 5. Alertmanager Setup

**Configure Alertmanager (`alertmanager.yml`):**

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'

  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true

    - match:
        severity: warning
      receiver: 'slack-warning'
      continue: true

receivers:
  - name: 'default'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_SERVICE_KEY'

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#overturn-warnings'
```

---

## Health Checks

### Web App Health Endpoint

**Endpoint:** `/api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-06-01T15:30:00Z",
  "version": "v1.0.0",
  "components": {
    "database": {
      "status": "healthy",
      "latency": 5.2
    },
    "clerk": {
      "status": "healthy",
      "message": "Clerk configured"
    },
    "worker": {
      "status": "healthy"
    }
  }
}
```

### Worker Health Endpoint

**Endpoint:** `/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-06-01T15:30:00Z",
  "version": "v1.0.0",
  "components": {
    "database": {
      "status": "healthy",
      "latency_ms": 3.1
    },
    "temporal": {
      "status": "healthy",
      "latency_ms": 12.5
    },
    "llm_provider": {
      "status": "healthy",
      "message": "API key configured"
    },
    "langfuse": {
      "status": "healthy",
      "message": "Langfuse configured"
    },
    "sentry": {
      "status": "healthy",
      "message": "Sentry configured"
    }
  },
  "dependencies": {
    "temporalio": "1.5.0",
    "sqlalchemy": "2.0.0"
  }
}
```

### Readiness/Liveness Probes

**Liveness:** `GET /health/live`
```json
{"status": "alive"}
```

**Readiness:** `GET /health/ready`
```json
{"status": "ready"}
```

---

## Metrics Collection

### Application Metrics

**HTTP Metrics:**
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `http_requests_in_flight` - Concurrent requests

**Database Metrics:**
- `database_queries_total` - Total database queries
- `database_query_duration_seconds` - Query duration histogram
- `database_connections_active` - Active database connections

**Business Metrics:**
- `appeals_submitted_total` - Total appeals submitted
- `appeals_won_total` - Total appeals won
- `submission_success_total` - Successful submissions
- `submission_failure_total` - Failed submissions
- `recovered_amount_dollars_total` - Total recovered amount

**LLM Metrics:**
- `llm_requests_total` - Total LLM requests
- `llm_tokens_total` - Total tokens used
- `llm_cost_dollars_total` - Total LLM costs
- `llm_parse_errors_total` - LLM parse errors

### Infrastructure Metrics

**ECS Metrics:**
- `aws_ecs_task_cpu_utilization` - Task CPU usage
- `aws_ecs_task_memory_utilization` - Task memory usage

**RDS Metrics:**
- `pg_stat_database_numbackends` - Database connections
- `pg_stat_activity_count` - Active queries
- `rds_disk_io_usage` - Disk I/O

---

## Alerting Configuration

### Alert Severity Levels

**Critical (Page Immediately):**
- Error rate >5%
- Service down
- Database connection pool >90%
- Workflow queue depth >100
- Audit log failures
- PHI encryption failures

**Warning (Page within 15 minutes):**
- Error rate >1%
- P95 response time >5s
- Database connection pool >70%
- Submission failure rate >10%
- Browser automation failures >15%

**Info (Daily Digest):**
- New deployments
- Database migrations completed
- Unusual traffic patterns

### Alert Routing

**PagerDuty (Critical Alerts):**
```yaml
- HighErrorRate
- ServiceDown
- DatabaseConnectionsExhausted
- WorkflowQueueBackedUp
- AuditLogWriteFailures
- PHIEncryptionFailure
```

**Slack (Warning Alerts):**
```yaml
- ElevatedErrorRate
- SlowResponseTime
- DatabaseConnectionPoolUsage
- TemporalWorkerNotProcessing
- SubmissionFailureRateHigh
```

---

## Dashboard Setup

### Main Dashboard

**Panels:**
1. Request Rate (graph)
2. Error Rate (graph + alert)
3. Response Time p95 (graph)
4. Database Connections (gauge)
5. Workflow Queue Depth (gauge)
6. Appeals Submitted/Hour (graph)
7. Submission Success Rate (gauge)
8. LLM Token Usage (graph)
9. LLM Costs/Hour (graph)
10. ECS CPU Utilization (graph)
11. ECS Memory Utilization (graph)

### Business Metrics Dashboard

**Panels:**
1. Appeals Won Today (stat)
2. Appeals Won This Week (stat)
3. Appeals Won This Month (stat)
4. Win Rate (gauge)
5. Time to Submission p50 (graph)
6. Recovered Revenue 7-day (stat)
7. Active Practices (stat)
8. Submission Failures by Payer (piechart)

### Security Dashboard

**Panels:**
1. Failed Auth Attempts (graph + alert)
2. PHI Access Events (graph)
3. Rate Limit Violations (graph)
4. Audit Log Write Failures (graph + alert)

---

## Log Aggregation

### CloudWatch Logs

**Log Groups:**
- `/ecs/overturn-web`
- `/ecs/overturn-worker`
- `/aws/rds/overturn/postgresql`

**Log Queries:**

**Find errors:**
```
fields @timestamp, message, level
| filter level = "ERROR"
| sort @timestamp desc
```

**Search for specific requests:**
```
fields @timestamp, message, requestId
| filter message like /denial_id/
| stats count(*) by requestId
```

### Log Retention

**Production:**
- Application logs: 30 days
- Audit logs: 7 years (HIPAA requirement)
- Security logs: 2 years

**Staging:**
- All logs: 7 days

---

## Testing

### Health Check Tests

```bash
# Test web health
curl http://localhost:3000/api/health

# Test worker health
curl http://localhost:8001/health

# Test readiness
curl http://localhost:8001/health/ready

# Test liveness
curl http://localhost:8001/health/live
```

### Metrics Tests

```bash
# Test metrics endpoint
curl http://localhost:3000/metrics
curl http://localhost:8001/metrics

# Verify metrics format
curl http://localhost:3000/metrics | grep "^http_requests_total"
```

### Alert Tests

```bash
# Trigger test alert
# (Simulate high error rate)
for i in {1..100}; do
  curl -f http://localhost:3000/api/nonexistent || true
done

# Check Alertmanager
curl http://localhost:9093/api/v1/alerts
```

### Integration Tests

```bash
# Test full observability stack
pnpm test:observability
```

---

## Troubleshooting

### Common Issues

#### 1. Health Check Fails

**Symptoms:** Health endpoint returns 503

**Diagnosis:**
```bash
curl -v http://localhost:3000/api/health
```

**Resolution:**
- Check database connectivity
- Verify environment variables
- Check component dependencies
- Review application logs

#### 2. Metrics Not Appearing

**Symptoms:** No metrics in Prometheus

**Diagnosis:**
```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

**Resolution:**
- Verify metrics endpoint is accessible
- Check Prometheus configuration
- Verify scrape interval
- Check network connectivity

#### 3. Alerts Not Firing

**Symptoms:** Expected alerts not appearing

**Diagnosis:**
```bash
# Check Alertmanager rules
curl http://localhost:9093/api/v1/rules
```

**Resolution:**
- Verify rule syntax
- Check evaluation interval
- Verify alert conditions
- Check notification configuration

---

## Related Documentation

- [Operations Runbooks](ops/runbooks.md)
- [Deployment Guide](deployment-guide.md)
- [Production Wiring](../production-wiring.md)
