import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const rootDir = dirname(fileURLToPath(import.meta.url));

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
    // 도메인 코드는 `IRepository<T>`(src/common/persistence/repository.port.ts)만 본다.
    // TypeORM은 어댑터·연결 옵션·마이그레이션 세 곳에만 있고, 그래서 ORM을 갈아탈 때
    // 새로 쓸 파일이 어댑터 하나로 고정된다. 문서만으로는 이게 지켜지지 않으니 빌드로 내린다.
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
                'constitution A-1-P: TypeORM Repository는 src/common/persistence/ 안에서만 주입받는다. 도메인 모듈은 provideRepositoryPort()로 IRepository<T>를 등록하고 그것을 주입받을 것.',
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
                'constitution A-1-P: 쿼리와 TypeORM 타입은 src/common/persistence/의 어댑터 안에 둔다. 도메인 Repository는 IRepository<T>의 FindCriteria만 쓸 것.',
            },
          ],
        },
      ],
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
