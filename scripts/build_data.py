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
# по медианам цен Hellcase относительно Field-Tested (выгрузка 273 кейсов, 2025)
WEAR_MULT = [2.8, 1.5, 1.0, 0.94, 0.89]
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
# RTP (средний дроп / цена кейса) — как у конкурентов:
# Hellcase: медиана 0.88 почти во всех ценовых категориях; Skin.club: ножевые кейсы ровно 0.90.
RTP_STANDARD = 0.88
RTP_KNIFE = 0.90
RTP_LOTTERY = 0.87
GOLD_IN_OFFICIAL = 6
# шанс строки ∝ цена^-POWER: медианный наклон log(шанс)/log(цена) в кейсах Hellcase ≈ −1.19
POWER = 1.2  # сколько ножей/перчаток оставлять в копиях официальных кейсов


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


TICKETS = 100000


def to_tickets(probs, min_one=True):
    """Вероятности → целые билеты (сумма ровно 100 000). min_one: каждому минимум 1 билет."""
    total = sum(probs)
    raw = [p / total * TICKETS for p in probs]
    t = [max(1 if min_one else 0, int(r)) for r in raw]
    rest = TICKETS - sum(t)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - int(raw[i]), reverse=True)
    i = 0
    while rest > 0:
        t[order[i % len(order)]] += 1
        rest -= 1
        i += 1
    while rest < 0:  # из-за минимума в 1 билет могли перебрать — снимаем с самых крупных
        j = max(range(len(t)), key=lambda k: t[k])
        t[j] -= 1
        rest += 1
    return t


def fixed_wear(sid, wlo, whi):
    """Износ предмета в авторском кейсе: как у конкурентов, каждый слот — конкретный экстерьер."""
    avail = list(range(wlo, whi + 1))
    pref = [w for w in avail if w in (1, 2)] or avail
    return pref[int(hashlib.md5((sid + "w").encode()).hexdigest()[:6], 16) % len(pref)]


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

    def vprice(v):
        sid, wear, st = v
        return round(meta[sid]["price"] * WEAR_MULT[wear] * (ST_MULT if st else 1), 2)

    def pack(variants, tickets):
        """[(sid, wear, st)], [билеты] → [[sid, [[wear, st, билеты], ...]], ...] без нулевых строк."""
        out, idx = [], {}
        for (sid, wear, st), t in zip(variants, tickets):
            if t <= 0:
                continue
            if sid not in idx:
                idx[sid] = len(out)
                out.append([sid, []])
            out[idx[sid]][1].append([wear, 1 if st else 0, t])
        return out

    def stats(variants, tickets, price):
        ps = [vprice(v) for v in variants]
        ev = sum(t / TICKETS * p for t, p in zip(tickets, ps))
        payback = sum(t for t, p in zip(tickets, ps) if p >= price) / TICKETS
        top = max(p for t, p in zip(tickets, ps) if t > 0)
        return ev, payback, top

    def power_ev(variants, power):
        ps = [vprice(v) for v in variants]
        w = [p ** -power for p in ps]
        return sum(x / sum(w) * p for x, p in zip(w, ps))

    def solve_power(variants, price, rtp):
        """Шанс строки ∝ цена^-k; k подбирается бинарным поиском под точный RTP (как CaseForge / Hellcase)."""
        ps = [vprice(v) for v in variants]

        def at(k):
            t = to_tickets([p ** -k for p in ps], min_one=False)
            return t, sum(tt / TICKETS * p for tt, p in zip(t, ps))
        target = rtp * price
        lo, hi = 0.0, 8.0
        if at(lo)[1] < target:
            print(f"    ! RTP {rtp} недостижим, беру k=0")
            return at(lo)[0], 0.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if at(mid)[1] > target:
                lo = mid
            else:
                hi = mid
        return at((lo + hi) / 2)[0], (lo + hi) / 2

    def add_case(base, variants, tickets, k=None, mode="power"):
        ev, payback, top = stats(variants, tickets, base["price"] or float("inf"))
        base.update({
            "rtp": round(ev / base["price"], 4) if base["price"] else 0, "payback": round(payback, 4), "mode": mode,
            "items": pack(variants, tickets),
        })
        cases.append(base)
        base["_k"] = k
        base["_top"] = top

    # ---------- копии официальных кейсов (перенастроены, как это делает Hellcase) ----------
    official = [c for c in crates_raw if c.get("type") == "Case"]
    official.sort(key=lambda c: c.get("first_sale_date") or "", reverse=True)
    for c in official:
        ids = [i["id"] for i in c["contains"] if i["id"] in skins]
        rare = sorted({i["id"] for i in c.get("contains_rare", []) if i["id"] in skins}, key=lambda i: meta[i]["price"])
        if len(rare) > GOLD_IN_OFFICIAL:
            step = (len(rare) - 1) / (GOLD_IN_OFFICIAL - 1)
            rare = [rare[round(j * step)] for j in range(GOLD_IN_OFFICIAL)]
        # строки: каждый износ отдельно, StatTrak — отдельные строки (у ножей в копиях без StatTrak)
        variants = []
        for i in ids + rare:
            m = meta[i]
            for w in range(m["wlo"], m["whi"] + 1):
                variants.append((i, w, False))
                if skins[i][7] and m["rarity"] != "gold":
                    variants.append((i, w, True))
        # цена — из типичной для Hellcase крутизны шансов (цена^-1.2), затем точная подгонка под RTP
        price = nice_price(power_ev(variants, POWER) / RTP_STANDARD)
        tickets, k = solve_power(variants, price, RTP_STANDARD)
        img = c["image"]
        if img.startswith(IMG_PREFIX):
            img = img[len(IMG_PREFIX):]
        add_case({
            "id": c["id"].replace("crate-", "c"), "name": c["name"].replace(" Weapon Case", "").replace(" Case", ""),
            "img": img, "group": "official", "price": price,
        }, variants, tickets, k)

    # ---------- авторские кейсы: каждый слот — конкретный экстерьер (как Skin.club / Key-Drop) ----------
    def pick(pred, limit=None, spread=True):
        pool = sorted((i for i in skins if pred(meta[i])), key=lambda i: meta[i]["ev"])
        if limit and len(pool) > limit:
            if spread:
                step = (len(pool) - 1) / (limit - 1)
                pool = [pool[round(k * step)] for k in range(limit)]
            else:
                pool = pool[:limit]
        return pool

    def fixed(ids):
        ids = list(dict.fromkeys(ids))
        return [(i, fixed_wear(i, meta[i]["wlo"], meta[i]["whi"]), False) for i in ids]

    def cover_of(variants, cover_pred):
        cand = [v for v in variants if cover_pred(meta[v[0]])] or variants
        return max(cand, key=vprice)[0]

    def custom(cid, name, color, cover_pred, item_ids, power=POWER, rtp=RTP_STANDARD, group="popular"):
        variants = fixed(item_ids)
        price = nice_price(power_ev(variants, power) / rtp)
        tickets, k = solve_power(variants, price, rtp)
        add_case({"id": cid, "name": name, "cover": cover_of(variants, cover_pred), "color": color,
                  "group": group, "price": price}, variants, tickets, k)

    def two_groups(cid, name, color, cover_pred, low_ids, high_ids, rtp, group, mode, high_share=None):
        """Лотерея / 50 на 50: доля дорогой группы решается под точный RTP, внутри групп шанс ∝ 1/цена."""
        lo_v, hi_v = fixed(low_ids), fixed(high_ids)

        def grp(vs):
            ps = [vprice(v) for v in vs]
            w = [1 / p for p in ps]
            return [x / sum(w) for x in w], sum(x / sum(w) * p for x, p in zip(w, ps))
        lw, J = grp(lo_v)
        hw, K = grp(hi_v)
        if high_share is not None:  # 50/50: честные 50% на дорогую группу, цена из RTP
            price = nice_price((J * (1 - high_share) + K * high_share) / rtp)
        else:  # лотерея: цена так, чтобы дорогие предметы стоили ~100 цен кейса
            price = nice_price(K / 100)
        q = (rtp * price - J) / (K - J)
        q = min(max(q, 0.0005), 0.95)
        tickets = to_tickets([(1 - q) * x for x in lw] + [q * x for x in hw])
        add_case({"id": cid, "name": name, "cover": cover_of(hi_v, cover_pred), "color": color,
                  "group": group, "price": price}, lo_v + hi_v, tickets, None, mode)

    def joker(cid, name, color, cover_pred, item_ids, rtp=RTP_STANDARD, group="popular"):
        """Джокер (как у Key-Drop): у всех предметов одинаковый шанс, цена = средний дроп / RTP."""
        variants = fixed(item_ids)
        ps = [vprice(v) for v in variants]
        price = nice_price(sum(ps) / len(ps) / rtp)
        add_case({"id": cid, "name": name, "cover": cover_of(variants, cover_pred), "color": color,
                  "group": group, "price": price}, variants, to_tickets([1] * len(variants)), None, "joker")

    def is_w(*names):
        return lambda m: m["weapon"] in names

    def not_gold(m):
        return m["rarity"] != "gold"

    custom("bomzh", "Бомж", "#7a8699", lambda m: True,
           pick(lambda m: m["rarity"] in ("consumer", "industrial"), 18)
           + pick(lambda m: m["rarity"] == "milspec" and m["weapon"] in ("AK-47", "AWP"), 2))
    custom("novice", "Новичок", "#5e98d9", lambda m: True,
           pick(lambda m: m["rarity"] in ("industrial", "milspec"), 14)
           + pick(lambda m: m["rarity"] == "restricted", 4)
           + pick(lambda m: m["rarity"] == "classified", 2, spread=False))
    custom("pistols", "Пистолеты", "#4b69ff", lambda m: True,
           pick(lambda m: m["cat"] == "Pistols" and m["rarity"] != "consumer", 18))
    custom("ak47", "АК-47", "#d32ce6", lambda m: True, pick(is_w("AK-47"), 18))
    custom("awp", "AWP", "#00b4a6", lambda m: True, pick(is_w("AWP"), 18))
    custom("m4", "M4 Мастер", "#3a7bd5", lambda m: True, pick(is_w("M4A4", "M4A1-S"), 18))
    custom("deagle", "Дигл", "#c9a227", lambda m: True, pick(is_w("Desert Eagle"), 14))
    custom("asiimov", "Асимов", "#ff7a00", lambda m: "Asiimov" in m["pattern"],
           pick(lambda m: "Asiimov" in m["pattern"], 12) + pick(lambda m: m["rarity"] == "restricted", 6))
    custom("red", "Красный", "#eb4b4b", lambda m: True,
           pick(lambda m: m["rarity"] == "covert" and m["cat"] != "Gloves", 18))
    custom("hyper", "Хайп", "#00e0ff", lambda m: True,
           pick(lambda m: any(k in m["pattern"] for k in ("Hyper Beast", "Neo-Noir", "Printstream",
                                                          "Bloodsport", "Vulcan", "Fire Serpent")), 16))
    two_groups("fifty", "50/50", "#8847ff", lambda m: True,
               pick(lambda m: m["rarity"] == "classified" and 150 < m["price"] < 260, 3),
               pick(lambda m: m["rarity"] == "covert" and not_gold(m) and 450 < m["price"] < 700, 3),
               RTP_STANDARD, "popular", "fifty", high_share=0.5)
    two_groups("lottery", "1% Нож", "#ffd23f", lambda m: m["cat"] == "Knives",
               pick(lambda m: m["rarity"] in ("industrial", "milspec") and 2 < m["price"] < 30, 8),
               pick(lambda m: m["cat"] == "Knives" and m["pattern"] == "Vanilla", 3, spread=False),
               RTP_LOTTERY, "popular", "lottery")
    joker("joker", "Джокер АК", "#00ffa3", lambda m: True,
          pick(lambda m: m["weapon"] == "AK-47" and m["price"] < 1500, 12))

    def free_case(cid, name, color, cover_pred, item_ids, level, value):
        """Бесплатный кейс раз в сутки с N уровня (как у Hellcase): RTP не нужен, задаём средний дроп."""
        variants = fixed(item_ids)
        tickets, k = solve_power(variants, value, 1.0)
        add_case({"id": cid, "name": name, "cover": cover_of(variants, cover_pred), "color": color,
                  "group": "free", "price": 0, "level": level, "value": value}, variants, tickets, k, "free")
        c = cases[-1]
        c["rtp"] = 0
        c["payback"] = 0

    free_case("free1", "Ежедневный", "#2fd27a", lambda m: True,
              pick(lambda m: m["rarity"] in ("consumer", "industrial", "milspec") and m["price"] < 60, 14)
              + pick(lambda m: m["weapon"] == "AK-47" and m["rarity"] == "classified", 1, spread=False), 2, 6)
    free_case("free2", "Бронзовый", "#cd7f32", lambda m: True,
              pick(lambda m: m["rarity"] in ("milspec", "restricted") and m["price"] < 300, 14)
              + pick(lambda m: m["weapon"] == "AWP" and m["rarity"] == "covert", 1, spread=False), 10, 25)
    free_case("free3", "Золотой", "#ffd700", lambda m: m["cat"] == "Knives",
              pick(lambda m: m["rarity"] in ("restricted", "classified") and m["price"] < 900, 14)
              + pick(lambda m: m["cat"] == "Knives" and m["pattern"] == "Vanilla", 1, spread=False), 20, 90)

    custom("gloves", "Перчатки", "#e4ae39", lambda m: m["cat"] == "Gloves",
           pick(lambda m: m["cat"] == "Gloves", 14) + pick(lambda m: m["rarity"] == "classified", 6),
           rtp=RTP_KNIFE, group="elite")
    custom("knife", "Ножевой", "#e4ae39", lambda m: m["cat"] == "Knives",
           pick(lambda m: m["cat"] == "Knives" and m["price"] < 40000, 16), rtp=RTP_KNIFE, group="elite")
    custom("karambit", "Керамбит", "#e4ae39", lambda m: m["weapon"] == "Karambit",
           pick(is_w("Karambit"), 12) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 8),
           rtp=RTP_KNIFE, group="elite")
    custom("butterfly", "Бабочка", "#e4ae39", lambda m: m["weapon"] == "Butterfly Knife",
           pick(is_w("Butterfly Knife"), 12) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 8),
           rtp=RTP_KNIFE, group="elite")
    custom("doppler", "Допплер", "#ff4fd8", lambda m: "Doppler" in m["pattern"],
           pick(lambda m: "Doppler" in m["pattern"], 16) + pick(lambda m: m["rarity"] == "classified", 6),
           rtp=RTP_KNIFE, group="elite")
    custom("fade", "Фейд", "#ff9a3c", lambda m: m["pattern"] == "Fade",
           pick(lambda m: "Fade" in m["pattern"], 16) + pick(lambda m: m["rarity"] == "restricted", 6),
           group="elite")
    custom("elite", "Элитный", "#ffd700", lambda m: True,
           pick(lambda m: m["rarity"] == "gold" and m["ev"] > 30000, 10)
           + pick(lambda m: m["rarity"] == "covert" and not_gold(m) and m["ev"] > 2500, 8),
           rtp=RTP_KNIFE, group="elite")

    print(f"  {'кейс':<24}{'цена':>9}{'RTP':>8}{'окуп':>8}{'топ/цена':>9}{'k':>6}  предметов/строк")
    for c in cases:
        k = c.pop("_k")
        top = c.pop("_top")
        rows = sum(len(v) for _, v in c["items"])
        ref = c["price"] or c.get("value", 1)
        print(f"  {c['name']:<24}{c['price'] or 'free':>9}{c['rtp'] * 100:>7.1f}%{c['payback'] * 100:>7.1f}%"
              f"{top / ref:>8.0f}x{(f'{k:.2f}' if k is not None else c['mode']):>7}  {len(c['items'])}/{rows}")

    for c in cases:
        total = sum(t for _, vs in c["items"] for _, _, t in vs)
        assert total == TICKETS, f"{c['name']}: {total} билетов вместо {TICKETS}"
    data = {"img": IMG_PREFIX, "skins": skins, "cases": cases}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Сгенерировано scripts/build_data.py — не редактируйте вручную. */\n")
        f.write("window.DB=")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"skins: {len(skins)}, cases: {len(cases)}, size: {os.path.getsize(OUT) // 1024} KB")



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
