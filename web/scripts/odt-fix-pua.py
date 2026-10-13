#!/usr/bin/env python3
"""ODT 안의 한컴 전용 문자(유니코드 사용자 정의 영역)를 일반 글자로 바꾼다.

pyhwp(hwp5odt)로 만든 ODT 를 LibreOffice 로 PDF 변환하기 전에 쓴다.
한컴 글꼴에만 있는 기호는 서버 글꼴로 그릴 수 없어 □ 로 나오기 때문이다.
표준 라이브러리만 사용한다. 사용: python3 -I odt-fix-pua.py <입력.odt> <출력.odt>
"""
import sys
import zipfile

# 관찰된 문자만 넣는다. 새로 발견되면 여기에 추가한다.
PUA_MAP = {
    "": "한",  # '한글' 로고의 '한' (예: "글 워드 프로세서")
}
TARGETS = {"content.xml", "styles.xml"}


def main(src, dst):
    changed = 0
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename in TARGETS:
                text = data.decode("utf-8")
                for k, v in PUA_MAP.items():
                    changed += text.count(k)
                    text = text.replace(k, v)
                data = text.encode("utf-8")
            # ODF 규칙: mimetype 은 첫 항목, 압축하지 않음
            ctype = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(info, data, compress_type=ctype)
    print(changed)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("사용: odt-fix-pua.py <입력.odt> <출력.odt>")
    main(sys.argv[1], sys.argv[2])
