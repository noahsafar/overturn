# Overturn AWS infrastructure.
#
# Before applying for real:
#   1. Sign the AWS BAA (https://aws.amazon.com/compliance/hipaa-compliance/)
#   2. Configure a remote backend (S3 + DynamoDB lock) — uncomment below
#   3. Set var.allowed_db_cidrs to the VPC private CIDRs of any external
#      services you need to grant DB access (e.g. Vercel runtime)
#   4. Push container images to the ECR repos defined here
#   5. Populate the four placeholder secrets with real values
#      (terraform apply emits the ARNs you'll need)
#   6. Run `terraform plan` against a non-prod account before prod apply

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
  # backend "s3" {
  #   bucket = "overturn-tfstate"
  #   key    = "main.tfstate"
  #   region = "us-east-1"
  #   dynamodb_table = "overturn-tfstate-lock"
  #   encrypt = true
  # }
}

provider "aws" {
  region = var.region
}

# ────────────────────────────────────────────────────────────────────────────
# Variables
# ────────────────────────────────────────────────────────────────────────────
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "env" {
  type        = string
  default     = "prod"
  description = "Environment name (prod / staging / dev)"
}

variable "db_password" {
  type        = string
  description = "Initial RDS master password — overridden by Secrets Manager rotation after first apply"
  sensitive   = true
  default     = ""
}

variable "worker_image" {
  type        = string
  description = "ECR image URI for the worker container"
  default     = ""
}

variable "web_image" {
  type        = string
  description = "ECR image URI for the web container (if not deploying via Vercel)"
  default     = ""
}

locals {
  name = "overturn-${var.env}"
}

# ────────────────────────────────────────────────────────────────────────────
# VPC
# ────────────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = local.name
  cidr    = "10.0.0.0/16"

  azs             = ["${var.region}a", "${var.region}b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway      = true
  enable_dns_hostnames    = true
  enable_flow_log         = true
  flow_log_destination_type = "s3"
  flow_log_destination_arn  = aws_s3_bucket.audit.arn
}

# ────────────────────────────────────────────────────────────────────────────
# S3 — audit (object-locked) + artifacts (encrypted, versioned)
# ────────────────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "audit" {
  bucket_prefix       = "${local.name}-audit-"
  object_lock_enabled = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}
resource "aws_s3_bucket_public_access_block" "audit" {
  bucket                  = aws_s3_bucket.audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_lifecycle_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    id     = "retain-7-years"
    status = "Enabled"
    filter {}
    expiration { days = 2555 } # 7 years
    noncurrent_version_expiration { noncurrent_days = 2555 }
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "${local.name}-artifacts-"
}
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ────────────────────────────────────────────────────────────────────────────
# RDS Postgres (HIPAA-eligible)
# ────────────────────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "Postgres access from ECS tasks"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "main" {
  identifier                  = local.name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = "db.t4g.medium"
  allocated_storage           = 50
  max_allocated_storage       = 500
  storage_type                = "gp3"
  storage_encrypted           = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.rds.id]
  username                    = "overturn"
  manage_master_user_password = true
  skip_final_snapshot         = false
  deletion_protection         = true
  backup_retention_period     = 35
  performance_insights_enabled = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  apply_immediately           = false
  publicly_accessible         = false
}

# ────────────────────────────────────────────────────────────────────────────
# Secrets Manager
# ────────────────────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "phi_enc_key" {
  name_prefix = "${local.name}-phi-enc-key-"
  description = "AES-256 key for app-layer PHI envelope encryption (32 bytes base64)"
}

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name_prefix = "${local.name}-anthropic-"
  description = "Anthropic API key (ZDR-enabled, BAA-covered)"
}

resource "aws_secretsmanager_secret" "stripe_secret_key" {
  name_prefix = "${local.name}-stripe-"
  description = "Stripe API secret key"
}

resource "aws_secretsmanager_secret" "internal_shared_secret" {
  name_prefix = "${local.name}-internal-"
  description = "Shared secret for worker ↔ web internal HTTP calls"
}

# Documo / Lob / Resend are added the same way as needed.

# ────────────────────────────────────────────────────────────────────────────
# ECR — container registries for web + worker
# ────────────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "worker" {
  name                 = "${local.name}/worker"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.name}/web"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

# ────────────────────────────────────────────────────────────────────────────
# ECS — Fargate cluster + worker service
# ────────────────────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = 90
}

# IAM — execution role (pulls images + writes logs)
resource "aws_iam_role" "task_execution" {
  name = "${local.name}-task-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "${local.name}-secrets-read"
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = [
        aws_secretsmanager_secret.phi_enc_key.arn,
        aws_secretsmanager_secret.anthropic_api_key.arn,
        aws_secretsmanager_secret.stripe_secret_key.arn,
        aws_secretsmanager_secret.internal_shared_secret.arn,
      ]
    }]
  })
}

# IAM — task role (least privilege for the running container)
resource "aws_iam_role" "task" {
  name = "${local.name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy" "task_s3" {
  name = "${local.name}-task-s3"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.artifacts.arn,
        "${aws_s3_bucket.artifacts.arn}/*",
        aws_s3_bucket.audit.arn,
        "${aws_s3_bucket.audit.arn}/*",
      ]
    }]
  })
}

# Security group for ECS tasks (egress only — no public ingress)
resource "aws_security_group" "tasks" {
  name        = "${local.name}-tasks"
  description = "ECS Fargate task SG"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Worker task definition
resource "aws_ecs_task_definition" "worker" {
  count                    = var.worker_image == "" ? 0 : 1
  family                   = "${local.name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.worker_image
    essential = true
    portMappings = [{ containerPort = 8001, protocol = "tcp" }]
    secrets = [
      { name = "PHI_ENC_KEY",          valueFrom = aws_secretsmanager_secret.phi_enc_key.arn },
      { name = "ANTHROPIC_API_KEY",    valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn },
      { name = "INTERNAL_SHARED_SECRET", valueFrom = aws_secretsmanager_secret.internal_shared_secret.arn },
    ]
    environment = [
      { name = "S3_BUCKET",   value = aws_s3_bucket.artifacts.bucket },
      { name = "AWS_REGION",  value = var.region },
      { name = "ANTHROPIC_ZDR", value = "true" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.worker.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  count           = var.worker_image == "" ? 0 : 1
  name            = "${local.name}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  enable_execute_command = true

  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.tasks.id]
    assign_public_ip = false
  }

  # No load balancer attached — web reaches the worker via VPC PrivateLink
  # or an internal ALB defined out-of-band. Add `load_balancer` block if
  # exposing the worker API beyond ECS-side service discovery.
}

# ────────────────────────────────────────────────────────────────────────────
# CloudTrail — every AWS API call delivered to the object-locked audit S3
# ────────────────────────────────────────────────────────────────────────────
data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_policy" "audit_cloudtrail" {
  bucket = aws_s3_bucket.audit.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.audit.arn
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.audit.arn}/cloudtrail/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
    ]
  })
}

resource "aws_cloudtrail" "main" {
  name                          = "${local.name}-trail"
  s3_bucket_name                = aws_s3_bucket.audit.id
  s3_key_prefix                 = "cloudtrail"
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  depends_on                    = [aws_s3_bucket_policy.audit_cloudtrail]

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.audit.arn}/", "${aws_s3_bucket.artifacts.arn}/"]
    }
  }
}

# ────────────────────────────────────────────────────────────────────────────
# WAF — Web ACL for the web app's public surface
# ────────────────────────────────────────────────────────────────────────────
# If you host the web app on Vercel, you can either skip WAF or front Vercel
# with CloudFront and apply this Web ACL. If you host on AWS (ALB/ECS), set
# scope = "REGIONAL" and associate it with your ALB ARN.
resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name}-waf"
  scope       = "CLOUDFRONT"
  description = "Overturn web app — rate limit + AWS managed rules"

  default_action { allow {} }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  rule {
    name     = "rate-limit-2000-per-5min"
    priority = 1
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "common-rules"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common-rules"
      sampled_requests_enabled   = true
    }
  }
}

# ────────────────────────────────────────────────────────────────────────────
# Outputs
# ────────────────────────────────────────────────────────────────────────────
output "vpc_id"              { value = module.vpc.vpc_id }
output "private_subnets"     { value = module.vpc.private_subnets }
output "audit_bucket"        { value = aws_s3_bucket.audit.bucket }
output "artifacts_bucket"    { value = aws_s3_bucket.artifacts.bucket }
output "ecs_cluster"         { value = aws_ecs_cluster.main.name }
output "rds_endpoint"        { value = aws_db_instance.main.endpoint }
output "ecr_worker_repo"     { value = aws_ecr_repository.worker.repository_url }
output "ecr_web_repo"        { value = aws_ecr_repository.web.repository_url }
output "phi_enc_key_arn"     { value = aws_secretsmanager_secret.phi_enc_key.arn }
output "anthropic_secret_arn" { value = aws_secretsmanager_secret.anthropic_api_key.arn }
output "stripe_secret_arn"   { value = aws_secretsmanager_secret.stripe_secret_key.arn }
output "cloudtrail_arn"      { value = aws_cloudtrail.main.arn }
output "waf_acl_arn"         { value = aws_wafv2_web_acl.main.arn }
