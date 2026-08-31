# Terraform 저장소 경계

> **상태: 미결정 — 내일 이어서**
> `infra/terraform`을 앱 저장소 밖으로 뺄 것인가. 3라운드 교차검증 결과와 아직 내리지 않은 결정.
> 2026-08-31

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

## 분리 여부와 무관하게 고쳐야 하는 결함

검증 중에 드러난 것들이다. **같은 저장소에 있는데도 이 계약들이 이미 어긋나 있다**는 게
요점 — 별도 repo로 옮긴다고 정렬되지 않고, 발견만 늦어진다.

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

1. **모델 A냐 B냐를 먼저 정한다.**
   복제냐 버전 모듈 참조냐. 이게 저장소 경계를 결정한다. 나머지 단계는 여기에 종속된다.

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
