# Barebones architecture

이 문서는 Barebones와 파생 프로젝트가 사용하는 아키텍처의 단일 진실 원천이다. 새 capability를
추가하거나 기존 실행 경로, 외부 I/O, module communication, persistence model을 변경할 때 먼저
이 규칙을 적용한다.

**파생 프로젝트의 실측이 이 문서를 고친다.** 규칙이 실제 코드와 부딪혀 값을 못 하는 것이
드러나면 그 근거와 함께 여기를 바꾼다 — 아래 「Inbound port」와 「Outbound port」가
2026-09-03에 그렇게 바뀌었다(ceseem-backend CES-125). 템플릿이 파생 프로젝트보다 뒤처지면
새 프로젝트가 이미 폐기된 형태로 시작한다.

## 고정 문법

Barebones는 **feature-first hexagonal modular monolith**다. 제품과 운영 capability는 자신이 쓰는
HTTP 진입점, application 흐름, domain 언어, 외부 I/O 계약과 adapter를 함께 소유한다.

런타임 호출은 안쪽에서 바깥쪽으로 진행할 수 있지만 코드 의존성은 port를 향한다.

```text
runtime

HTTP / CLI / message
        ↓
inbound adapter
        ↓
inbound port 구현 (application service)
        ↓
application coordinator (여러 entry point가 판단을 공유할 때)
        ↓
outbound port
        ↓
outbound adapter
        ↓
DB / remote API / queue / cache / filesystem

compile-time

inbound adapter    ──→ inbound port
다른 capability     ──→ inbound port (+ 상대의 domain type·순수 함수)
application        ──→ outbound port
outbound adapter   ──→ outbound port + application/domain types
composition root   ──→ 두 port에 구현을 묶는다
```

Capability는 `src/<capability>/`에 둔다. 기존 `src/health/`가 운영 capability reference다.

```text
src/<capability>/
  adapters/
    in/http/              controller, dto, guard, pipe
    out/persistence/      entity, repository (port 구현)
  application/
    ports/
      in/                 이 capability가 밖에 제공하는 interface + Symbol token  ← 공개
      out/                이 capability가 밖에 요구하는 interface + Symbol token  ← 비공개
    <capability>.service.ts   inbound port의 구현. module exports에 실리지 않는다
  domain/                 # domain type이나 business rule이 있을 때        ← 공개
  <capability>.module.ts  # composition root — 두 port에 구현을 묶는 유일한 지점
```

**방향이 곧 공개 여부다.** `in`은 밖에서 나를 부르는 계약이라 공개하고, `out`은 내가 DB를
부르는 계약이라 감춘다. `adapters/in`·`adapters/out`과 어휘가 하나로 통일되고, 외울 규칙이
아니라 방향에서 따라 나온다.

빈 폴더는 만들지 않는다. 구조의 고정점은 폴더 수가 아니라 capability 소유권, 두 방향의 port,
의존 방향이다.

## Inbound port — 밖에서 나를 부르는 계약

- capability가 밖에 제공하는 것은 `application/ports/in/`의 **interface + Symbol token** 하나다.
  소비자(HTTP adapter든 다른 capability든)는 `@Inject(TOKEN)`으로 받고 타입은 `import type`으로 본다.
- 구현 클래스는 module `exports`에 싣지 않는다. 그래야 소비자의 런타임 import가 Symbol 하나로
  줄고 **capability 사이 순환 참조가 생기지 않는다.**
- 메서드 목록이 곧 *"이 capability가 무엇을 할 수 있는가"*다. 한 파일에서 함께 읽힌다.
- 판단이 없는 위임 메서드가 섞이는 것은 정상이다. adapter가 비공개이므로 밖에서 읽으려면 이
  계약을 지나야 하고, 그 비용은 **한 줄**이다.
- 같은 판단을 여러 entry point가 쓰거나 여러 흐름이 같은 orchestration을 쓸 때만 application
  coordinator를 추출한다.
- 별도 read database, event sourcing, eventual consistency는 요구사항이 있을 때 도입한다.

### 전역 Command/Query 버스는 기본이 아니다

이 문서는 2026-09-03까지 *"CQRS-lite — write는 `Command`+`CommandHandler`, read는
`Query`+`QueryHandler`"*를 기본으로 규정했다. 파생 프로젝트에서 **그 규칙이 값을 못 한다는
것이 실측으로 드러나** 바꿨다 (ceseem-backend CES-125, 교차 검증 2건 + 후속 조사).

버스가 사려던 것 셋 중 하나도 실현되지 않았다:

- _"소비자가 상대 module을 import하지 않는다"_ — 실제로는 네 module이 그대로 import하고 있었다
- _"나중에 프로세스를 나눌 수 있다"_ — handler 절반이 `Propagation.MANDATORY`라 호출자의
  트랜잭션과 행 잠금을 공유한다. 프로세스를 나누면 **에러 없이** 깨진다
- _"결합이 준다"_ — 아는 대상이 클래스에서 메시지 클래스로 바뀌었을 뿐 강도가 같다

대신 한 capability의 handler 17개 중 **8개가 port 메서드를 그대로 전달**했고, 판단이 있는
9개와 똑같이 생겨서 어느 쪽인지 열어봐야 했다. 같은 규칙을 다른 capability에 적용하면
9/18, 5/12가 같은 모양이 됐다. 원인은 *"다른 capability의 데이터에 메시지로만 닿는다"*는
규칙이고, cross-capability 읽기·잠금은 모듈러 모놀리스에서 정상이다.

interface를 두는 값은 **의존 역전이 아니다** — 부르는 쪽이 나를 아는 것은 원래 옳은 방향이다.
값은 셋이다: 공개 표면을 좁히는 것, 런타임 import를 Symbol 하나로 줄여 **순환 참조를 막는 것**,
테스트 대역 자리를 만드는 것. 버스는 메시지 클래스를 런타임 import하므로 그중 둘째조차 못 준다.

**버스를 쓰는 조건**: 같은 메시지를 **여러 inbound가 보내거나**, dispatch 자체가 값을 하는
경우(공통 pipeline, 비동기 전달, 독립 read model)다. 그 조건이 없으면 쓰지 않는다.

기술 표현만 노출하는 endpoint는 예외다. `/metrics`처럼 library-native representation을 그대로
반환하고 application 판단, authorization, ownership, orchestration이 없는 endpoint는 inbound
infrastructure adapter 안에서 끝날 수 있다.

## Outbound port — 내가 밖에 요구하는 계약

Application이 외부 I/O를 필요로 하면 구현체가 하나여도 port를 반드시 둔다.
`application/ports/out/`에 두고 adapter가 구현한다.

**여기가 의존 역전이 실제로 값을 하는 자리다** — application이 ORM을 모르므로 DB 없이 테스트하고,
저장소를 바꿔도 판단이 안 바뀐다. inbound 쪽에는 뒤집을 것이 없다는 것이 두 방향의 차이다.

```ts
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  create(user: NewUser): Promise<User>;
}
```

Port 대상:

- aggregate persistence와 이름 있는 query/write
- remote API, payment, mail, object storage
- message publishing
- cache나 distributed coordination을 application 판단이 직접 요구하는 경우
- 동작의 결정성을 위해 대체해야 하는 clock, random, filesystem

Port 대상이 아닌 것:

- validator, formatter, calculator 같은 in-process business implementation
- handler나 coordinator를 한 번 더 감싸는 interface
- adapter library의 메서드를 그대로 복사한 범용 facade

Port는 사용하는 capability가 소유한다. `UserRepositoryPort`, `PaymentGatewayPort`처럼 의미를
드러내고 `Repository<T>`나 driver query options를 application interface에 노출하지 않는다.
여러 capability가 delivery semantics까지 의도적으로 공유하는 `MessageQueuePort` 같은 platform
interface만 `src/common/`에 둘 수 있다.

⚠ **범용 `IRepository<T>` 기반을 새 capability의 기본으로 삼지 않는다.** 파생 프로젝트에서 두
표본이 같은 결론을 냈다 (2026-09-03, ceseem-backend). adapter가 실제로 필요로 한 것은
pessimistic lock(`FOR UPDATE`), `ON CONFLICT DO NOTHING ... RETURNING`, `"col" + 1` 같은 raw
SET, 범위 비교였고 그 넷 다 generic 기반으로 표현되지 않아 우회했다. `WhereFilter`가 범위·부분
일치·OR을 **의도적으로** 뺐으므로 표현하려면 포트를 ORM 쿼리 언어로 넓혀야 하는데, 그것은 이
문서가 금지하는 바로 그것이다. 실사용 소비자가 끝까지 0이었다.

Adapter는 raw ORM을 쓰고, 경계는 **"ORM을 감추는 곳"이 아니라 "ORM이 밖으로 안 나가는 곳"**이다.
application interface에 `FindCriteria`, `WhereFilter`, `Partial<T>` 기반 CRUD를 노출하지 않는
규칙은 그대로다.

반복되는 mapper나 driver error translation이 **실제로 세 번째** 생기면 그때
`adapters/out/persistence/` 전용의 작은 helper로 뽑는다. application의 범용 CRUD port로
다시 올리지 않는다.

## Domain and persistence models

- Application/domain type은 TypeORM, Prisma, MikroORM, Drizzle, Mongoose 같은 persistence metadata와
  driver type을 포함하지 않는다.
- Product CRUD의 domain model은 plain interface나 data class처럼 얇을 수 있다. Aggregate, value
  object, policy는 실제 invariant가 생길 때 추가한다.
- ORM entity/schema는 outbound persistence adapter가 소유한다.
- 변환은 먼저 adapter의 작은 private function으로 둔다. 여러 call site나 독립 규칙이 생길 때만
  Mapper 클래스로 추출한다.
- HTTP DTO → application command/query → domain/persistence로 이어지는 중간 DTO 사슬을 만들지 않는다.

## HTTP, validation, and errors

- Controller는 transport parsing, Command/Query dispatch, HTTP status/header/representation만 맡는다.
- 문자열 형식, required field 같은 transport validation은 DTO/Pipe에서 수행한다.
- ownership, 상태 전이, 금액 제한 같은 business invariant는 재사용 가능한 application/domain
  경로에서 수행한다.
- uniqueness와 referential integrity는 DB가 최종적으로 보장하고 adapter가 driver error를
  framework-neutral error로 번역한다.
- Application/domain error는 HTTP exception이 아니다. Inbound HTTP adapter나 global transport
  mapping이 status와 response envelope를 결정한다.

## Module communication

- 다른 capability가 즉시 결과를 필요로 하면 상대의 `application/ports/in/` interface를 주입받아
  동기 호출한다. Adapter 내부나 ORM repository를 직접 import하지 않는다.
- **상대의 `domain/`은 공개 표면이다.** 거기 있는 domain type과 순수 함수는 다른 capability가
  직접 import해도 된다. `isVerified(user)`처럼 세 줄로 답하는 순수 함수를 호출로 감싸는 것은
  비용도 읽기도 손해이고, `src/common/`으로 올리면 그것이 도메인 지식의 하치장이 된다.

  대가는 분명히 해둔다: `domain/`에 **판단이 새면 그 결합도 조용히 따라온다.** 그래서
  `domain/`에는 타입과 순수 함수만 둔다. 상태를 읽거나 외부와 말하는 순간 그것은
  `application/`이고, 밖에서는 inbound port로만 닿는다.

- 그래서 한 capability가 밖에 허용하는 것은 **① `application/ports/in/`의 interface + Symbol
  token**과 **② `domain/`의 타입·순수 함수** 둘이다. `adapters/`와 `application/ports/out/`은
  아니다.
- 독립 후속 작업과 temporal decoupling이 필요하면 event/message를 사용하고 delivery, retry,
  idempotency, DLQ semantics를 adapter 구성에 명시한다.
- 하나의 invariant를 원자적으로 지켜야 할 때만 shared transaction을 검토한다.
- Cross-module ORM relation decorator와 DB foreign key는 별개 결정이다. Relation navigation을 편의상
  추가하지 않고 owner와 coupled change surface를 먼저 확인한다.

  ⚠ **FK는 relation decorator에서만 유도된다.** 컬럼만 남기고 relation을 지우면 다음
  `migration:generate`가 그 FK를 **DROP하는 SQL을 뱉는다**(실측). 그래서 다른 capability의
  entity를 가리켜야 할 때는 클래스 대신 **엔티티 이름 상수**를 쓴다 — 소유 capability가
  `domain/`에 `const X_ENTITY_NAME = 'X'`를 공개하고, 가리키는 쪽은
  `@ManyToOne(X_ENTITY_NAME, ...)`에 `prop?: unknown`을 쓴다. 스키마와 런타임 동작은 클래스를
  넘길 때와 같고 컴파일 시점 의존만 사라진다.

  이름이 어긋나면 `tsc`가 아니라 DataSource 초기화가 죽으므로
  (`Entity metadata for X#prop was not found`), 소유 capability의 entity spec이 클래스 이름과
  상수를 대조한다 — **이름을 바꾸는 사람 옆에서** 먼저 깨지게 한다.

## Composition and platform modules

`src/infra/`와 `src/config/`는 제품 capability가 아니라 기술 선택과 application composition을
제공한다. Redis나 RDB 전체를 추상화하는 global port를 만들지 않는다. 소비 capability가 필요한
행위를 자신의 port로 선언하고, platform module은 그 adapter를 조립할 primitive를 제공한다.

Nest module은 composition root다. Application/domain이 adapter를 선택하지 않으며 feature flag와
concrete provider wiring은 module/config에 남긴다.

## Tests and enforcement

- application service test는 **outbound port fake**를 주입하고 observable result와 side effect를
  검증한다.
- 소비자 test는 상대의 **inbound port fake**를 주입한다. 대역이 메서드 이름을 갖는 것이 값이다.
- Adapter test는 실제 protocol/driver translation과 error mapping을 검증한다.
- RDB semantics는 선택한 실제 Docker database로 E2E 검증한다.
- HTTP E2E는 status, headers, validation, response representation을 검증한다.
- Test는 production interface를 사용한다. TypeORM repository나 adapter 내부를 직접 호출해 business
  behavior를 우회하지 않는다.

ESLint가 강제하는 것:

1. ORM·DB driver·Redis·queue·Express·filesystem/network package를 `application/`·`domain/`에서 차단
2. `application/`·`domain/` → `adapters/`·`infra/` 역방향 import 차단
3. `application/ports/`·`domain/`에서 `@nestjs/*` 차단
4. **capability를 넘는 `adapters/**`import를`src/**`·`scripts/**`·`test/**` 전체에서 차단**

⚠ 4번이 따로 필요한 이유 (2026-09-03 실측): 2번은 **import하는 파일이** `application/`·`domain/`일
때만 걸린다. 그래서 아직 전환하지 않은 코드와 `scripts/`·`test/`는 아무 제약이 없고, 실제로
소비자 spec 3개와 스크립트 1개가 게이트를 전부 통과한 채 남의 adapter를 잡고 있었다.
module의 `exports`가 막는 것은 **생성자 주입뿐**이다 — `app.get()`, type import, spec은 못 막는다.

⚠ 4번을 추가할 때 **같은 룰 이름으로 블록을 새로 만들지 않는다.** ESLint flat config는 같은 룰을
병합하지 않고 **교체**하므로, `files`가 겹치는 기존 블록의 규칙이 조용히 사라진다. 이름이 다른
base `no-restricted-imports`를 쓰거나 기존 블록 안에 넣는다. 추가한 뒤 위반 코드를 실제로 넣어
**기존 규칙이 여전히 무는지** 확인한다.

정적 import 검사만으로 port의 의미나 structural type 누출까지 증명할 수 없으므로 이름 있는 port와
test surface는 review에서 함께 확인한다.

## Current references

- Health: `src/health/` — HTTP 진입점, coordinator, outbound port, 여러 adapter, readiness mapping.
- Messaging: `src/common/messaging/message-queue.port.ts`와 `src/infra/queue/` — shared platform port와
  BullMQ adapter/delivery policy. 제품 job handler reference는 아직 아니다.
- Persistence: `src/common/persistence/`와 `test/persistence.e2e-spec.ts` — 실제 DB translation test가
  붙어 있는 generic 기반. **새 capability의 기본으로 쓰지 않는다**(위 「Outbound port」의 ⚠ 참고).

## 이 템플릿이 아직 문서를 따라가지 못하는 곳

문서를 먼저 고치고 코드를 뒤에 옮긴다. 지금 어긋난 자리를 적어둔다 — 적어두지 않으면 다음
프로젝트가 이 코드를 보고 이미 폐기된 형태로 시작한다.

| 자리                             | 어긋난 것                                                                                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/health/`                    | `QueryBus` + `GetHealthQuery`로 진입한다. 호출자가 `health.controller.ts` 하나뿐이라 위 「전역 Command/Query 버스는 기본이 아니다」의 조건을 만족하지 못한다. `application/ports/in/health.port.ts` + `HealthCoordinator` 주입으로 옮긴다 |
| `health.controller.ts`           | `execute<GetHealthQuery, SystemHealth>(...)`로 타입 인자를 **둘** 명시한다. `@nestjs/cqrs`의 두 번째 오버로드가 잡혀 결과 타입을 거짓말해도 `tsc`가 통과시킨다(파생 프로젝트에서 실측). 버스를 걷어내면 이 함정 자체가 사라진다           |
| `application/ports/`             | `in`/`out`으로 나뉘어 있지 않다                                                                                                                                                                                                           |
| `src/architecture-rule-fixture/` | 파일 없는 빈 디렉토리 셋. *"빈 폴더는 만들지 않는다"*를 템플릿이 어기고 있다                                                                                                                                                              |
| ESLint                           | 위 「Tests and enforcement」의 4번(capability를 넘는 adapter import 차단)이 없다                                                                                                                                                          |
