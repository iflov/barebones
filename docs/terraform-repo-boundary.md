# Terraform 저장소 경계

> **상태: 모델 B 선택됨 (2026-09-01). 분리는 아직 실행하지 않았다.**
> `infra/terraform`을 앱 저장소 밖으로 뺄 것인가. 3라운드 교차검증 결과와 내린 결정.
> 조사 2026-08-31 · 결정 2026-09-01
>
> **✅ 종결 (2026-09-01): `infra/terraform`은 [iflov/barebones-infra](https://github.com/iflov/barebones-infra)로
> 나갔다.** 이 문서는 그 결정의 기록으로 barebones에 남는다.
>
> 최종 근거는 저장소 경계도 CI 비용도 아니었다 — **barebones는 스캐폴드이고 스캐폴드는
> 템플릿만 실을 수 있는데, foundation은 환경당 하나뿐인 인스턴스다.** VPC·ALB·ECS
> 클러스터는 복제하면 사고이지 기능이 아니고, 그 소비자에는 이 스캐폴드에서 나오지
> 않은 저장소(frontend 등)도 포함된다. 아래 "2026-09-01 재검토"에서 변경 빈도와
> blast radius로 그은 foundation/service 선이, 재사용 가능성으로 그으면 나오는
> "인스턴스 / 템플릿" 선과 같았다.
>
> 남은 배포 경계는 컨테이너까지다 — `Dockerfile`, Compose, `.env.example`,
> `src/config/env.validation.ts`. 전부 클라우드에 무관하다.
>
> 이전은 `git subtree split`으로 했고 이 구성을 만든 커밋 3개가 함께 갔다.
>
> ---
>
> **⚠ 아래 "추천과 그 근거"는 2026-09-01에 폐기됐다.** 그 추천은 "terraform 사본 하나당
> 소비자 하나"를 전제했는데, 사용자가 그 전제가 틀렸다고 정정했다 — frontend와 다른
> 서비스가 **같은 인프라를 나눠 쓴다.** 갱신된 판단은 아래 "2026-09-01 재검토"에 있다.
>
> **결정: 모델 B — 파생 프로젝트는 버전 모듈을 참조한다.** 따라서 별도 repo가 최종 목적지다.
> 다만 아래 "추천과 그 근거"의 순서 제약은 그대로 유효해서, 지금 옮기지 않는다 —
> 모듈 인터페이스는 한 번 apply해서 무엇이 입력이고 무엇이 프로젝트별인지 드러난 뒤에 정한다.
> B는 대신 그 사이 작업의 **내용**을 바꿨다: 파생 프로젝트가 사본에서 고쳤을 값이
> 전부 input이 되어야 한다. 참조 모듈은 편집할 수 없기 때문이다.

## 먼저 정할 것은 repo가 아니다

"인프라를 별도 repo로 뺄까"는 답이 나오지 않는 질문이다. 그 답은 앞선 질문 하나에
전적으로 종속된다 — **파생 프로젝트가 terraform을 복제하는가, 참조하는가.**
이게 정해지면 저장소 경계는 자동으로 따라온다.

|             | 모델 A — starter를 복제한다                                    | 모델 B — 버전 모듈을 참조한다                                                     |
| ----------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 방식        | 프로젝트마다 terraform 사본을 갖고 각자 고친다. 현재 방식이다. | infra를 별도 repo로 만들고 각 프로젝트가 `source = "git::…?ref=v1.2"`로 참조한다. |
| 버그 수정   | N개 사본에 각각 반영해야 한다.                                 | 한 번 고치면 모든 프로젝트가 업그레이드를 받는다.                                 |
| 저장소 경계 | in-tree가 자연스럽다                                           | **별도 repo가 필수다**                                                            |

앞으로 프로젝트를 여러 개 시작할 계획이라면 **모델 B는 진지하게 매력적이고, 처음 꺼냈던
CI 트리거 논거보다 훨씬 강한 분리 근거다.** 대신 모듈은 안정적인 input/output 계약과
버전 호환성을 유지해야 한다. starter는 마음대로 고쳐도 되지만 모듈은 그럴 수 없다.

## 검증된 사실

Codex 레인과 3라운드 브리프를 주고받으며 교차검증했다. 판정은 각 주장이 어떻게
결론났는지를 표시한다 — 일부는 검증 과정에서 정정됐다.

### ✅ 확인됨 — 위치는 분리의 장애가 아니다

`infra/terraform`은 이미 얕은 경계다. 앱 코드·스크립트 어디서도 참조하지 않고, CI도
terraform을 돌리지 않는다. 디렉터리를 들어냈을 때 저장소 쪽에서 깨지는 것은 README 링크와
root 기준 무시 규칙 2줄이 전부다.

> `README.md:112,117` · `.gitignore:11` · `.github/workflows/ci.yml:44`

### ✅ 확인됨 — state 이동 비용은 0이다

Terraform resource address는 module path와 type/name으로 구성되고 filesystem path는
주소 구성요소가 아니다. 같은 backend key를 쓰는 한 저장소를 옮겨도 state migration이
필요 없다. 게다가 이 terraform은 **한 번도 apply된 적이 없다** — `.terraform/`에
`providers/`만 있고 backend metadata도, state도 없다.

> `infra/terraform/.terraform/` · `backend.hcl`·`terraform.tfvars`·`*.tfstate` 전부 부재

### ⚠️ 정정됨 — db_engine drift는 조용하지 않다

처음엔 "검증기가 없어 조용히 어긋난다"고 봤으나 틀렸다.
`DB_TYPE: Joi.string().valid(activeScaffold.rdb.database)`가 부팅을 거부한다.
다만 CI가 terraform을 돌리지 않으므로 발견 시점은 in-tree든 분리든
**동일하게 ECS task 기동 시점**이다 — "같은 repo라서 더 일찍 발견한다"는
자동화 근거는 없다.

> `src/config/env.validation.ts:106`

### ✅ 확인됨 — CI 트리거 결합은 실재하지만 분리로 풀 문제가 아니다

paths 필터가 없어 `.tf` 한 줄 변경이 pnpm install → postgres e2e → build 전체를 돌린다.
단 `paths-ignore`로 끊긴다 (`pull_request`와 `push`가 별개 이벤트라 두 곳 다 필요).
main은 `404 Branch not protected`이고 ruleset도 비어 있어, skip된 required check가
Pending으로 머무는 함정은 현재 해당 없다.
**끊는 순간 terraform은 아무 CI도 못 받는 상태가 된다.**

> `.github/workflows/ci.yml:3-6` · `bitbucket-pipelines.yml:14`

### ✅ 확인됨 — compute 축은 기존 scaffold 검증 기계를 재사용할 수 없다

`check:scaffold`가 Compose를 구조적으로 검증하는 건 devDep에 `yaml` 파서가 있고
나머지가 전부 TS이기 때문이다. **deps에 HCL 파서가 없다.** 게다가 terraform 의미는
`db_engine` → local `db_driver` → ECS env처럼 계산되니 문자열 검색으로 계약을 잡을 수 없고,
`terraform validate`는 HCL/provider schema만 본다.

> `scripts/check-scaffold.ts:58-70` · `network.tf:8` → `compute.tf:80`

### ✅ 확인됨 — ORM 축과 compute 축은 규모가 다르다

ORM profile은 파일 2~3개 갈아끼우기다 — `scaffold/orm-profiles/` 전체가 142줄,
이를 떠받치는 기계가 928줄. compute는 배포 topology 전체라 ECS 하나만 489줄이고,
EKS는 cluster/node IAM, node group, add-on IAM, workload identity,
Deployment/Service/Ingress까지 붙어 2~4배로 추정된다.

> `network.tf` 126 + `data.tf` 59 + `compute.tf` 187 = 489줄

### ❓ 미검증 — ECS starter의 실제 동작

한 번도 apply된 적이 없으므로 이 terraform이 실제로 뜨는지, 뜨면 앱이 정상 부팅하는지
전부 미검증이다. EKS profile의 실제 줄 수 배수도 endpoint·node model·ingress 결정
전에는 주장할 수 없다.

## 2026-09-01 재검토 — 소비자가 여럿이라는 정정

사용자가 문서의 전제를 정정했다.

> frontend 혹은 다른 서비스의 인프라도 다 이 프로젝트에 종속되고 프로젝트별로
> 나눠져 있지 않기 때문에 이걸 나누는 비용이 발생한다

인프라의 소비자가 처음부터 여러 개다. 그러면 "독립 app 소비자 수 ≥ 2"라는 이 문서의
분리 신호가 **이미 켜져 있었다.** in-tree 유지 추천은 근거가 사라졌다.

Claude와 Codex(orca 워크트리 `infra-seam-audit`, gpt-5.6-terra high)가 2라운드
교차검증했다. 읽기 전용, 코드 변경 없음.

### 저장소 경계는 state 경계가 아니다 — Claude 정정됨

Claude가 "저장소만 옮기면 frontend service apply가 backend RDS와 같은 state를 건드려
지금보다 나빠진다"고 했는데 틀렸다. **state 경계는 backend key가 정한다.** 저장소를
옮겨도 key가 같으면 같은 state이고, 저장소를 안 옮겨도 key를 나누면 state는 나뉜다.
저장소 분리는 state 분리의 필요조건도 충분조건도 아니다.

### 모델 B는 두 가지로 갈린다

|                      | B1 — 모듈 라이브러리                   | B2 — 공유 환경               |
| -------------------- | -------------------------------------- | ---------------------------- |
| infra repo가 갖는 것 | 재사용 **모듈**. 버전 태그             | 실제로 도는 **리소스**       |
| 각 프로젝트          | 자기 root에서 인스턴스화               | 그 환경에 자기 서비스를 등록 |
| 결과                 | **프로젝트마다 VPC·RDS가 따로 생긴다** | 하나를 나눠 쓴다             |

이 문서가 말한 B(`source = "git::…?ref=v1.2"`)는 **B1**이다. git `ref`는 소스 버전을
고를 뿐 이미 만들어진 VPC를 가리키지 않으므로 B1은 공유를 만들지 않는다. 사용자의
제약은 **B2**를 가리킨다. 최종 형태는 혼합이다 — foundation은 B2(live), service는
B1(버전 모듈)이고 각 앱 저장소가 그것을 참조한다.

### 공유 비용은 하나가 아니라 셋이고 복잡도가 다르다

AWS 공식 Price List, `ap-northeast-2`, 730h, storage·LCU 제외:

| 자원                        |         월 | 공유하려면 치를 값                            |
| --------------------------- | ---------: | --------------------------------------------- |
| VPC·subnet·IGW·ECS 클러스터 |         $0 | 없음                                          |
| ALB                         |     $16.43 | listener rule priority 거버넌스               |
| Valkey `cache.t4g.micro`    |     $14.02 | prefix 주입 + ACL/TLS — **앱 코드 변경 필요** |
| RDS `db.t4g.micro`          |     $18.25 | 별도 SQL provider + **VPC 안 특권 runner**    |
| 합계                        | **$48.69** |                                               |

### 공유 RDS는 config 선택이 아니라 운영 약속이다

`hashicorp/aws`만으로 공유 RDS의 최소권한을 만들 수 없다. `CREATE DATABASE`/`CREATE ROLE`/
`GRANT`는 SQL catalog 작업이라 `cyrilgdn/postgresql` 같은 provider가 필요하고, 그
provider는 RDS에 TCP로 붙어야 한다. RDS는 `publicly_accessible = false`(`data.tf:18`)에
private subnet이고 data SG는 app SG만 허용한다 — GitHub 호스티드 runner는 닿지 못한다.
따라서 VPC 안에서 도는 특권 실행 환경(CodeBuild VPC / self-hosted runner / bastion)과
DB-admin SG를 새로 만들어야 한다. $18.25/월을 아끼려고 **영구적인 특권 CI 표면**을
추가하는 거래다.

그걸 안 하면 대안은 지금 구조 그대로 — 모든 서비스에 master credential 배포다
(`data.tf:15` `manage_master_user_password = true` → `compute.tf:37`,`:103`).
한 서비스가 뚫리면 전부 뚫린다.

### 공유 Redis는 앱에 축은 있는데 인증이 없다

앱은 `REDIS_DB`·`REDIS_KEY_PREFIX`·`BULLMQ_PREFIX`를 이미 갖고 있다
(`env.validation.ts:85-89`, `cache.config.ts:29`, `redis.config.ts:29`). terraform이
안 넘겼을 뿐이고 이건 세 줄로 고쳐진다. 하지만 prefix는 이름 구분이지 권한 경계가
아니다. 진짜 격리(ElastiCache RBAC)는 username과 transit encryption을 요구하는데
`buildRedisOptions`(`redis.config.ts:20-32`)는 password만 받는다 — **앱 코드 변경이
선행**이다.

### 결정 (2026-09-01)

**공유의 손익비가 자원마다 달라 한 덩어리로 결정하지 않는다.**

```text
foundation (공유)  VPC, subnet, IGW, route table, ECS 클러스터, ALB + listener, ALB SG
service (서비스별)  RDS, Valkey, task def, target group, listener rule, SG, IAM, SQS
```

$32.27/월은 VPC 안 특권 CI 표면보다 싸다. 그리고 사용자가 말한 통증("인프라가 이
프로젝트에 종속된다")은 **공짜인 것들**(VPC·subnet·ECS 클러스터)을 공유하는 것만으로
대부분 해소된다. RDS 공유는 그 통증과 거의 무관하다.

**미결정:** ALB 라우팅이 host-based냐 path-based냐. rule priority는 listener 안에서
유일해야 하고(중복 시 `PriorityInUse`) 여러 root가 각자 번호를 고르는 구조는 성립하지
않으므로, 대역 배정 규약이 함께 정해져야 한다.

### 이 재검토로 실제로 한 것

무후회 작업 — 라우팅을 뭘 고르든, 데이터를 공유하든 안 하든 필요한 것들:

1. 이름 축 분리 (`local.foundation_name` / `local.service_name`, `var.service_name`).
   이전에는 `local.name` 하나가 VPC부터 target group까지 전부의 이름이라 서비스 둘이면 충돌했다.
2. `outputs.tf`에 foundation 계약 추가 — VPC ID, subnet IDs, ALB SG ID, listener ARN,
   cluster ARN, DB subnet group. 이전엔 하나도 없었다.
3. inline `ingress`/`egress` → `aws_vpc_security_group_*_rule`. inline은 authoritative라
   층이 갈리면 foundation apply가 service의 rule을 지운다.
4. `REDIS_DB`·`REDIS_KEY_PREFIX`·`BULLMQ_PREFIX` 주입 (service name에서 유도).
5. `backend.hcl.example`에 foundation/service key 규약.
6. ALB·target group 이름의 `substr(..., 0, 32)` 조용한 절단을 `lifecycle.precondition`으로.
   이름이 긴 서비스 둘이 같은 32자로 잘리는 사고가 apply 시점에야 드러났다.
7. 죽은 `local.redis_on` 제거.

### 검증 — 처음으로 plan이 통과했다

이 문서가 "한 번도 apply된 적이 없어 실제로 뜨는지 미검증"이라고 적은 것 중 일부가
풀렸다. 실제 AWS 대상으로:

```text
Plan: 33 to add, 0 to change, 0 to destroy.
```

`enable_sqs = false`가 기본이라 SQS/DLQ/IAM 정책은 계획에 없다. 분리된 SG rule 6개
(`aws_vpc_security_group_ingress_rule` 4 + `egress_rule` 2)가 정상 계획된다.
**apply는 하지 않았다** — plan 통과는 "AWS가 이 요청을 받아들일 것 같다"이지
"앱이 부팅한다"가 아니다. task 기동, health check 통과, env 계약 정합은 여전히 미검증이다.

validation과 precondition은 실제로 발화한다:

| 입력                                                              | 결과                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `service_name=API`                                                | `service_name must be lowercase alphanumeric with hyphens...` |
| `redis_db=16`                                                     | `redis_db must be an integer between 0 and 15.`               |
| `project_name=verylongprojectnamehere` + `environment=production` | `ALB name '...' exceeds 32 characters` (precondition)         |
| `service_name=averyveryverylongservicename`                       | `Target group name '...' exceeds 32` (precondition)           |

마지막 둘이 이전에는 `substr(..., 0, 32)`로 조용히 잘렸다.

---

## 분리 여부와 무관하게 고쳐야 하는 결함

검증 중에 드러난 것들이다. **같은 저장소에 있는데도 이 계약들이 이미 어긋나 있다**는 게
요점 — 별도 repo로 옮긴다고 정렬되지 않고, 발견만 늦어진다.

> **2026-09-01 현재 상태.** 아래 4개 중 3개를 고쳤다. 남은 하나(이미지 전달 경로)는
> AWS 계정 쪽 결정(OIDC role, apply 승인 주체)이 먼저다.
>
> | 결함               | 상태     | 어떻게                                                                                                                        |
> | ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
> | 소비자 없는 SQS    | 고침     | 지우지 않고 `var.enable_sqs`(기본 `false`)로 선택지화. 모델 B에서 소비자가 고칠 수 없으므로 문을 남겼다.                      |
> | `TRUST_PROXY_HOPS` | 고침     | `var.trust_proxy_hops`(기본 `1` = ALB 하나), 0–10 정수 validation이 앱 Joi와 같은 범위.                                       |
> | backend 블록 부재  | 고침     | `backend.tf`에 `backend "s3" {}`. 별도 파일인 이유는 backend가 하위 모듈에 존재할 수 없어서 — 모듈화 시 소비 root로 이동한다. |
> | 이미지 전달 경로   | **남음** | ECR build/push, 태그 전달, apply 승인 주체 미정.                                                                              |
>
> 함께 한 것: `CORS_ORIGINS`가 `"https://replace-me.example"` 하드코딩이었는데 앱의 production
> 검증을 **통과**해서(스킴 있음·와일드카드 아님) task는 뜨고 브라우저만 조용히 막혔다.
> 기본값 없는 `var.cors_origins`로 올리고 앱의 규칙을 plan 시점 validation으로 당겼다.
> `infra/terraform/.gitignore`도 추가했다 — root의 `infra/terraform/...` 규칙은 경로가
> root 기준이라 디렉터리가 나가면 따라가지 못한다.
>
> CI: `.github/workflows/terraform.yml`이 `fmt -check`/`init -backend=false`/`validate`를 돌리고,
> `ci.yml`에 `paths-ignore`를 넣어 terraform-only 변경이 앱 파이프라인을 태우지 않게 했다.
> 순서는 아래 4번대로 CI를 먼저 만든 뒤 끊었다.

### 소비자 없는 SQS

terraform이 SQS + DLQ + IAM을 만들고 `MESSAGE_QUEUE_URL`을 ECS task에 주입하는데,
`src/`·`config/`·`.env.example` 전체에 참조가 0건이다. 앱의 messaging root는
BullMQ/Redis다. 비용과 권한만 존재한다.

> `compute.tf:89` · `data.tf:46` · `compute.tf:55` ↔ `src/infra/queue/queue.module.ts:15`

### ALB를 만들면서 빠뜨린 TRUST_PROXY_HOPS

terraform이 ALB를 세우지만 이 변수를 주입하지 않는다. 앱 기본값 0은 "프록시 없음"이라,
`.env.example` 주석이 경고한 그대로 rate limit이 ALB IP 기준 전 사용자 공용 버킷이 된다.

> `compute.tf:133` ↔ `src/config/env.validation.ts:64` · `src/app.setup.ts:67`

### backend 블록 부재

`.tf` 어디에도 `backend "s3"`가 없다. README의 `terraform init -backend-config=backend.hcl`은
`Warning: Missing backend configuration`을 내고 local backend로 초기화된다 —
partial config도 backend type을 정하는 빈 block을 요구한다.

> `infra/terraform/versions.tf` · `README.md:119`

### 이미지 전달 경로 없음

`container_image`는 terraform 필수 입력인데, ECR build/push나 태그를 넘기는 경로가
CI 어디에도 없다. 누가 어떤 digest를 쓰고 누가 apply를 승인하는지 미정이다.
`Dockerfile:38`의 `EXPOSE 3000`도 `var.container_port`와 무관하게 고정이다.

> `variables.tf:19` · `terraform.tfvars.example:4` · `.github/workflows/ci.yml:44`

## 선택지

| 선택지                           | 얻는 것                                                                                                                  | 새로 드는 비용                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. in-tree 유지** ← 추천       | 파생 프로젝트가 starter를 함께 복제하는 편의. 검증 표면 1개 유지. app↔deployment 계약이 한 곳에 보인다.                  | EKS/EC2가 필요한 프로젝트는 starter를 통째로 교체해야 한다. terraform-only 변경의 CI 격리는 `paths-ignore`로 따로 해결.                              |
| **B. 별도 infra repo**           | terraform-only 변경이 앱 CI를 안 태운다. AWS apply 권한과 state 접근을 앱 CI와 분리 — **이건 혼자여도 성립하는 근거다.** | infra repo CI를 새로 만들어야 한다: OIDC, state 접근, fmt/validate, PR plan, apply approval. EC2/ECS/EKS 선택 문제는 해결하지 못한다.                |
| **C. compute를 scaffold 축으로** | target이 생성 시 명시되고, 안 고른 target의 잔재가 남는 걸 checker가 막을 수 있다.                                       | 세 플랫폼의 terraform·IAM·networking·배포 artifact·CI를 전부 지원해야 한다. 검증 기계를 재사용할 수 없어(HCL 파서 부재) 검증 표면이 먼저 3배가 된다. |

## 추천과 그 근거

> **in-tree 유지. 단 근거는 "분리가 나쁘다"가 아니라 "모듈 계약을 정하기엔 이 terraform이
> 아직 한 번도 실행된 적 없다"이다.**

인프라를 별도 repo로 빼는 건 표준 관행이고 그 이유들은 정당하다 — 앱이 여러 개일 때,
blast radius가 다를 때, 소유자와 릴리스 주기가 갈릴 때, state 소유권이 겹칠 때.
**그중 blast radius 분리는 소비자가 하나여도 성립한다.**

다만 그 관행은 **실행 중인 시스템**에서 일어난다. barebones의 terraform은 아무도
apply하지 않는다 — apply하는 건 파생된 각 프로젝트가 자기 사본에 대해서다. 그래서 지금
빼면 결과물은 "아무도 apply하지 않는 terraform repo" 하나이고, 새 프로젝트마다 clone 두 번과
연결 작업이 생긴다. 그것도 그 프로젝트에 대해 가장 모르는 시점에.

업계가 하는 그 분리는 **barebones에서 시작할 각 프로젝트에서 어차피 일어난다.**
그때는 자기 topology를 알고 하게 되고, state 이동 비용은 그때도 0이다.

**단 조건부다.** state 기준으로는 미루는 데 비용이 없지만, 모델 B로 갈 거라면 미루는 데
비용이 있다 — 그 사이 시작한 프로젝트들이 전부 사본을 갖게 되고 나중에 되돌려야 한다.

## 내일 시작점

1. ~~**모델 A냐 B냐를 먼저 정한다.**~~ → **B(버전 모듈 참조)로 정했다 (2026-09-01).**
   저장소 경계는 별도 repo로 결정됐다. 다만 실행은 3번 이후다.

2. **ECS starter를 실행 가능한 단위로 완성한다.**
   `backend "s3"` 블록 추가 + `infra/terraform/.gitignore`, `TRUST_PROXY_HOPS` 주입,
   소비자 없는 SQS 처리 결정(adapter를 만들 것인가 리소스를 지울 것인가),
   `terraform fmt -check` / `init -backend=false` / `validate`를 CI에 추가.

3. **실제로 한 번 apply한다.**
   계약을 근거를 갖고 확인하는 유일한 방법이다. 모델 B로 갈 거라면 모듈 인터페이스는
   이 단계 이후에 정해야 한다 — 무엇이 모듈 입력이고 무엇이 프로젝트별로 남는지가
   여기서 드러난다.

4. **CI 결합은 별도로 끊는다.**
   `paths-ignore`는 2번과 독립적으로 넣을 수 있다. 단 terraform CI를 먼저 만들지 않으면
   terraform이 무보호 상태가 되므로 순서를 지킨다.

## 열린 질문

- 모델 B를 고른다면 모듈 경계를 어디에 긋는가 — VPC/네트워크까지 모듈에 넣는가,
  아니면 compute만 모듈이고 네트워크는 프로젝트별인가?
- 소비자 없는 SQS는 지우는가, 아니면 `MessageQueuePort`의 SQS adapter를 실제로 만드는가?
  (CLAUDE.md는 BullMQ를 기본 messaging composition root로 못박고 있다)
- EKS가 실제로 필요해지는 시점이 언제인가 — 그 신호가 나오기 전에 C를 설계할 이유가 있는가?

## 분리를 다시 꺼낼 신호

- 독립 app 소비자 수 ≥ 2 — 같은 state/root가 서로 독립 배포되는 두 image를 관리하게 될 때.
- 90일 내 infra-only production apply ≥ 3 — infra의 릴리스 주기가 앱과 갈라졌다는 뜻.
- 반대 신호: app↔terraform 계약 drift로 기동 실패가 나면 그건 분리 신호가 아니라
  **분리 보류 신호**다. 별도 repo는 그 결함을 해결하지 않고 발견을 더 늦춘다.

---

**검증 방법** — Claude(주 세션)와 Codex(orca 워크트리 `tf-extraction-audit`,
gpt-5.6-terra high)가 3라운드 브리프를 주고받으며 교차검증. 읽기 전용, 코드 변경 없음.
주장은 모두 `파일:줄` 또는 공식 문서로 근거를 붙였고, 검증 과정에서 정정된 주장은
정정됨으로 표시했다. 원문 근거는 `~/worklog/inbox/barebones.md`의 2026-08-31 breadcrumb.
