# Operations Runbooks

Procedures for common operational tasks, incidents, and troubleshooting. These runbooks are for the on-call engineer handling production issues.

## Table of Contents

1. [Stuck Workflows](#stuck-workflows)
2. [Failed Submissions](#failed-submissions)
3. [Browser Automation Issues](#browser-automation-issues)
4. [Credential Management](#credential-management)
5. [Incident Response](#incident-response)
6. [Database Maintenance](#database-maintenance)
7. [Monitoring & Alerts](#monitoring--alerts)

---

## Stuck Workflows

### Symptoms
- Appeal remains in `DRAFTING` status for >30 minutes
- Temporal workflow shows `RUNNING` but no activity progress
- Customer reports no progress on their appeal

### Diagnosis

```sql
-- Find stuck appeals
SELECT
    a.id,
    a.createdAt,
    a.status,
    ar.status AS agent_run_status,
    ar.startedAt,
    ar.completedAt,
    ar.errorMessage
FROM Appeal a
LEFT JOIN AgentRun ar ON a.agentRunId = ar.id
WHERE a.status = 'DRAFTING'
  AND a.createdAt < NOW() - INTERVAL '30 minutes'
ORDER BY a.createdAt;
```

### Resolution

1. **Check Temporal UI**
   - Go to Temporal Web UI (`https://temporal.<domain>`)
   - Search by workflow ID or appeal ID
   - Check if workflow is stuck on a specific activity

2. **Retry failed activity**
   - In Temporal UI, find the failed activity
   - Click "Retry" with same input
   - Monitor for successful completion

3. **Force reset (if retry fails)**
   ```sql
   -- Reset appeal to READY for manual retry
   UPDATE Appeal
   SET status = 'READY',
       agentRunId = NULL
   WHERE id = '<appeal_id>';

   -- Mark agent run as failed for audit
   UPDATE AgentRun
   SET status = 'FAILED',
       errorMessage = 'Manual reset after stuck workflow',
       completedAt = NOW()
   WHERE id = '<agent_run_id>';
   ```

4. **Trigger manual retry**
   - Use ops console to trigger appeal workflow
   - Or notify customer to re-submit from dashboard

### Prevention
- Set Temporal activity timeouts appropriately
- Monitor Temporal workflow queue depth
- Alert on workflows >15 minutes in DRAFTING

---

## Failed Submissions

### Symptoms
- Appeal shows `READY` but no submission row exists
- Submission row shows `FAILED` status
- Customer reports appeal not submitted

### Diagnosis

```sql
-- Find failed submissions in last 24 hours
SELECT
    s.id,
    s.appealId,
    s.channel,
    s.status,
    s.attemptNumber,
    s.errorMessage,
    s.createdAt
FROM Submission s
WHERE s.status = 'FAILED'
  AND s.createdAt > NOW() - INTERVAL '24 hours'
ORDER BY s.createdAt DESC;

-- Find ready appeals with no submission
SELECT
    a.id,
    a.draftLetter,
    p.name AS payer_name,
    p.portalUrl,
    p.faxNumber
FROM Appeal a
JOIN Denial d ON a.denialId = d.id
JOIN Claim c ON d.claimId = c.id
JOIN Payer p ON c.payerId = p.id
WHERE a.status = 'READY'
  AND a.submittedVia IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM Submission s WHERE s.appealId = a.id
  );
```

### Resolution

1. **Review error message**
   - Check `errorMessage` in Submission row
   - Common errors:
     - Portal login failure
     - Portal UI changed (broken selectors)
     - Fax service timeout
     - Invalid credentials

2. **Portal submission failures**
   ```bash
   # Check recent portal changes
   # Review screenshot artifacts in S3: audit-screenshots/<appeal_id>/
   ```

   - If credentials expired: Update PayerCredential row
   - If UI changed: Update payer-specific submitter in `apps/worker/browser/payers/`
   - If temporary outage: Retry after resolution

3. **Retry submission**
   - Create new Submission row with incremented `attemptNumber`
   - Trigger `AppealSubmitWorkflow` from ops console
   - Monitor for success

4. **Manual fallback**
   - If all automated channels failed, notify customer
   - Provide appeal letter for manual submission
   - Document in Submission row with `MANUAL` channel

### Prevention
- Monitor submission failure rate by payer
- Alert on >5% failure rate for any payer
- Test payer portal submitters weekly in staging
- Rotate payer credentials quarterly

---

## Browser Automation Issues

### Symptoms
- Stagehand timeouts or errors
- Screenshots show unexpected UI state
- High failure rate for specific payer

### Diagnosis

1. **Check Stagehand logs**
   ```bash
   # In ECS / CloudWatch Logs
   # Filter by: "stagehand" OR "playwright" OR "portal"
   ```

2. **Review audit screenshots**
   ```bash
   # S3 bucket: <env>-audit-screenshots/
   # Path: <appeal_id>/step-*.png
   ```

3. **Test in dev environment**
   ```bash
   # Set STAGEHAND_ENV=LOCAL
   cd apps/worker/browser
   pnpm exec stagehand-submit <appeal_id>
   ```

### Resolution

1. **Portal UI changed**
   - Update selectors in `apps/worker/browser/payers/<payer>.ts`
   - Test in dev, then deploy to staging
   - Deploy to production after validation

2. **Credential issues**
   - Verify credentials work via manual login
   - Update encrypted credentials in PayerCredential table
   - Consider MFA expiry

3. **Performance issues**
   - Increase activity timeout in workflow
   - Add explicit waits for slow-loading elements
   - Consider using more specific selectors

### Prevention
- Monitor Stagehand success rates per payer
- Alert on >10% failure rate
- Weekly smoke tests for each payer portal
- Version control payer-specific submitters

---

## Credential Management

### Adding New Payer Credentials

1. **Encrypt credentials**
   ```python
   from overturn_worker.crypto import encrypt

   username_encrypted = encrypt("practice_user")
   password_encrypted = encrypt("secure_password")
   mfa_secret_encrypted = encrypt("mfa_secret")  # If applicable
   config_encrypted = encrypt('{"security_question": "mothers_maiden_name"}')
   ```

2. **Insert into database**
   ```sql
   INSERT INTO PayerCredential (
       id,
       practiceId,
       payerId,
       usernameEnc,
       passwordEnc,
       mfaSecretEnc,  -- Nullable
       configEnc,     -- Nullable for payer-specific config
       createdAt
   ) VALUES (
       '<new_id>',
       '<practice_id>',
       '<payer_id>',
       '<username_encrypted>',
       '<password_encrypted>',
       '<mfa_encrypted>',
       '<config_encrypted>',
       NOW()
   );
   ```

3. **Verify**
   - Test decryption works
   - Test portal login in dev environment
   - Deploy to production

### Rotating Existing Credentials

1. **Generate new encrypted values**
   ```python
   # Same as above, with new credentials
   ```

2. **Update in place**
   ```sql
   UPDATE PayerCredential
   SET usernameEnc = '<new_username_enc>',
       passwordEnc = '<new_password_enc>',
       -- Leave mfaSecretEnc and configEnc unless changed
       updatedAt = NOW()
   WHERE practiceId = '<practice_id>' AND payerId = '<payer_id>';
   ```

3. **Test and verify**
   - Ensure no active workflows using old credentials
   - Test new credentials work
   - Document rotation in audit trail

### Security Notes
- Never log plaintext credentials
- Never store credentials in code
- Use AWS Secrets Manager for production PHI_ENC_KEY
- Audit credential access quarterly

---

## Incident Response

### Severity Levels

**P0 - Critical**
- Complete service outage
- PHI exposure confirmed
- >50% of submissions failing
- Production database unavailable

**P1 - High**
- Single payer portal down for >1 hour
- >25% of submissions failing
- Performance degradation affecting all users
- Potential PHI exposure (unconfirmed)

**P2 - Medium**
- Single payer portal issues
- 5-25% submission failures
- Feature broken (non-critical)
- Performance degradation for subset of users

**P3 - Low**
- Documentation issues
- Minor UI bugs
- Performance not meeting SLA but functional

### P0 Response Procedure

1. **Immediate (0-15 minutes)**
   - Page on-call engineer
   - Assess scope and impact
   - Create incident Slack channel (`#incident-<title>`)
   - Post status page update

2. **Mitigation (15-60 minutes)**
   - Implement temporary fix if possible
   - Disable affected features if necessary
   - Preserve logs and evidence for postmortem
   - Update status page every 30 minutes

3. **Resolution (1-4 hours)**
   - Implement permanent fix
   - Verify resolution with smoke tests
   - Close incident channel
   - Mark incident as resolved on status page

4. **Postmortem (within 1 week)**
   - Document root cause
   - Identify prevention measures
   - Create action items
   - Share with team

### PHI Exposure Procedure

1. **Immediate containment**
   - Disable affected systems
   - Preserve all logs
   - Do not delete any data

2. **Assessment**
   - Determine scope of exposure
   - Identify affected individuals
   - Classify data types exposed

3. **Notification**
   - Legal counsel notification (within 1 hour)
   - Internal incident response team
   - Affected customers (per contract/HIPAA timeline)
   - Regulatory bodies if required

4. **Post-incident**
   - Complete breach documentation
   - Implement security improvements
   - Review BAAs with affected vendors

---

## Database Maintenance

### Routine Checks

**Daily (automated)**
- Connection pool usage
- Query performance (slow query log)
- Replication lag (if applicable)
- Disk space

**Weekly**
- Table bloat analysis
- Index usage statistics
- Failed job queues

**Monthly**
- Vacuum analyze on large tables
- Index fragmentation check
- Backup verification

### Common Queries

**Check table sizes**
```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Find long-running queries**
```sql
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
  AND state != 'idle'
ORDER BY duration DESC;
```

**Check index usage**
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;
```

### Maintenance Operations

**Vacuum analyze**
```sql
VACUUM ANALYZE Appeal;
VACUUM ANALYZE Submission;
VACUUM ANALYZE AuditEvent;
```

**Reindex (if fragmentation >30%)**
```sql
REINDEX TABLE CONCURRENTLY Appeal;
REINDEX TABLE CONCURRENTLY Submission;
```

**Archive old audit logs** (>7 years per HIPAA)
```sql
-- Move to cold storage or delete per retention policy
DELETE FROM AuditEvent
WHERE createdAt < NOW() - INTERVAL '7 years';
```

---

## Monitoring & Alerts

### Key Metrics

**Business metrics**
- Appeals submitted per hour
- Submission success rate
- Appeal win rate
- Time to submission

**Technical metrics**
- Temporal workflow success rate
- LLM latency and error rate
- Browser automation success rate
- Database query performance

**Security metrics**
- Failed auth attempts
- Unusual PHI access patterns
- Rate limit violations
- Audit log failures

### Alert Thresholds

**Critical (page immediately)**
- Submission success rate <90% for any payer
- Temporal workflow queue depth >100
- Database connections >80% pool
- Any PHI encryption/decryption failure
- Confirmed security incident

**Warning (page within 15 minutes)**
- Submission success rate <95% for any payer
- Average appeal drafting time >10 minutes
- Browser automation failure rate >10%
- Database latency p95 >500ms

**Info (daily digest)**
- New payer onboardings
- Credential rotations
- Database maintenance completed
- Feature deployments

### Dashboards

**Main dashboard (Grafana)**
- Real-time submission volume
- Success rates by channel and payer
- Workflow queue depths
- Error rates by component

**Ops console**
- Failed submissions queue
- Stuck workflows
- Overdue follow-ups
- Credential expiry warnings

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-call Engineer | `<phone>` | PagerDuty |
| CTO | `<phone>` | 30 minutes |
| Legal Counsel | `<phone>` | 1 hour (PHI incidents) |
| Security | `<email>` | 15 minutes (security incidents) |

## Related Documentation

- [Production Deployment Guide](../production-wiring.md)
- [Architecture Overview](../planning/DEV%20SPEC.md)
- [Security Policies](../production-wiring.md)
