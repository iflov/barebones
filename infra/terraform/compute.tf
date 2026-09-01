resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
}

resource "aws_ecs_cluster" "this" {
  name = local.name
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
  role       = aws_iam_role.ecs_execution.name
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action   = ["secretsmanager:GetSecretValue"]
      Effect   = "Allow"
      Resource = compact([aws_db_instance.this.master_user_secret[0].secret_arn, var.mongodb_secret_arn])
    }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "messages" {
  count = var.enable_sqs ? 1 : 0

  name = "messages"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "sqs:ChangeMessageVisibility",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:ReceiveMessage",
        "sqs:SendMessage"
      ]
      Effect   = "Allow"
      Resource = aws_sqs_queue.messages[0].arn
    }]
  })
}

locals {
  app_environment = concat([
    { name = "NODE_ENV", value = "production" },
    { name = "APP_PORT", value = tostring(var.container_port) },
    { name = "TRUST_PROXY_HOPS", value = tostring(var.trust_proxy_hops) },
    { name = "DB_TYPE", value = local.db_driver },
    { name = "DB_HOST", value = aws_db_instance.this.address },
    { name = "DB_PORT", value = tostring(local.db_port) },
    { name = "DB_DATABASE", value = var.db_name },
    { name = "DB_USERNAME", value = var.db_username },
    { name = "REDIS_ENABLED", value = tostring(var.enable_redis) },
    { name = "REDIS_HOST", value = var.enable_redis ? aws_elasticache_replication_group.this[0].primary_endpoint_address : "localhost" },
    { name = "BULLMQ_ENABLED", value = tostring(var.enable_redis) },
    { name = "MONGODB_ENABLED", value = tostring(local.mongodb_on) },
    { name = "PROMETHEUS_ENABLED", value = "true" },
    { name = "CORS_ORIGINS", value = join(",", var.cors_origins) }
    ],
    # 앱은 allowUnknown이라 이 변수가 남아도 부팅은 되지만, 큐가 없으면
    # 가리킬 URL도 없다. 켰을 때만 주입한다.
    var.enable_sqs ? [{ name = "MESSAGE_QUEUE_URL", value = aws_sqs_queue.messages[0].url }] : []
  )

  app_secrets = concat(
    [{
      name      = "DB_PASSWORD"
      valueFrom = "${aws_db_instance.this.master_user_secret[0].secret_arn}:password::"
    }],
    var.mongodb_secret_arn == null ? [] : [{
      name      = "MONGODB_URI"
      valueFrom = var.mongodb_secret_arn
    }]
  )
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  cpu                      = 512
  memory                   = 1024
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name         = "app"
    image        = var.container_image
    essential    = true
    environment  = local.app_environment
    secrets      = local.app_secrets
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "app"
      }
    }
  }])
}

resource "aws_lb" "this" {
  name               = substr(local.name, 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "app" {
  name        = substr("${local.name}-app", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  health_check {
    healthy_threshold   = 2
    interval            = 30
    path                = "/v1/system/health"
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    target_group_arn = aws_lb_target_group.app.arn
    type             = "forward"
  }
}

resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.app.id]
    subnets          = aws_subnet.public[*].id
  }

  load_balancer {
    container_name   = "app"
    container_port   = var.container_port
    target_group_arn = aws_lb_target_group.app.arn
  }

  depends_on = [aws_lb_listener.http]
}
