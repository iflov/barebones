# ────────────────────────────────────────────────────────────────────────────
# foundation 계약
#
# 이 값들은 이 root가 foundation과 service로 갈릴 때 **service root가 읽어야 하는
# 것들**이다. 지금은 한 root라 아무도 안 쓰지만, 계약을 지금 고정해두면 분리할 때
# "무엇이 공개 인터페이스였나"를 다시 발굴하지 않아도 된다.
#
# 분리 후 전달은 SSM Parameter Store를 쓴다. `terraform_remote_state`는 output만
# 읽는 것처럼 보여도 state 스냅샷 전체에 대한 읽기 권한을 요구하고, 그 안에는
# RDS master secret ARN과 IAM 정책이 함께 들어 있다. `sensitive = true`는 출력
# 표시를 가릴 뿐 권한 경계가 아니다.
# ────────────────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "Foundation VPC"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Foundation public subnets (ALB, and currently ECS tasks)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Foundation private subnets. No route table or NAT is attached yet."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Foundation ALB security group. Service task SGs allow ingress from this."
  value       = aws_security_group.alb.id
}

output "alb_listener_arn" {
  description = "Foundation HTTP listener. Services attach their own aws_lb_listener_rule here."
  value       = aws_lb_listener.http.arn
}

output "alb_dns_name" {
  description = "Foundation ALB DNS name, for the DNS records services point at"
  value       = aws_lb.this.dns_name
}

output "ecs_cluster_arn" {
  description = "Foundation ECS cluster that service tasks run in"
  value       = aws_ecs_cluster.this.arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "db_subnet_group_name" {
  description = "Foundation DB subnet group. Per-service RDS instances place themselves here."
  value       = aws_db_subnet_group.this.name
}

# ────────────────────────────────────────────────────────────────────────────
# service 출력
# ────────────────────────────────────────────────────────────────────────────

output "application_url" {
  value = "http://${aws_lb.this.dns_name}"
}

output "rds_endpoint" {
  value = aws_db_instance.this.endpoint
}

# ⚠ 이것은 **master** credential이다. 지금은 task가 직접 쓴다(compute.tf).
# 데이터 플레인을 서비스끼리 공유하게 되면 이 값을 앱에 주는 것은 성립하지 않는다 —
# 서비스별 database/user/grant가 먼저 필요하고, 그건 hashicorp/aws만으로는 안 된다.
output "rds_master_secret_arn" {
  value     = aws_db_instance.this.master_user_secret[0].secret_arn
  sensitive = true
}

output "message_queue_url" {
  value = var.enable_sqs ? aws_sqs_queue.messages[0].url : null
}

output "redis_endpoint" {
  value = var.enable_redis ? aws_elasticache_replication_group.this[0].primary_endpoint_address : null
}
