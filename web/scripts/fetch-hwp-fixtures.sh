#!/usr/bin/env bash
# 변환 테스트용 HWP 샘플을 pyhwp 저장소의 고정 커밋에서 받아 test-fixtures/hwp/ 에 둔다.
# pyhwp 테스트 파일은 AGPL-3.0 프로젝트 소속이라 이 저장소에 커밋하지 않는다(.gitignore).
# 사용: bash scripts/fetch-hwp-fixtures.sh
set -euo pipefail
COMMIT=83239f0d3bdf438b2c9f7dcff455a6e841154a39
BASE="https://raw.githubusercontent.com/mete0r/pyhwp/${COMMIT}/tests/hwp5_tests/fixtures"
DEST="$(cd "$(dirname "$0")/.." && pwd)/test-fixtures/hwp"
mkdir -p "$DEST"

fetch() {
  local name="$1" sha="$2"
  if [ -f "$DEST/$name" ] && echo "$sha  $DEST/$name" | sha256sum -c --status; then
    echo "있음: $name"; return
  fi
  curl -fsSL --retry 2 -o "$DEST/$name.tmp" "$BASE/$name"
  echo "$sha  $DEST/$name.tmp" | sha256sum -c --status || { rm -f "$DEST/$name.tmp"; echo "체크섬 불일치: $name" >&2; exit 1; }
  mv "$DEST/$name.tmp" "$DEST/$name"
  echo "받음: $name"
}

fetch sample-5017.hwp ff3faae938610fcfbedc21c27c507ca0cc038b44872b65d10fcad0b55af67ba2
fetch table.hwp df4746b82eea954a2aba36eb7dc51acf8cd975dced5e3331a1838932eaf123f9
fetch password-12345.hwp e86aac42e3efbcc2e06cc50e628705dce710bec0c252961b7d52c87e3c6b0660
