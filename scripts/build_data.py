#!/usr/bin/env python3
"""Генерирует js/data.js из открытой базы скинов CS2 (ByMykel/CSGO-API).

Использование:
    python3 scripts/build_data.py            # скачает skins.json и crates.json
    python3 scripts/build_data.py DIR        # возьмёт skins.json и crates.json из DIR

Все цены — во внутренней виртуальной валюте и не связаны с реальным рынком.
"""
import hashlib
import json
import os
import sys
import urllib.request

API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/"
IMG_PREFIX = "https://community.akamai.steamstatic.com/economy/image/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "data.js")

# Границы износа (float) и множители цены — должны совпадать с js/core.js
WEAR_BOUNDS = [0.07, 0.15, 0.38, 0.45, 1.0]
WEAR_MULT = [1.6, 1.2, 1.0, 0.85, 0.75]
ST_CHANCE = 0.10
ST_MULT = 1.6

RARITY = {
    "rarity_common_weapon": "consumer",
    "rarity_uncommon_weapon": "industrial",
    "rarity_rare_weapon": "milspec",
    "rarity_mythical_weapon": "restricted",
    "rarity_legendary_weapon": "classified",
    "rarity_ancient_weapon": "covert",
    "rarity_ancient": "covert",
    "rarity_contraband_weapon": "contraband",
}
BASE = {
    "consumer": 1.2, "industrial": 3.5, "milspec": 12, "restricted": 55,
    "classified": 240, "covert": 950, "contraband": 60000,
}
WEAPON_MULT = {
    "AK-47": 2.3, "AWP": 2.6, "M4A4": 1.8, "M4A1-S": 1.9, "Desert Eagle": 1.5,
    "USP-S": 1.5, "Glock-18": 1.4, "P250": 0.8, "Five-SeveN": 0.85, "Tec-9": 0.8,
    "MAC-10": 0.85, "MP9": 0.85, "Negev": 0.6, "M249": 0.6, "Sawed-Off": 0.6,
    "PP-Bizon": 0.6, "P90": 0.9, "Nova": 0.6, "MAG-7": 0.6, "XM1014": 0.7,
    "SG 553": 0.7, "G3SG1": 0.6, "SCAR-20": 0.6, "Galil AR": 0.8, "FAMAS": 0.8,
    # ножи
    "Karambit": 2.1, "Butterfly Knife": 2.3, "M9 Bayonet": 1.8, "Bayonet": 1.25,
    "Talon Knife": 1.6, "Skeleton Knife": 1.8, "Flip Knife": 0.9, "Gut Knife": 0.55,
    "Navaja Knife": 0.45, "Shadow Daggers": 0.5, "Falchion Knife": 0.65,
    "Bowie Knife": 0.7, "Huntsman Knife": 0.8, "Ursus Knife": 0.85,
    "Stiletto Knife": 1.05, "Paracord Knife": 0.75, "Survival Knife": 0.7,
    "Nomad Knife": 1.05, "Classic Knife": 1.15, "Kukri Knife": 1.0,
    # перчатки
    "Sport Gloves": 1.7, "Specialist Gloves": 1.35, "Driver Gloves": 1.0,
    "Moto Gloves": 1.0, "Hand Wraps": 0.8, "Bloodhound Gloves": 0.9,
    "Hydra Gloves": 0.85, "Broken Fang Gloves": 0.85,
}
PATTERN_MULT = [
    ("Fire Serpent", 3.0), ("Asiimov", 2.0), ("Vulcan", 2.0), ("Howl", 1.0),
    ("Dragon Lore", 25), ("Medusa", 8), ("Gungnir", 10), ("Wild Lotus", 8),
    ("Lore", 2.0), ("Marble Fade", 1.7), ("Fade", 1.8), ("Doppler", 1.5),
    ("Crimson Web", 1.5), ("Tiger Tooth", 1.3), ("Slaughter", 1.3),
    ("Case Hardened", 1.35), ("Hyper Beast", 1.3), ("Neo-Noir", 1.3),
    ("Printstream", 1.8), ("Bloodsport", 1.4), ("Fever Dream", 1.2),
    ("Pandora's Box", 1.8), ("Vice", 1.6), ("Kimono", 1.4),
]
PHASE_MULT = {"Ruby": 6, "Sapphire": 7, "Black Pearl": 5, "Emerald": 6}

# Шансы по редкости в официальных кейсах (как в игре)
OFFICIAL_ODDS = {
    "milspec": 0.7992, "restricted": 0.1598, "classified": 0.032,
    "covert": 0.0064, "gold": 0.0026,
}
OFFICIAL_RTP = 0.90
CUSTOM_RTP = 0.92


def load(name, src_dir):
    if src_dir:
        with open(os.path.join(src_dir, name), encoding="utf-8") as f:
            return json.load(f)
    with urllib.request.urlopen(API + name) as r:
        return json.load(r)


def hfactor(key, lo, hi):
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h


def wear_range(mn, mx):
    lo = next(i for i, b in enumerate(WEAR_BOUNDS) if mn < b)
    hi = next(i for i, b in enumerate(WEAR_BOUNDS) if mx <= b or i == 4)
    return lo, hi


def expected_wear_mult(mn, mx):
    # износ равномерно распределён в [mn, mx]
    if mx <= mn:
        return WEAR_MULT[wear_range(mn, mx)[0]]
    total, prev = 0.0, 0.0
    for i, b in enumerate(WEAR_BOUNDS):
        a, c = max(prev, mn), min(b, mx)
        if c > a:
            total += (c - a) * WEAR_MULT[i]
        prev = b
    return total / (mx - mn)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    skins_raw = load("skins.json", src)
    crates_raw = load("crates.json", src)

    skins = {}
    meta = {}
    for s in skins_raw:
        if s["category"]["name"] == "Equipment" or not s.get("image"):
            continue
        name = s["name"]
        star = name.startswith("★")
        weapon = s["weapon"]["name"]
        pattern = (s.get("pattern") or {}).get("name") or "Vanilla"
        if "|" not in name:
            pattern = "Vanilla"
        phase = s.get("phase") or ""
        rarity = "gold" if star else RARITY.get(s["rarity"]["id"], "milspec")
        if star:
            base = 14000 if s["category"]["name"] == "Knives" else 9000
            if pattern == "Vanilla":
                base *= 0.8
        else:
            base = BASE[RARITY.get(s["rarity"]["id"], "milspec")]
        price = base * WEAPON_MULT.get(weapon, 1.0)
        for key, m in PATTERN_MULT:
            if key in pattern:
                price *= m
                break
        price *= PHASE_MULT.get(phase, 1.0)
        price *= hfactor(s["id"], 0.55, 1.6)
        mn = s.get("min_float") or 0.0
        mx = s.get("max_float") if s.get("max_float") is not None else 1.0
        wlo, whi = wear_range(mn, mx)
        img = s["image"]
        if img.startswith(IMG_PREFIX):
            img = img[len(IMG_PREFIX):]
        st = 1 if s.get("stattrak") else 0
        skins[s["id"]] = [
            weapon, pattern, rarity, img, s["category"]["name"],
            round(mn, 3), round(mx, 3), st, round(price, 2), phase,
        ]
        ev = price * expected_wear_mult(mn, mx) * (1 + ST_CHANCE * (ST_MULT - 1) * st)
        meta[s["id"]] = {"ev": ev, "price": price, "weapon": weapon,
                         "rarity": rarity, "pattern": pattern, "phase": phase,
                         "cat": s["category"]["name"], "wlo": wlo, "whi": whi}

    cases = []

    # ---------- официальные кейсы ----------
    official = [c for c in crates_raw if c.get("type") == "Case"]
    official.sort(key=lambda c: c.get("first_sale_date") or "", reverse=True)
    for c in official:
        ids = [i["id"] for i in c["contains"] if i["id"] in skins]
        rare = [i["id"] for i in c.get("contains_rare", []) if i["id"] in skins]
        groups = {}
        for i in ids:
            groups.setdefault(meta[i]["rarity"], []).append(i)
        if rare:
            groups["gold"] = rare
        odds = {k: v for k, v in OFFICIAL_ODDS.items() if k in groups}
        norm = sum(odds.values())
        items, ev = [], 0.0
        for r, p in odds.items():
            for i in groups[r]:
                w = p / norm / len(groups[r])
                items.append([i, round(w * 1e6)])
                ev += w * meta[i]["ev"]
        img = c["image"]
        if img.startswith(IMG_PREFIX):
            img = img[len(IMG_PREFIX):]
        cases.append({
            "id": c["id"].replace("crate-", "c"), "name": c["name"].replace(" Weapon Case", "").replace(" Case", ""),
            "img": img, "group": "official", "price": nice_price(ev / OFFICIAL_RTP),
            "items": items,
        })

    # ---------- авторские кейсы ----------
    def pick(pred, limit=None, spread=True):
        pool = sorted((i for i in skins if pred(meta[i])), key=lambda i: meta[i]["ev"])
        if limit and len(pool) > limit:
            if spread:
                step = (len(pool) - 1) / (limit - 1)
                pool = [pool[round(k * step)] for k in range(limit)]
            else:
                pool = pool[:limit]
        return pool

    def custom(cid, name, color, cover_pred, item_ids, power=1.0, rtp=CUSTOM_RTP, group="popular"):
        item_ids = list(dict.fromkeys(item_ids))
        ws = [1.0 / (meta[i]["ev"] ** power) for i in item_ids]
        tot = sum(ws)
        ev = sum(w / tot * meta[i]["ev"] for w, i in zip(ws, item_ids))
        cover = max((i for i in item_ids if cover_pred(meta[i])), key=lambda i: meta[i]["ev"],
                    default=max(item_ids, key=lambda i: meta[i]["ev"]))
        cases.append({
            "id": cid, "name": name, "cover": cover, "color": color, "group": group,
            "price": nice_price(ev / rtp),
            "items": [[i, max(1, round(w / tot * 1e6))] for w, i in zip(ws, item_ids)],
        })

    def is_w(*names):
        return lambda m: m["weapon"] in names

    def not_gold(m):
        return m["rarity"] != "gold"

    custom("bomzh", "Бомж", "#7a8699", lambda m: True,
           pick(lambda m: m["rarity"] in ("consumer", "industrial"), 14)
           + pick(lambda m: m["rarity"] == "milspec" and m["weapon"] in ("AK-47", "AWP"), 2), power=1.2)
    custom("novice", "Новичок", "#5e98d9", lambda m: True,
           pick(lambda m: m["rarity"] in ("industrial", "milspec"), 12)
           + pick(lambda m: m["rarity"] == "restricted", 3)
           + pick(lambda m: m["rarity"] == "classified", 1, spread=False), power=1.1)
    custom("pistols", "Пистолеты", "#4b69ff", lambda m: True,
           pick(lambda m: m["cat"] == "Pistols" and m["rarity"] not in ("consumer",), 16), power=1.0)
    custom("ak47", "АК-47", "#d32ce6", lambda m: True,
           pick(is_w("AK-47"), 18), power=0.95)
    custom("awp", "AWP", "#00b4a6", lambda m: True,
           pick(is_w("AWP"), 18), power=0.95)
    custom("m4", "M4 Мастер", "#3a7bd5", lambda m: True,
           pick(is_w("M4A4", "M4A1-S"), 18), power=0.95)
    custom("deagle", "Дигл", "#c9a227", lambda m: True,
           pick(is_w("Desert Eagle"), 14), power=0.95)
    custom("red", "Красный", "#eb4b4b", lambda m: True,
           pick(lambda m: m["rarity"] == "covert" and m["cat"] != "Gloves", 18), power=0.9)
    custom("fifty", "50/50", "#8847ff", lambda m: True,
           pick(lambda m: m["rarity"] == "classified", 6, spread=False)
           + pick(lambda m: m["rarity"] == "covert" and m["weapon"] in ("AK-47", "AWP"), 6), power=0.6)

    gloves = pick(lambda m: m["cat"] == "Gloves", 14)
    custom("gloves", "Перчатки", "#e4ae39", lambda m: m["cat"] == "Gloves",
           gloves + pick(lambda m: m["rarity"] == "classified", 6), power=0.9)
    knives = pick(lambda m: m["cat"] == "Knives" and m["pattern"] == "Vanilla", 12)
    custom("knife", "Ножевой", "#e4ae39", lambda m: m["cat"] == "Knives",
           knives + pick(lambda m: m["rarity"] == "covert" and m["cat"] != "Gloves", 8), power=0.9)
    custom("karambit", "Керамбит", "#e4ae39", lambda m: m["weapon"] == "Karambit",
           pick(is_w("Karambit"), 12) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 8), power=0.85,
           group="elite")
    custom("butterfly", "Бабочка", "#e4ae39", lambda m: m["weapon"] == "Butterfly Knife",
           pick(is_w("Butterfly Knife"), 12) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 8),
           power=0.85, group="elite")
    custom("doppler", "Допплер", "#ff4fd8", lambda m: "Doppler" in m["pattern"],
           pick(lambda m: "Doppler" in m["pattern"], 16) + pick(lambda m: m["rarity"] == "classified", 6),
           power=0.85, group="elite")
    custom("fade", "Фейд", "#ff9a3c", lambda m: m["pattern"] == "Fade",
           pick(lambda m: "Fade" in m["pattern"], 16) + pick(lambda m: m["rarity"] == "restricted", 6),
           power=0.9, group="elite")
    custom("elite", "Элитный", "#ffd700", lambda m: True,
           pick(lambda m: m["rarity"] == "gold" and m["ev"] > 30000, 10)
           + pick(lambda m: m["rarity"] == "covert" and not_gold(m) and m["ev"] > 2500, 8), power=0.8,
           group="elite")
    custom("asiimov", "Асимов", "#ff7a00", lambda m: "Asiimov" in m["pattern"],
           pick(lambda m: "Asiimov" in m["pattern"], 12) + pick(lambda m: m["rarity"] == "restricted", 6),
           power=0.95)
    custom("hyper", "Хайп", "#00e0ff", lambda m: True,
           pick(lambda m: any(k in m["pattern"] for k in ("Hyper Beast", "Neo-Noir", "Printstream",
                                                          "Bloodsport", "Vulcan", "Fire Serpent")), 16),
           power=0.95)

    data = {"img": IMG_PREFIX, "skins": skins, "cases": cases}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Сгенерировано scripts/build_data.py — не редактируйте вручную. */\n")
        f.write("window.DB=")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"skins: {len(skins)}, cases: {len(cases)}, size: {os.path.getsize(OUT) // 1024} KB")
    for c in cases:
        print(f"  {c['name']:<28} {c['price']:>10} ({len(c['items'])} items)")


def nice_price(p):
    if p < 10:
        return round(p, 1)
    if p < 100:
        return float(round(p))
    if p < 1000:
        return float(round(p / 5) * 5)
    return float(round(p / 10) * 10)


if __name__ == "__main__":
    main()
