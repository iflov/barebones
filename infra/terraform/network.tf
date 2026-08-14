data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name          = "${var.project_name}-${var.environment}"
  selected_azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  db_port       = var.db_engine == "postgres" ? 5432 : 3306
  db_driver     = var.db_engine
  mongodb_on    = var.mongodb_secret_arn != null
  redis_on      = var.enable_redis
  public_cidrs  = ["10.20.0.0/24", "10.20.1.0/24"]
  private_cidrs = ["10.20.10.0/24", "10.20.11.0/24"]
}

resource "aws_vpc" "this" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count = 2

  availability_zone       = local.selected_azs[count.index]
  cidr_block              = local.public_cidrs[count.index]
  map_public_ip_on_launch = true
  vpc_id                  = aws_vpc.this.id

  tags = { Name = "${local.name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count = 2

  availability_zone = local.selected_azs[count.index]
  cidr_block        = local.private_cidrs[count.index]
  vpc_id            = aws_vpc.this.id

  tags = { Name = "${local.name}-private-${count.index + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = 2

  route_table_id = aws_route_table.public.id
  subnet_id      = aws_subnet.public[count.index].id
}

resource "aws_security_group" "alb" {
  name_prefix = "${local.name}-alb-"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port   = 80
    protocol    = "tcp"
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    protocol    = "-1"
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name_prefix = "${local.name}-app-"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = var.container_port
    protocol        = "tcp"
    to_port         = var.container_port
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    protocol    = "-1"
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "data" {
  name_prefix = "${local.name}-data-"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = local.db_port
    protocol        = "tcp"
    to_port         = local.db_port
    security_groups = [aws_security_group.app.id]
  }

  dynamic "ingress" {
    for_each = var.enable_redis ? [1] : []
    content {
      from_port       = 6379
      protocol        = "tcp"
      to_port         = 6379
      security_groups = [aws_security_group.app.id]
    }
  }
}
