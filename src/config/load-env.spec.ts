import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { envFilePaths, loadEnvFiles } from './load-env.js';

describe('envFilePaths', () => {
  it('환경별 파일을 먼저, 공용 .env를 나중에 둔다', () => {
    expect(envFilePaths('production')).toEqual(['.env.production', '.env']);
  });

  it('인자가 없으면 process.env.NODE_ENV를 쓴다', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'staging';

    try {
      expect(envFilePaths()).toEqual(['.env.staging', '.env']);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('NODE_ENV도 없으면 development로 본다', () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      expect(envFilePaths()).toEqual(['.env.development', '.env']);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe('loadEnvFiles', () => {
  let dir: string;
  const touched: string[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'load-env-'));
  });

  afterEach(() => {
    for (const key of touched.splice(0)) {
      delete process.env[key];
    }
    rmSync(dir, { force: true, recursive: true });
  });

  function writeEnv(name: string, body: string): string {
    const path = join(dir, name);
    writeFileSync(path, body, 'utf8');

    return path;
  }

  it('존재하는 파일만 읽고 읽은 경로를 돌려준다', () => {
    touched.push('LOAD_ENV_A');
    const present = writeEnv('.env', 'LOAD_ENV_A=from-file\n');

    expect(loadEnvFiles([join(dir, '.env.missing'), present])).toEqual([present]);
    expect(process.env.LOAD_ENV_A).toBe('from-file');
  });

  it('없는 파일만 주면 빈 배열이다 (부팅 로그가 "none"이라고 말할 수 있어야 한다)', () => {
    expect(loadEnvFiles([join(dir, '.env.nope')])).toEqual([]);
  });

  /**
   * ConfigModule과 같은 우선순위여야 한다. 두 로더가 다른 값을 주면
   * "부팅은 됐는데 플래그만 다른" 상태가 만들어진다.
   */
  it('이미 있는 process.env 값을 덮어쓰지 않는다 (OS 환경변수 우선)', () => {
    touched.push('LOAD_ENV_B');
    process.env.LOAD_ENV_B = 'from-os';

    loadEnvFiles([writeEnv('.env', 'LOAD_ENV_B=from-file\n')]);

    expect(process.env.LOAD_ENV_B).toBe('from-os');
  });

  it('먼저 읽은 파일의 값이 이긴다 (.env.production이 .env보다 우선)', () => {
    touched.push('LOAD_ENV_C');
    const first = writeEnv('.env.production', 'LOAD_ENV_C=production\n');
    const second = writeEnv('.env', 'LOAD_ENV_C=shared\n');

    loadEnvFiles([first, second]);

    expect(process.env.LOAD_ENV_C).toBe('production');
  });
});
