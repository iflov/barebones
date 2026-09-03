import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const rootDir = dirname(fileURLToPath(import.meta.url));

const externalIoImports = [
  '@keyv/redis',
  '@mikro-orm/core',
  '@mikro-orm/nestjs',
  '@nestjs/bullmq',
  '@nestjs/cache-manager',
  '@nestjs/mongoose',
  '@nestjs/platform-express',
  '@nestjs/swagger',
  '@nestjs/typeorm',
  '@prisma/client',
  'axios',
  'bullmq',
  'cache-manager',
  'drizzle-orm',
  'express',
  'ioredis',
  'mongoose',
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'prom-client',
  'typeorm',
].map((name) => ({
  message:
    'architecture: application/domain은 외부 I/O 구현을 import하지 않는다. capability-owned port를 두고 adapter에서 이 package를 사용할 것.',
  name,
}));

export default tseslint.config(
  {
    ignores: [
      '.husky/**',
      'commitlint.config.cjs',
      'coverage/**',
      'dist/**',
      'eslint.config.mjs',
      'node_modules/**',
      'src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,mts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
      // constitution A-5 — 객체 spread 금지.
      //
      // `{ ...base, extra }`는 읽는 사람의 흐름을 끊는다. 이 객체에 어떤 필드가 있는지
      // 알려면 `base`를 찾아가야 하고, 그게 또 spread면 다시 따라가야 한다.
      // `...(cond ? { x } : {})`는 더 나쁘다 — 필드가 **있을 수도 없을 수도** 있어서
      // 타입만 봐서는 실제 모양을 알 수 없다.
      //
      // 배열 spread(`[...items]`)와 rest 파라미터(`del(...keys)`)는 대상이 아니다.
      // 둘 다 구조를 가리지 않고 타입이 그 자리에 있다.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ObjectExpression > SpreadElement',
          message:
            'constitution A-5: 객체 spread를 쓰지 않는다. 필드를 명시해서 쓰거나, 조건부 필드는 값으로 undefined를 넣거나, 객체를 만든 뒤 조건부로 대입할 것.',
        },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'unused-imports/no-unused-imports': 'error',
    },
  },
  {
    // constitution A-1-R / A-1-P — TypeORM이 존재할 수 있는 곳을 제한한다.
    //
    // Feature application은 capability-owned port만 본다. Feature persistence adapter는 필요하면
    // `IRepository<T>`(src/common/persistence/repository.port.ts)를 내부 구현 기반으로 조합한다.
    // TypeORM query surface는 공용 adapter·연결 옵션·마이그레이션에만 있고, ORM을 갈아탈 때
    // application interface가 따라 바뀌지 않는다. 문서만으로는 지켜지지 않으니 lint로 내린다.
    //
    // ⚠ 이 룰은 **import 문만** 본다. TypeScript는 구조적 타입이라
    // 어떤 Repository가 `findOne(options: FindOneOptions<T>)`를 노출하면 호출부는
    // 타입을 import하지 않고 객체 리터럴만 넘겨도 통과한다. 즉 타입이 밖으로 **번지는** 것은
    // 막지만, 그런 시그니처를 갖는 것 자체는 못 막는다 — 그쪽은 A-1-W와 코드 리뷰의 몫이다.
    //
    // 예외:
    //   src/common/persistence/**  포트의 유일한 구현체가 사는 곳
    //   src/config/**              연결 옵션과 마이그레이션 CLI용 DataSource
    //   src/database/**            마이그레이션 파일
    //
    // test/**도 대상에 포함한다. src만 검사하면 "e2e에서 직접 조회해서 검증"하는 우회로가
    // 열리고, 그러면 도메인 Repository를 거치지 않는 테스트가 만들어져 정규화·select 규칙이
    // 깨져도 초록불이 된다. 엔티티 정의 데코레이터(@Entity/@Column)는 쿼리 표면이 아니라
    // 금지 목록에 없으므로, 테스트가 픽스처 엔티티를 만드는 것은 그대로 가능하다.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ignores: ['src/common/persistence/**', 'src/config/**', 'src/database/**', 'src/infra/rdb/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/typeorm',
              importNames: ['InjectRepository', 'getRepositoryToken'],
              message:
                'architecture: TypeORM Repository는 src/common/persistence/ 안에서만 주입받는다. feature module은 provideRepositoryPort()로 내부 adapter를 조립하고 application에는 capability-owned port만 제공할 것.',
            },
            {
              name: 'typeorm',
              importNames: [
                'DataSource',
                'DeepPartial',
                'DeleteResult',
                'EntityManager',
                'FindManyOptions',
                'FindOneOptions',
                'FindOptionsOrder',
                'FindOptionsSelect',
                'FindOptionsWhere',
                'In',
                'InsertResult',
                'IsNull',
                'Like',
                'Not',
                'QueryDeepPartialEntity',
                'Repository',
                'SelectQueryBuilder',
                'UpdateResult',
              ],
              message:
                'architecture: query와 TypeORM 타입은 src/common/persistence/의 adapter 안에 둔다. feature adapter가 필요하면 IRepository<T>를 내부에서 조합하고 application에는 이름 있는 port만 제공할 것.',
            },
          ],
        },
      ],
    },
  },
  {
    // ARCHITECTURE.md — 다른 capability의 adapter를 직접 import하지 않는다.
    //
    // ## 왜 규칙이 하나 더 필요한가 (2026-09-03, 파생 프로젝트에서 실측)
    //
    // 아래 역방향 차단은 **import하는 파일이** `application/`·`domain/`일 때만 걸린다.
    // 그래서 아직 전환하지 않은 capability의 service·spec과 `scripts/`·`test/`는 아무 제약이
    // 없고, 실제로 소비자 spec 3개와 스크립트 1개가 게이트를 전부 통과한 채 남의 adapter를
    // 잡고 있었다. module의 `exports`가 막는 것은 **생성자 주입뿐**이다 —
    // `app.get()`, type import, spec은 못 막는다.
    //
    // ## ⚠ 규칙 이름을 base `no-restricted-imports`로 쓴 이유
    //
    // ESLint flat config는 같은 룰을 **병합하지 않고 교체한다.** 아래 세 블록이 전부
    // `@typescript-eslint/no-restricted-imports`이고 `files`가 겹치므로, 같은 이름으로
    // 블록을 하나 더 만들면 **그 셋이 조용히 사라진다.** 이름이 다른 base 룰을 쓰면
    // 교체가 일어나지 않는다. (위 A-5 spread 블록에 적힌 것과 같은 함정이다.)
    //
    // ## 무엇을 막고 무엇을 허용하나
    //
    // 막는 것은 **capability 이름을 거쳐 adapters로 들어가는 경로**다. 자기 capability 안의
    // `./adapters/**`·`../adapters/**`는 걸리지 않는다 — module이 자기 adapter를 조립하는
    // 것은 composition root의 일이다.
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*/adapters/**',
                '../../*/adapters/**',
                '../../../*/adapters/**',
                '../../../../*/adapters/**',
                '../src/*/adapters/**',
                '../../src/*/adapters/**',
              ],
              message:
                'ARCHITECTURE.md: 다른 capability의 adapter를 직접 import하지 않는다. 그쪽이 공개한 application/ports/in 계약이나 domain 타입을 쓸 것. 테스트도 production interface를 쓴다.',
            },
          ],
        },
      ],
    },
  },
  {
    // ARCHITECTURE.md — application/domain은 port 안쪽이며 concrete adapter를 선택하지 않는다.
    files: ['src/**/application/**/*.ts', 'src/**/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: externalIoImports,
          patterns: [
            {
              group: ['**/adapters/**', '**/infra/**'],
              message:
                'architecture: application/domain에서 adapter나 infra를 역방향 import하지 않는다. 필요한 외부 행위를 port로 선언할 것.',
            },
          ],
        },
      ],
    },
  },
  {
    // Port는 Nest DI/CQRS까지 모르는 framework-neutral application interface다.
    files: ['src/**/application/ports/**/*.ts', 'src/**/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: externalIoImports,
          patterns: [
            {
              group: ['@nestjs/*'],
              message:
                'architecture: domain과 application port는 Nest framework를 import하지 않는다.',
            },
            {
              group: ['**/adapters/**', '**/infra/**'],
              message:
                'architecture: domain과 application port는 adapter나 infra를 import하지 않는다.',
            },
          ],
        },
      ],
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.{cjs,js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  eslintConfigPrettier,
);
