#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""sourceData(JSON, stdin) → 기사 JSON(stdout).

Contents/Photography 에서 검증된 generate_articles.py 의 build_article() 을
그대로 불러 쓴다. 로직을 옮겨 적지 않으므로 폴더에서 돌린 결과와 항상 같다.

  생성기 위치 : ARTICLE_GEN_DIR 환경변수 (generate_articles.py 가 있는 폴더)
  사용        : python gen_article.py <path_name>
  path_name   : athletes/ 의 파일명({competitionID}-{name}.json).
                제목 유형 순환 seed 에 쓰이므로 폴더 파이프라인과 같은 값을 넘겨야
                같은 제목이 나온다.
"""
import importlib.util
import json
import os
import sys

# 한글이 깨지지 않도록 표준입출력을 UTF-8 로 고정 (Windows 기본은 cp949)
try:
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass


def die(msg, code=2):
    sys.stderr.write(msg + '\n')
    sys.exit(code)


gen_dir = os.environ.get('ARTICLE_GEN_DIR', '').strip()
if not gen_dir:
    die('ARTICLE_GEN_DIR 이 설정되지 않았습니다.')

mod_path = os.path.join(gen_dir, 'generate_articles.py')
if not os.path.isfile(mod_path):
    die('생성기를 찾을 수 없습니다: %s' % mod_path)

# main() 은 __main__ 일 때만 돌아가므로 import 만으로는 파일을 읽거나 쓰지 않는다
spec = importlib.util.spec_from_file_location('generate_articles', mod_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

path_name = sys.argv[1] if len(sys.argv) > 1 else 'article.json'

try:
    src = json.load(sys.stdin)
except Exception as e:
    die('sourceData JSON 파싱 실패: %s' % e)

try:
    doc = mod.build_article(src, path_name)
except Exception as e:
    die('기사 생성 실패: %s' % e, 3)

sys.stdout.write(json.dumps(doc, ensure_ascii=False, indent=2))
