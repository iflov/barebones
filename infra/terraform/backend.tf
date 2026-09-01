# 이 블록은 **root 전용**이다. backend는 하위 모듈에 존재할 수 없으므로,
# 이 구성을 재사용 모듈로 빼면 이 파일은 소비 프로젝트의 root로 이동한다.
#
# 빈 블록이지만 지워선 안 된다. partial configuration도 backend **type**은
# 구성 안에서 정해야 하고, 이 블록이 없으면 `-backend-config=backend.hcl`은
# `Warning: Missing backend configuration`을 내고 local backend로 초기화된다.
# 나머지 값(bucket/key/region)은 `backend.hcl`이 채운다.
terraform {
  backend "s3" {}
}
