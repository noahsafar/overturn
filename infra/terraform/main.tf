# Claimwell AWS infra scaffold — HIPAA-eligible services only.
#
# This is a skeleton. Before applying for real:
#   1. Sign the AWS BAA (https://aws.amazon.com/compliance/hipaa-compliance/)
#   2. Restrict the services used to the AWS HIPAA-eligible list
#   3. Replace inline secrets references with Secrets Manager rotations
#   4. Configure VPC flow logs + CloudTrail with object-lock S3 destination
#   5. Run `terraform plan` against a non-prod account before prod apply

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
  # Configure a remote backend (S3 + DynamoDB lock) before any team use.
  # backend "s3" { bucket = "claimwell-tfstate" ... }
}

provider "aws" {
  region = var.region
}

variable "region" { type = string default = "us-east-1" }
variable "env"    { type = string default = "dev" }

# ── VPC ────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "claimwell-${var.env}"
  cidr    = "10.0.0.0/16"
  azs             = ["${var.region}a", "${var.region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  enable_nat_gateway     = true
  enable_dns_hostnames   = true
  enable_flow_log        = true
  flow_log_destination_type = "s3"
  flow_log_destination_arn  = aws_s3_bucket.audit.arn
}

# ── S3: audit + artifacts (object-lock) ────────────────────────────────────
resource "aws_s3_bucket" "audit" {
  bucket_prefix = "claimwell-${var.env}-audit-"
  object_lock_enabled = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}
resource "aws_s3_bucket_public_access_block" "audit" {
  bucket = aws_s3_bucket.audit.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "claimwell-${var.env}-artifacts-"
}
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

# ── RDS Postgres (HIPAA-eligible) ──────────────────────────────────────────
# Tip: prefer Neon in Phase 1 (cheaper + HIPAA tier). Switch to RDS in
# Phase 2 once the data volume justifies the ops overhead.
resource "aws_db_subnet_group" "this" {
  name       = "claimwell-${var.env}"
  subnet_ids = module.vpc.private_subnets
}

# Placeholder — uncomment when ready to apply.
# resource "aws_db_instance" "main" {
#   identifier          = "claimwell-${var.env}"
#   engine              = "postgres"
#   engine_version      = "16"
#   instance_class      = "db.t4g.medium"
#   allocated_storage   = 50
#   storage_encrypted   = true
#   db_subnet_group_name = aws_db_subnet_group.this.name
#   username            = "claimwell"
#   manage_master_user_password = true
#   skip_final_snapshot = false
#   deletion_protection = true
#   backup_retention_period = 35
# }

# ── Secrets Manager ────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "phi_enc_key" {
  name_prefix = "claimwell-${var.env}-phi-enc-key-"
  description = "AES-256 key for app-layer PHI envelope encryption"
}

# ── ECS Fargate cluster + worker service (skeleton) ────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "claimwell-${var.env}"
}

# Task definition + service deliberately left as scaffolding here — finalize
# during the production cutover, with image URIs from ECR and IAM roles
# scoped to least privilege.

output "vpc_id"        { value = module.vpc.vpc_id }
output "audit_bucket"  { value = aws_s3_bucket.audit.bucket }
output "artifacts_bucket" { value = aws_s3_bucket.artifacts.bucket }
output "ecs_cluster"   { value = aws_ecs_cluster.main.name }
