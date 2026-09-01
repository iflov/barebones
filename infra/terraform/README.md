# AWS Terraform starter

기본 프로필은 2개 AZ VPC, ALB, ECS Fargate, RDS, 선택적 ElastiCache Valkey를 만듭니다.
MongoDB는 DocumentDB를 동일 제품처럼 취급하지 않으며, Atlas 등 실제 MongoDB URI를 AWS Secrets
Manager ARN으로 주입합니다. SQS/DLQ는 `enable_sqs`로 켜며 기본은 꺼짐입니다.

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

## foundation과 service

한 root 안에 두 층이 있고 이름 축이 갈려 있습니다. 아직 state는 하나지만, 층 구분은
코드에 이미 반영돼 있습니다.

| 층             | 이름                             | 무엇                                                                                |
| -------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| **foundation** | `project_name`-`environment`     | VPC, subnet, route table, ALB + listener, ALB SG, ECS 클러스터, DB subnet group     |
| **service**    | foundation 이름 + `service_name` | task definition, ECS service, target group, task SG, data SG, IAM, RDS, Valkey, SQS |

foundation은 여러 서비스가 나눠 쓰도록 설계했습니다. **데이터 플레인(RDS/Valkey)은
서비스별입니다** — 공유하려면 `hashicorp/aws`만으로는 안 되고 별도 SQL provider와
VPC 안에서 도는 특권 runner가 필요한데, 서울 리전 `db.t4g.micro` + `cache.t4g.micro`가
월 $32 남짓이라 그 운영 표면을 사는 거래가 성립하지 않습니다. 자세한 근거는
[결정 문서](../../docs/terraform-repo-boundary.md)에 있습니다.

`outputs.tf`의 foundation 계약(VPC ID, subnet IDs, ALB SG ID, listener ARN,
cluster ARN)은 지금 아무도 쓰지 않지만, 층이 갈릴 때 service root가 읽어야 하는
값들입니다. 전달은 `terraform_remote_state`가 아니라 SSM Parameter Store를 씁니다 —
전자는 output만 읽는 것처럼 보여도 state 스냅샷 전체에 대한 읽기 권한을 요구합니다.

보안 그룹 rule은 inline `ingress`가 아니라 별도 `aws_vpc_security_group_*_rule`
리소스입니다. inline 블록은 authoritative라 층이 갈리면 foundation apply가
service가 붙인 rule을 지웁니다.

## 소비자가 반드시 넘겨야 하는 값

| 변수              | 기본값 | 왜 여기 있는가                                                                               |
| ----------------- | ------ | -------------------------------------------------------------------------------------------- |
| `container_image` | 없음   | 배포할 이미지 URI. ECR build/push 경로는 아직 CI에 없습니다.                                 |
| `cors_origins`    | 없음   | 브라우저 Origin 목록. 스킴 필수, `*` 금지 — 앱의 production 검증을 plan 시점으로 당겼습니다. |

## 토폴로지가 정하는 값

| 변수               | 기본값  | 근거                                                                                                    |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| `service_name`     | `api`   | foundation 안에서의 정체성. 리소스 이름과 Redis 네임스페이스가 여기서 유도됩니다.                       |
| `trust_proxy_hops` | `1`     | 이 구성은 ALB 하나입니다. CloudFront를 얹으면 2. 실제보다 크게 잡으면 XFF 위조로 rate limit이 뚫립니다. |
| `enable_redis`     | `true`  | BullMQ와 캐시의 backend입니다.                                                                          |
| `enable_sqs`       | `false` | 앱에 `MESSAGE_QUEUE_URL` 소비자가 없습니다. 켜려면 `MessageQueuePort`의 SQS adapter를 먼저 만듭니다.    |

## backend

`backend.tf`의 `backend "s3" {}`는 빈 블록이지만 지우면 안 됩니다. partial configuration도
backend **type**은 구성 안에서 정해야 하고, 없으면 `-backend-config=backend.hcl`이
`Warning: Missing backend configuration`을 내고 local backend로 초기화됩니다.

상태 버킷은 이 구성과 별도 bootstrap에서 만들고 versioning을 켜십시오. `backend.hcl`은 커밋하지
않으며 예제의 S3 `use_lockfile`을 사용합니다.

`backend.tf`와 `versions.tf`의 `provider` 블록은 **root 전용**입니다. 이 구성을 재사용 모듈로
빼면 둘 다 소비 프로젝트의 root로 이동합니다 — 하위 모듈은 backend를 가질 수 없고, provider를
가지면 그 모듈에 `count`/`for_each`/`depends_on`을 쓸 수 없습니다.

## CI

`.github/workflows/terraform.yml`이 `infra/terraform/**` 변경에만 반응해
`fmt -check` / `init -backend=false` / `validate`를 돌립니다. 자격증명이 필요 없는 검사만
있으며 `plan`/`apply`는 아직 없습니다 — OIDC role과 승인 경로가 정해지지 않았습니다.

## 아직 없는 것

- **listener rule이 없습니다.** 지금은 listener의 default action이 이 서비스의
  target group을 직접 forward합니다. 서비스가 둘이 되면 default는 고정 404가 되고
  각 service가 host/path 기반 `aws_lb_listener_rule`을 소유해야 합니다. rule
  priority는 listener 안에서 유일해야 하므로(중복 시 `PriorityInUse`) 대역 배정
  규약이 함께 필요합니다. host-based냐 path-based냐는 미결정입니다.
- **한 번도 apply된 적이 없습니다.** 이 구성이 실제로 뜨는지 미검증입니다.
- ECR build/push와 이미지 태그 전달 경로. `Dockerfile`의 `EXPOSE 3000`도
  `var.container_port`와 무관하게 고정입니다.
- HTTPS listener/ACM, WAF, private ECS subnet + NAT/VPC endpoints, autoscaling, secret rotation.
  현재 ECS task는 public subnet에 `assign_public_ip = true`로 뜹니다 — private subnet에는
  route table도 NAT도 없습니다.

AWS 자격증명을 `.tf`나 `.tfvars`에 넣지 마십시오. AWS CLI profile, 환경변수 또는 CI의 OIDC role을
사용합니다.
