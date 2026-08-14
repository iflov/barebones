output "application_url" {
  value = "http://${aws_lb.this.dns_name}"
}

output "rds_endpoint" {
  value = aws_db_instance.this.endpoint
}

output "rds_master_secret_arn" {
  value     = aws_db_instance.this.master_user_secret[0].secret_arn
  sensitive = true
}

output "message_queue_url" {
  value = aws_sqs_queue.messages.url
}

output "redis_endpoint" {
  value = var.enable_redis ? aws_elasticache_replication_group.this[0].primary_endpoint_address : null
}
