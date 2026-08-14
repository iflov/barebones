variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Resource name prefix"
  type        = string
  default     = "barebones"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "container_image" {
  description = "Deployable application image URI"
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "db_engine" {
  description = "Materialized RDB engine"
  type        = string
  default     = "postgres"

  validation {
    condition     = contains(["postgres", "mysql", "mariadb"], var.db_engine)
    error_message = "db_engine must be postgres, mysql, or mariadb."
  }
}

variable "db_name" {
  type    = string
  default = "app"
}

variable "db_username" {
  type    = string
  default = "app"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "enable_redis" {
  type    = bool
  default = true
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "mongodb_secret_arn" {
  description = "Optional Secrets Manager ARN whose value is the MongoDB URI"
  type        = string
  default     = null
  nullable    = true
}
