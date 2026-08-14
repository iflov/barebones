# AWS Terraform starter

기본 프로필은 2개 AZ VPC, ALB, ECS Fargate, RDS, 선택적 ElastiCache Valkey, SQS와 DLQ를 만듭니다.
MongoDB는 DocumentDB를 동일 제품처럼 취급하지 않으며, Atlas 등 실제 MongoDB URI를 AWS Secrets
Manager ARN으로 주입합니다.

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

상태 버킷은 이 구성과 별도 bootstrap에서 만들고 versioning을 켜십시오. `backend.hcl`은 커밋하지
않으며 예제의 S3 `use_lockfile`을 사용합니다. 운영에서는 HTTPS listener/ACM, WAF, private ECS
subnet+NAT/VPC endpoints, autoscaling과 secret rotation을 환경 요구에 맞게 추가해야 합니다.

AWS 자격증명을 `.tf`나 `.tfvars`에 넣지 마십시오. AWS CLI profile, 환경변수 또는 CI의 OIDC role을
사용합니다.
