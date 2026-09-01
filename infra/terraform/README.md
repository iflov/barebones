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

## 소비자가 반드시 넘겨야 하는 값

| 변수              | 기본값 | 왜 여기 있는가                                                                               |
| ----------------- | ------ | -------------------------------------------------------------------------------------------- |
| `container_image` | 없음   | 배포할 이미지 URI. ECR build/push 경로는 아직 CI에 없습니다.                                 |
| `cors_origins`    | 없음   | 브라우저 Origin 목록. 스킴 필수, `*` 금지 — 앱의 production 검증을 plan 시점으로 당겼습니다. |

## 토폴로지가 정하는 값

| 변수               | 기본값  | 근거                                                                                                    |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
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

- **한 번도 apply된 적이 없습니다.** 이 구성이 실제로 뜨는지 미검증입니다.
- ECR build/push와 이미지 태그 전달 경로. `Dockerfile`의 `EXPOSE 3000`도
  `var.container_port`와 무관하게 고정입니다.
- HTTPS listener/ACM, WAF, private ECS subnet + NAT/VPC endpoints, autoscaling, secret rotation.
  현재 ECS task는 public subnet에 `assign_public_ip = true`로 뜹니다 — private subnet에는
  route table도 NAT도 없습니다.

AWS 자격증명을 `.tf`나 `.tfvars`에 넣지 마십시오. AWS CLI profile, 환경변수 또는 CI의 OIDC role을
사용합니다.
