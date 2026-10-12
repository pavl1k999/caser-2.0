#!/usr/bin/env python3
"""Скачивает все картинки скинов и кейсов со Steam CDN в папку img/.

После этого сайт берёт картинки из img/ и не зависит от доступности Steam.

Использование (из корня проекта):
    python3 scripts/download_images.py            # скачать недостающие
    python3 scripts/download_images.py --threads 32
    python3 scripts/download_images.py --off      # вернуть загрузку со Steam CDN

Повторный запуск докачивает только то, чего ещё нет.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "js", "data.js")
FLAG = os.path.join(ROOT, "js", "local-images.js")
OUT = os.path.join(ROOT, "img")
SIZE = "/256fx256f"


def load_db():
    with open(DATA, encoding="utf-8") as f:
        s = f.read()
    start = s.index("window.DB=") + len("window.DB=")
    return json.loads(s[start:s.rindex(";")])


def jobs(db, base):
    base = base or db["img"]
    for sid, row in db["skins"].items():
        img = row[3]
        yield (img if img.startswith("http") else base + img) + SIZE, os.path.join(OUT, "skins", sid + ".png")
    for c in db["cases"]:
        if c.get("img"):
            yield base + c["img"] + SIZE, os.path.join(OUT, "cases", c["id"] + ".png")


def fetch(url, path, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            if len(data) < 32:
                raise ValueError("пустой ответ")
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
            return None
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(1.5 * 2 ** attempt)
    return f"{url}: {err}"


def write_flag(on):
    with open(FLAG, "w", encoding="utf-8") as f:
        f.write("/* Сгенерировано scripts/download_images.py */\n")
        f.write(f"window.LOCAL_IMAGES={'true' if on else 'false'};\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", type=int, default=16)
    ap.add_argument("--base", help="другой адрес CDN вместо Steam (для зеркал)")
    ap.add_argument("--off", action="store_true", help="снова грузить картинки со Steam CDN")
    a = ap.parse_args()
    if a.off:
        write_flag(False)
        print("Сайт снова берёт картинки со Steam CDN.")
        return

    os.makedirs(os.path.join(OUT, "skins"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "cases"), exist_ok=True)
    todo = [(u, p) for u, p in jobs(load_db(), a.base) if not os.path.exists(p)]
    print(f"Нужно скачать: {len(todo)}")
    errors, done = [], 0
    with ThreadPoolExecutor(a.threads) as ex:
        futs = [ex.submit(fetch, u, p) for u, p in todo]
        for f in as_completed(futs):
            done += 1
            if f.result():
                errors.append(f.result())
            if done % 100 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)}, ошибок: {len(errors)}", flush=True)

    if errors:
        print("\nНе скачались (запустите скрипт ещё раз, чтобы докачать):")
        for e in errors[:20]:
            print("  " + e)
        if len(errors) > 20:
            print(f"  … и ещё {len(errors) - 20}")
    # включаем локальные картинки, даже если часть не скачалась:
    # для недостающих сайт сам попробует Steam CDN
    write_flag(True)
    print("\nГотово. Сайт берёт картинки из папки img/.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
