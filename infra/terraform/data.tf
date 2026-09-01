resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "this" {
  allocated_storage           = 20
  backup_retention_period     = var.environment == "prod" ? 7 : 1
  db_name                     = var.db_name
  db_subnet_group_name        = aws_db_subnet_group.this.name
  deletion_protection         = var.environment == "prod"
  engine                      = var.db_engine
  identifier                  = local.name
  instance_class              = var.db_instance_class
  manage_master_user_password = true
  multi_az                    = var.environment == "prod"
  port                        = local.db_port
  publicly_accessible         = false
  skip_final_snapshot         = var.environment != "prod"
  storage_encrypted           = true
  username                    = var.db_username
  vpc_security_group_ids      = [aws_security_group.data.id]
}

resource "aws_elasticache_subnet_group" "this" {
  count = var.enable_redis ? 1 : 0

  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "this" {
  count = var.enable_redis ? 1 : 0

  at_rest_encryption_enabled = true
  description                = "${local.name} cache and BullMQ backend"
  engine                     = "valkey"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "prod" ? 2 : 1
  port                       = 6379
  replication_group_id       = local.name
  security_group_ids         = [aws_security_group.data.id]
  subnet_group_name          = aws_elasticache_subnet_group.this[0].name
}

resource "aws_sqs_queue" "dead_letter" {
  count = var.enable_sqs ? 1 : 0

  name                      = "${local.name}-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "messages" {
  count = var.enable_sqs ? 1 : 0

  name                       = "${local.name}-messages"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[0].arn
    maxReceiveCount     = 5
  })
}
