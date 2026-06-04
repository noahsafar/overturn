#!/usr/bin/env bash
#
# Database migration script for production deployments.
#
# This script applies pending Prisma migrations safely in production.
# Usage:
#   ./migrate.sh [staging|production]
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required tools
check_requirements() {
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is required but not installed"
        exit 1
    fi

    if ! command -v docker &> /dev/null && ! docker ps &> /dev/null; then
        log_error "Docker is required but not running"
        exit 1
    fi
}

# Validate environment variables
check_env_vars() {
    local env="${1:-production}"

    if [[ "$env" == "production" ]]; then
        if [[ -z "${DATABASE_URL:-}" ]]; then
            log_error "DATABASE_URL must be set for production migrations"
            exit 1
        fi
    fi
}

# Backup database before migration
backup_database() {
    local env="${1:-production}"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backups/overturn_${env}_${timestamp}.sql"

    log_info "Creating database backup..."

    # Create backups directory
    mkdir -p backups

    # Get database connection details from DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    local db_url="${DATABASE_URL}"
    local db_host=$(echo $db_url | sed -n 's/.*@\([^:]*\):.*/\1/p')
    local db_name=$(echo $db_url | sed -n 's/.*\/\([^?]*\).*/\1/p')

    log_info "Backing up database $db_name from $db_host..."

    # Use pg_dump if available, otherwise skip with warning
    if command -v pg_dump &> /dev/null; then
        pg_dump "$db_url" > "$backup_file" 2>/dev/null || {
            log_warn "Backup failed, but continuing with migration..."
        }
        log_info "Backup created: $backup_file"
    else
        log_warn "pg_dump not available, skipping backup..."
    fi
}

# Run Prisma migrations
run_migrations() {
    log_info "Running Prisma migrations..."

    cd packages/db

    # Generate Prisma client first
    log_info "Generating Prisma client..."
    pnpm run generate

    # Apply migrations
    log_info "Applying pending migrations..."
    pnpm run migrate

    log_info "Migrations applied successfully"
}

# Verify migration
verify_migration() {
    log_info "Verifying migration..."

    cd packages/db

    # Run a simple query to verify database connection
    pnpm exec tsx -e "
    import { prisma } from './src/index.js';

    (async () => {
        try {
            await prisma.\$queryRaw\`SELECT 1\`;
            console.log('Database connection verified');
            process.exit(0);
        } catch (error) {
            console.error('Database verification failed:', error);
            process.exit(1);
        }
    })();
    " || {
        log_error "Migration verification failed"
        exit 1
    }
}

# Rollback to previous migration
rollback() {
    local migration_name="${1:-}"

    if [[ -z "$migration_name" ]]; then
        log_error "Migration name required for rollback"
        log_info "Usage: $0 rollback <migration_name>"
        exit 1
    fi

    log_warn "Rolling back migration: $migration_name"
    log_warn "This will revert the migration and may result in data loss!"
    read -p "Are you sure? (yes/no): " confirm

    if [[ "$confirm" != "yes" ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi

    cd packages/db

    # Resolve migration to rollback
    log_info "Resolving migration: $migration_name..."
    pnpm exec prisma migrate resolve --rolled-back "$migration_name"

    log_info "Rollback complete"
}

# Main migration flow
main() {
    local env="${1:-production}"
    local command="${2:-migrate}"

    log_info "Starting database migration for $env environment..."

    check_requirements
    check_env_vars "$env"

    case "$command" in
        migrate)
            backup_database "$env"
            run_migrations
            verify_migration
            log_info "Migration completed successfully!"
            ;;
        rollback)
            rollback "${3:-}"
            ;;
        *)
            log_error "Unknown command: $command"
            log_info "Usage: $0 <env> <migrate|rollback> [migration_name]"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
