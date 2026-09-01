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

# 기본값이 없는 것은 의도다. 이전에는 `compute.tf`에 "https://replace-me.example"이
# 박혀 있었고, 앱의 production 검증(스킴 있음·와일드카드 아님)을 **통과**하기 때문에
# task는 멀쩡히 뜨고 브라우저 요청만 조용히 막혔다. 복제 모델에서는 사본을 고치면
# 됐지만 참조 모델에서는 고칠 방법이 없으므로 소비자가 반드시 넘겨야 한다.
#
# 아래 validation은 앱의 규칙을 plan 시점으로 당긴 것이다 — 같은 실패를
# ECS task 기동이 아니라 `terraform plan`에서 본다.
# > src/config/env.validation.ts:136 · src/config/cors.config.ts:14
variable "cors_origins" {
  description = "Allowed browser origins, each with a scheme (e.g. https://app.example.com)"
  type        = list(string)

  validation {
    condition     = length(var.cors_origins) > 0
    error_message = "cors_origins must list at least one origin."
  }

  validation {
    condition     = !contains(var.cors_origins, "*")
    error_message = "cors_origins must not contain \"*\" - the app rejects it in production."
  }

  validation {
    condition     = alltrue([for o in var.cors_origins : can(regex("^[a-z][a-z0-9+.-]*://", o))])
    error_message = "Each cors_origins entry must include a scheme. Browsers send Origin as scheme://host[:port]."
  }
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "desired_count" {
  type    = number
  default = 1
}

# 앱은 이 값으로 Express `trust proxy`를 설정한다. 0은 "프록시 없음"이라
# `req.ip`가 ALB IP가 되고 ThrottlerGuard가 전 사용자를 한 버킷에 넣는다.
# 이 구성은 ALB 하나를 세우므로 기본값이 1이다. CloudFront를 앞에 얹는
# 소비자는 2로 올린다. `true`(전부 신뢰)는 XFF 위조로 throttle을 우회시키므로
# 앱이 숫자만 받는다.
#
# 상한 10은 앱의 Joi 스키마와 같은 값이다 — 여기서 넘기면 task가 부팅에 실패한다.
# > src/config/env.validation.ts:64 · src/app.setup.ts:75
variable "trust_proxy_hops" {
  description = "Number of proxy hops the app should trust for X-Forwarded-For"
  type        = number
  default     = 1

  validation {
    condition     = var.trust_proxy_hops >= 0 && var.trust_proxy_hops <= 10 && floor(var.trust_proxy_hops) == var.trust_proxy_hops
    error_message = "trust_proxy_hops must be an integer between 0 and 10."
  }
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

# 기본값 false다. 이 앱의 messaging composition root는 BullMQ/Redis이고
# (src/infra/queue/queue.module.ts) `MESSAGE_QUEUE_URL`을 읽는 코드가 없다.
# 켜면 소비자 없는 큐·DLQ·IAM 권한이 그대로 생기므로 기본은 끈다.
#
# 지우지 않고 input으로 남긴 이유: 모델 B에서 소비 프로젝트는 이 구성을
# 참조만 하고 고칠 수 없다. SQS가 필요한 소비자에게 남기는 유일한 문이다.
# 켜는 쪽은 앱에 `MessageQueuePort`의 SQS adapter를 함께 만들어야 한다.
variable "enable_sqs" {
  description = "Create the SQS main/dead-letter queues and grant the task access"
  type        = bool
  default     = false
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
