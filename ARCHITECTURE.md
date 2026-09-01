# Barebones architecture

이 문서는 Barebones와 파생 프로젝트가 사용하는 아키텍처의 단일 진실 원천이다. 새 capability를
추가하거나 기존 실행 경로, 외부 I/O, module communication, persistence model을 변경할 때 먼저
이 규칙을 적용한다.

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
CommandHandler | QueryHandler
        ↓
application coordinator (여러 entry point가 판단을 공유할 때)
        ↓
outbound port
        ↓
outbound adapter
        ↓
DB / remote API / queue / cache / filesystem

compile-time

inbound adapter ──→ application/domain
application     ──→ outbound port
outbound adapter ──→ outbound port + application/domain types
composition root ──→ application + adapters
```

Capability는 `src/<capability>/`에 둔다. 기존 `src/health/`가 운영 capability reference다.

```text
src/<capability>/
  adapters/
    in/http/
    out/persistence/
  application/
    commands/
    queries/
    ports/
  domain/                 # domain type이나 business rule이 있을 때
  <capability>.module.ts  # composition root
```

빈 폴더는 만들지 않는다. 구조의 고정점은 폴더 수가 아니라 capability 소유권, CQRS 진입점,
mandatory outbound port와 의존 방향이다.

## CQRS-lite

- create/update/delete와 외부 side effect를 시작하는 write는 `Command`와 `CommandHandler`가 맡는다.
- read는 `Query`와 `QueryHandler`가 맡는다.
- Handler가 application use case다. 같은 판단을 전달만 하는 별도 `UseCase` 클래스를 겹쳐 만들지 않는다.
- HTTP와 CLI처럼 여러 entry point가 같은 판단을 쓰거나 여러 handler가 같은 orchestration을 쓸 때만
  application coordinator를 추출한다.
- 별도 read database, event sourcing, eventual consistency는 요구사항이 있을 때 도입한다.

기술 표현만 노출하는 endpoint는 예외다. `/metrics`처럼 library-native representation을 그대로
반환하고 application 판단, authorization, ownership, orchestration이 없는 endpoint는 inbound
infrastructure adapter 안에서 끝날 수 있다. 이 조건 중 하나라도 생기면 Command/Query 경로로 올린다.

## Mandatory outbound ports

Application이 외부 I/O를 필요로 하면 구현체가 하나여도 port를 반드시 둔다. Port는 application이
외부 세계에 요구하는 capability 언어이며 adapter가 구현한다.

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

`src/common/persistence/IRepository<T>`는 TypeORM adapter를 구현하기 위한 내부 기반이다. Feature
adapter는 필요하면 이 기반을 조합할 수 있지만 CommandHandler, QueryHandler, coordinator의
interface에는 `FindCriteria`, `WhereFilter`, `Partial<T>` 기반 CRUD를 노출하지 않는다.

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

- 다른 capability가 즉시 결과를 필요로 하면 상대 capability의 이름 있는 application interface를
  동기 호출한다. Adapter 내부나 ORM repository를 직접 import하지 않는다.
- 독립 후속 작업과 temporal decoupling이 필요하면 event/message를 사용하고 delivery, retry,
  idempotency, DLQ semantics를 adapter 구성에 명시한다.
- 하나의 invariant를 원자적으로 지켜야 할 때만 shared transaction을 검토한다.
- Cross-module ORM relation decorator와 DB foreign key는 별개 결정이다. Relation navigation을 편의상
  추가하지 않고 owner와 coupled change surface를 먼저 확인한다.

## Composition and platform modules

`src/infra/`와 `src/config/`는 제품 capability가 아니라 기술 선택과 application composition을
제공한다. Redis나 RDB 전체를 추상화하는 global port를 만들지 않는다. 소비 capability가 필요한
행위를 자신의 port로 선언하고, platform module은 그 adapter를 조립할 primitive를 제공한다.

Nest module은 composition root다. Application/domain이 adapter를 선택하지 않으며 feature flag와
concrete provider wiring은 module/config에 남긴다.

## Tests and enforcement

- Handler/coordinator test는 port fake를 주입하고 observable result와 side effect를 검증한다.
- Adapter test는 실제 protocol/driver translation과 error mapping을 검증한다.
- RDB semantics는 선택한 실제 Docker database로 E2E 검증한다.
- HTTP E2E는 status, headers, validation, response representation을 검증한다.
- Test는 production interface를 사용한다. TypeORM repository나 adapter 내부를 직접 호출해 business
  behavior를 우회하지 않는다.

ESLint는 `application/`과 `domain/`에서 adapter/infra 역방향 import 및 ORM, DB driver, Redis,
BullMQ, Mongoose, Express, filesystem/network package import를 차단한다. 정적 import 검사만으로
mandatory port의 의미나 structural type 누출까지 증명할 수 없으므로 이름 있는 port와 test surface는
review에서 함께 확인한다.

## Current references

- Health: `src/health/` — HTTP Query, coordinator, outbound port, 여러 adapter, readiness mapping.
- Messaging: `src/common/messaging/message-queue.port.ts`와 `src/infra/queue/` — shared platform port와
  BullMQ adapter/delivery policy. 제품 job handler reference는 아직 아니다.
- Persistence: `src/common/persistence/`와 `test/persistence.e2e-spec.ts` — adapter 내부 generic 기반과
  실제 DB translation test. 제품 repository port reference는 첫 product capability에서 추가한다.
