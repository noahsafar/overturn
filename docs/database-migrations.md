# Database Migration Guide

This guide covers safe database migrations for Overturn production deployments.

## Overview

Overturn uses Prisma as its ORM. Migrations are generated from schema changes and applied using the migration scripts.

## Prerequisites

- Access to production database
- Prisma CLI installed (`pnpm install -g prisma`)
- Database backup permissions
- SSL enabled for production connections

## Migration Workflow

### 1. Development

Create a migration during development:

```bash
cd packages/db
pnpm run migrate:dev --name describe_your_change
```

This creates:
- A new migration file in `prisma/migrations/`
- Updates the local development database

### 2. Testing

Test the migration locally:

```bash
# Reset local database
pnpm exec prisma migrate reset

# Re-apply migrations
pnpm run migrate:dev
```

Run tests to ensure nothing breaks:

```bash
cd apps/web
pnpm test

cd apps/worker
pnpm test
```

### 3. Staging

Deploy to staging first:

```bash
# From project root
./packages/db/scripts/migrate.sh staging migrate
```

Verify:
- Application starts correctly
- All health checks pass
- Core functionality works

### 4. Production

**ALWAYS** backup before production migrations:

```bash
# The migration script creates automatic backups
./packages/db/scripts/migrate.sh production migrate
```

The migration script will:
1. Create a timestamped database backup
2. Generate Prisma client
3. Apply pending migrations
4. Verify database connectivity

## Migration Types

### Safe Migrations

These can be applied without downtime:

- **Adding columns** (with default values or nullable)
- **Adding tables**
- **Adding indexes**
- **Renaming tables/columns** (requires Prisma `@map` attribute)

### Risky Migrations

These require careful planning:

- **Removing columns** - ensure no code references them
- **Changing column types** - may require data migration
- **Adding NOT NULL constraints** - requires data validation first
- **Removing tables** - ensure no foreign key dependencies

## Rollback Procedure

If a migration causes issues:

### 1. Immediate Rollback

```bash
# Rollback to previous migration
./packages/db/scripts/migrate.sh production rollback <migration_name>
```

### 2. Restore from Backup

If rollback fails, restore from backup:

```bash
# Find the latest backup
ls -lt packages/db/backups/

# Restore using psql
pg_restore -d $DATABASE_URL packages/db/backups/overturn_production_YYYYMMDD_HHMMSS.sql
```

### 3. Code Rollback

If the migration was successful but the code has issues:

```bash
# Revert code to previous commit
git revert <commit-hash>

# Redeploy previous version
./scripts/deploy-production.sh rollback
```

## Best Practices

### 1. Make Migrations Reversible

Always design migrations to be reversible:

```prisma
// Good: Add nullable column first, then populate, then make NOT NULL
model Denial {
  id String @id
  newField String? // Step 1: Add as nullable
}

// Later migration:
model Denial {
  id String @id
  newField String @default("") // Step 2: Add default
}

// Later migration:
model Denial {
  id String @id
  newField String // Step 3: Make NOT NULL
}
```

### 2. Avoid Data Loss

Never drop columns without careful consideration:

```bash
# Instead of:
ALTER TABLE denials DROP COLUMN old_field;

# Use:
ALTER TABLE denials RENAME COLUMN old_field TO old_field_deprecated;
# Then remove in a later migration after verifying no usage
```

### 3. Test with Real Data

Before production migrations:

1. Clone production database to staging
2. Test migration on staging data
3. Run performance tests
4. Verify data integrity

### 4. Monitor During Migration

- Check application logs for errors
- Monitor database performance
- Have rollback plan ready
- Keep stakeholders informed

## Troubleshooting

### Migration Fails

**Symptom**: Migration script exits with error

**Solutions**:
1. Check database connectivity
2. Verify sufficient disk space
3. Check for table locks
4. Review migration SQL for syntax errors

```bash
# View migration SQL
cat prisma/migrations/<migration_timestamp>/migration.sql
```

### Application Fails After Migration

**Symptom**: Application errors after successful migration

**Solutions**:
1. Check if Prisma client needs regeneration
2. Verify environment variables
3. Review application logs
4. Check for missing required fields

```bash
# Regenerate Prisma client
cd packages/db
pnpm run generate
```

### Performance Degradation

**Symptom**: Slow queries after migration

**Solutions**:
1. Check if indexes are missing
2. Analyze query plans
3. Consider deferring heavy operations

```bash
# Add index to improve performance
// In schema.prisma
@@index([field1, field2])
```

## Migration Examples

### Example 1: Add New Column

```prisma
model Appeal {
  id        String   @id
  // Add new field
  submittedAt DateTime?
}
```

```bash
pnpm run migrate:dev --name add_submitted_at_to_appeal
```

### Example 2: Add Relationship

```prisma
model Appeal {
  id        String   @id
  denialId  String
  denial    Denial   @relation(fields: [denialId], references: [id])
}

model Denial {
  id      String    @id
  appeals Appeal[]
}
```

```bash
pnpm run migrate:dev --name add_appeal_denial_relation
```

### Example 3: Add Index

```prisma
model Denial {
  id           String @id
  denialCode   String
  receivedAt   DateTime @default(now())

  @@index([denialCode, receivedAt])
}
```

```bash
pnpm run migrate:dev --name add_denial_code_index
```

## Emergency Contacts

If you encounter issues during production migration:

1. **Database Admin**: [Contact info]
2. **Engineering Lead**: [Contact info]
3. **On-Call Engineer**: [Contact info]

## Additional Resources

- [Prisma Migrations Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [PostgreSQL Backup Docs](https://www.postgresql.org/docs/current/backup.html)
- [Deployment Runbooks](../ops/runbooks.md)
