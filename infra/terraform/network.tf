data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # foundation — 여러 서비스가 나눠 쓴다. VPC, subnet, ECS 클러스터, ALB.
  foundation_name = "${var.project_name}-${var.environment}"

  # service — 이 서비스만의 것. task definition, target group, RDS, 큐.
  service_name = "${local.foundation_name}-${var.service_name}"

  selected_azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  db_port       = var.db_engine == "postgres" ? 5432 : 3306
  db_driver     = var.db_engine
  mongodb_on    = var.mongodb_secret_arn != null
  public_cidrs  = ["10.20.0.0/24", "10.20.1.0/24"]
  private_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]
}

resource "aws_vpc" "this" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = local.foundation_name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.foundation_name }
}

resource "aws_subnet" "public" {
  count = 2

  availability_zone       = local.selected_azs[count.index]
  cidr_block              = local.public_cidrs[count.index]
  map_public_ip_on_launch = true
  vpc_id                  = aws_vpc.this.id

  tags = { Name = "${local.foundation_name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count = 2

  availability_zone = local.selected_azs[count.index]
  cidr_block        = local.private_cidrs[count.index]
  vpc_id            = aws_vpc.this.id

  tags = { Name = "${local.foundation_name}-private-${count.index + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${local.foundation_name}-public" }
}

resource "aws_route_table_association" "public" {
  count = 2

  route_table_id = aws_route_table.public.id
  subnet_id      = aws_subnet.public[count.index].id
}

# ────────────────────────────────────────────────────────────────────────────
# 보안 그룹
#
# rule을 `aws_security_group`의 inline `ingress`/`egress`로 쓰지 않는다.
# inline 블록은 **authoritative**라 terraform이 구성에 없는 rule을 지운다.
# 그러면 foundation과 service가 갈렸을 때, service root가 공유 SG에 붙인 rule을
# foundation apply가 조용히 삭제한다. 별도 rule 리소스는 소유자를 rule 단위로
# 나눌 수 있어서, 각 root가 자기가 만든 rule만 관리한다.
# ────────────────────────────────────────────────────────────────────────────

# foundation. 여러 서비스의 task SG가 이걸 source로 참조한다.
resource "aws_security_group" "alb" {
  name_prefix = "${local.foundation_name}-alb-"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.foundation_name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  description       = "Public HTTP"
  security_group_id = aws_security_group.alb.id

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  description       = "ALB to targets"
  security_group_id = aws_security_group.alb.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}

# service. 이 서비스의 task만 담는다.
resource "aws_security_group" "app" {
  name_prefix = "${local.service_name}-app-"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.service_name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  description       = "ALB to this service"
  security_group_id = aws_security_group.app.id

  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  description       = "Task egress"
  security_group_id = aws_security_group.app.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}

# service. 이 서비스의 RDS/Valkey를 담는다.
# 데이터 플레인을 서비스끼리 공유하게 되면 이 SG는 foundation으로 올라가고,
# 아래 rule들은 각 service root가 자기 것을 만들게 된다 — 그때 inline이 아닌
# 것이 결정적으로 중요해진다.
resource "aws_security_group" "data" {
  name_prefix = "${local.service_name}-data-"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.service_name}-data" }
}

resource "aws_vpc_security_group_ingress_rule" "data_from_app" {
  description       = "Service tasks to RDB"
  security_group_id = aws_security_group.data.id

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = local.db_port
  to_port                      = local.db_port
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "data_redis_from_app" {
  count = var.enable_redis ? 1 : 0

  description       = "Service tasks to Valkey"
  security_group_id = aws_security_group.data.id

  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}

# data SG에 egress rule은 없다. RDS와 ElastiCache는 연결을 시작하지 않는다.
