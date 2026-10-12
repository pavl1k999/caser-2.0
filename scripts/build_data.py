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


# Серии авторских кейсов (порядок = порядок на главной)
SERIES = [
    {"id": "elements", "name": "Стихии", "desc": "Огонь, лёд, яд, гроза и океан", "emblem": "flame", "color": "#ff6a00"},
    {"id": "myths", "name": "Мифы", "desc": "Драконы, фениксы и морские чудовища", "emblem": "dragon", "color": "#c084fc"},
    {"id": "space", "name": "Космос", "desc": "Луна, галактика и ракеты", "emblem": "rocket", "color": "#60a5fa"},
    {"id": "street", "name": "Улицы", "desc": "Граффити, маски и хищники", "emblem": "spray", "color": "#ff3d81"},
    {"id": "neon", "name": "Неон", "desc": "Кибер, аркада и неоновый свет", "emblem": "bolt", "color": "#22d3ee"},
    {"id": "status", "name": "Статус", "desc": "От бомжа до олигарха — кейсы по бюджету", "emblem": "money", "color": "#ffd23f"},
    {"id": "weapons", "name": "Оружие", "desc": "АК, AWP, M4, пистолеты, ножи и перчатки", "emblem": "crosshair", "color": "#ef4444"},
    {"id": "premium", "name": "Премиум", "desc": "Керамбиты, бабочки, допплеры", "emblem": "crown", "color": "#ffd700"},
    {"id": "special", "name": "Особые", "desc": "Лотерея, честный 50/50 и равные шансы", "emblem": "dice", "color": "#2fd27a"},
]
SERIES_ID = {s["name"]: s["id"] for s in SERIES}
SERIES_ID.update({s["id"]: s["id"] for s in SERIES})

try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from themes import THEMES, match as theme_match, match_gold as theme_match_gold  # noqa: E402
except ImportError:
    THEMES = []


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
        meta[s["id"]] = {"ev": ev, "price": round(price, 2), "weapon": weapon,
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
            if spread and limit > 1:
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

    def with_theme(base, theme, series, tag):
        base["theme"] = {k: theme[k] for k in ("colors", "style", "emblem") if k in theme}
        if series:
            base["series"] = series
        if tag:
            base["tag"] = tag
        return base

    def custom(cid, name, item_ids, theme, series=None, power=POWER, rtp=RTP_STANDARD, tag=None):
        variants = fixed(item_ids)
        price = nice_price(power_ev(variants, power) / rtp)
        tickets, k = solve_power(variants, price, rtp)
        add_case(with_theme({"id": cid, "name": name, "cover": cover_of(variants, lambda m: True),
                             "group": "custom", "price": price}, theme, series, tag), variants, tickets, k)

    def two_groups(cid, name, theme, low_ids, high_ids, rtp, mode, high_share=None, tag=None):
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
        add_case(with_theme({"id": cid, "name": name, "cover": cover_of(hi_v, lambda m: True),
                             "group": "custom", "price": price}, theme, "special", tag), lo_v + hi_v, tickets, None, mode)

    def joker(cid, name, theme, item_ids, rtp=RTP_STANDARD, tag=None):
        """Джокер (как у Key-Drop): у всех предметов одинаковый шанс, цена = средний дроп / RTP."""
        variants = fixed(item_ids)
        ps = [vprice(v) for v in variants]
        price = nice_price(sum(ps) / len(ps) / rtp)
        add_case(with_theme({"id": cid, "name": name, "cover": cover_of(variants, lambda m: True),
                             "group": "custom", "price": price}, theme, "special", tag),
                 variants, to_tickets([1] * len(variants)), None, "joker")

    # ценовые полосы (по ожидаемой цене скина), чтобы кейсы одной серии стоили по-разному
    TIER_BAND = {"cheap": (0.2, 250), "mid": (1.5, 1200), "high": (8, 4000), "elite": (40, 20000)}
    # лестница «Статус»: свой диапазон цен и число ножей на каждой ступени
    STATUS = {
        "Бомж": ((0.2, 25), 0), "Студент": ((0.8, 120), 0), "Работяга": ((2.5, 450), 1),
        "Бизнесмен": ((6, 1400), 1), "Мажор": ((70, 6000), 3), "Олигарх": ((250, 30000), 6),
    }

    def themed(t):
        """Кейс серии из scripts/themes.py: скины по ключевым словам паттерна, сверху — ножи/перчатки-джекпот."""
        t = dict(t)
        if t["name"] in STATUS:
            t["band"], t["gold"] = STATUS[t["name"]]
            t.pop("price", None)
            t["patterns"] = []
        elif not t.get("price") and not t.get("cats") and t.get("tier") in TIER_BAND:
            # только нижняя граница: дешёвый мусор отсекаем, а топовые призы (Dragon Lore и т.п.) остаются
            t["band"] = (TIER_BAND[t["tier"]][0], float("inf"))
        band = t.get("band")

        def ok(m):
            return theme_match(t, m) and (not band or band[0] <= m["ev"] <= band[1])
        size = t.get("size", 36)
        ids = pick(ok, size)
        if band and len(ids) < min(size, 32) and t["name"] not in STATUS:
            band = None  # узкая тема: ценовая полоса оставила бы слишком мало скинов
            ids = pick(ok, size)
        if len(ids) < size and t.get("fill"):
            # добор обычными скинами тех же редкостей и ценового диапазона
            rs = {meta[i]["rarity"] for i in ids} or {"milspec", "restricted", "classified"}
            lo = min((meta[i]["ev"] for i in ids), default=0)
            hi = max((meta[i]["ev"] for i in ids), default=1e9)
            extra = pick(lambda m: m["rarity"] in rs and lo <= m["ev"] <= hi, size * 3)
            ids = list(dict.fromkeys(ids + extra))[:size]
        if t.get("gold"):
            gold = pick(lambda m: theme_match_gold(t, m) and m["ev"] < 60000, t["gold"])
            if len(gold) < t["gold"]:
                gold += pick(lambda m: m["rarity"] == "gold" and m["pattern"] == "Vanilla", t["gold"] - len(gold))
            ids = list(dict.fromkeys(ids + gold))
        only_gold = "gold" in (t.get("rarities") or [])
        rtp = RTP_KNIFE if only_gold or t.get("tier") == "elite" else RTP_STANDARD
        custom(t["id"], t["name"], ids, t, series=SERIES_ID.get(t.get("series"), "other"), rtp=rtp, tag=t.get("tag"))

    def is_w(*names):
        return lambda m: m["weapon"] in names

    def not_gold(m):
        return m["rarity"] != "gold"

    def free_case(cid, name, theme, item_ids, level, value):
        """Бесплатный кейс раз в сутки с N уровня (как у Hellcase): RTP не нужен, задаём средний дроп."""
        variants = fixed(item_ids)
        tickets, k = solve_power(variants, value, 1.0)
        add_case(with_theme({"id": cid, "name": name, "cover": cover_of(variants, lambda m: True),
                             "group": "free", "price": 0, "level": level, "value": value}, theme, None, None),
                 variants, tickets, k, "free")
        c = cases[-1]
        c["rtp"] = 0
        c["payback"] = 0

    # ---------- серии авторских кейсов ----------
    TAGS = {"fire": "hot", "dragon": "hot", "awp": "hot", "bomzh": "hot", "cyber": "new", "kraken": "new", "galaxy": "new", "oligarch": "new"}
    for t in THEMES:
        themed({**t, "tag": t.get("tag") or TAGS.get(t["id"])})

    # Премиум: ножи, перчатки, редкие паттерны
    def prem(cid, name, emblem, colors, style, ids, rtp=RTP_KNIFE, tag=None):
        custom(cid, name, ids, theme={"colors": colors, "style": style, "emblem": emblem}, series="premium", rtp=rtp, tag=tag)

    prem("red", "Красная линия", "bolt", ["#d81e2c", "#4a0710", "#ff8a8a"], "military",
         pick(lambda m: m["rarity"] == "covert" and m["cat"] != "Gloves" and not_gold(m), 30)
         + pick(lambda m: m["rarity"] == "classified", 6, spread=False), rtp=RTP_STANDARD)
    prem("karambit", "Керамбит", "knife", ["#b45309", "#3b1a03", "#fde68a"], "lux",
         pick(is_w("Karambit"), 16) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 16), tag="hot")
    prem("butterfly", "Бабочка", "butterfly", ["#9333ea", "#2e0b52", "#f0abfc"], "lux",
         pick(is_w("Butterfly Knife"), 16) + pick(lambda m: m["rarity"] == "covert" and not_gold(m), 16))
    prem("doppler", "Допплер", "diamond", ["#db2777", "#4c0626", "#f9a8d4"], "neon",
         pick(lambda m: "Doppler" in m["pattern"], 24) + pick(lambda m: m["rarity"] == "classified", 10))
    prem("fade", "Градиент", "sun", ["#f97316", "#5b1d02", "#fde047"], "graffiti",
         pick(lambda m: "Fade" in m["pattern"], 22) + pick(lambda m: m["rarity"] == "restricted", 12), rtp=RTP_STANDARD)
    prem("elite", "Элитный", "crown", ["#1f1f24", "#050506", "#f5c542"], "lux",
         pick(lambda m: m["rarity"] == "gold" and m["ev"] > 30000, 16)
         + pick(lambda m: m["rarity"] == "covert" and not_gold(m) and m["ev"] > 2500, 14))

    # Особые: лотерея, честный 50/50, равные шансы
    two_groups("fifty", "50/50", {"colors": ["#4f46e5", "#1e1b4b", "#a5b4fc"], "style": "arcade", "emblem": "spade"},
               pick(lambda m: m["rarity"] == "classified" and 150 < m["price"] < 260, 4),
               pick(lambda m: m["rarity"] == "covert" and not_gold(m) and 450 < m["price"] < 700, 4),
               RTP_STANDARD, "fifty", high_share=0.5)
    two_groups("lottery", "1% Нож", {"colors": ["#eab308", "#422006", "#fef08a"], "style": "graffiti", "emblem": "dice"},
               pick(lambda m: m["rarity"] in ("industrial", "milspec") and 2 < m["price"] < 30, 14),
               pick(lambda m: m["cat"] == "Knives" and m["pattern"] == "Vanilla", 4, spread=False),
               RTP_LOTTERY, "lottery", tag="hot")
    joker("joker", "Джокер", {"colors": ["#16a34a", "#052e16", "#86efac"], "style": "arcade", "emblem": "mask"},
          pick(lambda m: m["weapon"] == "AK-47" and m["price"] < 1500, 16))

    # Бесплатные раз в сутки по уровням
    free_case("free1", "Ежедневный", {"colors": ["#16a34a", "#052e16", "#bbf7d0"], "style": "military", "emblem": "egg"},
              pick(lambda m: m["rarity"] in ("consumer", "industrial", "milspec") and m["price"] < 60, 22)
              + pick(lambda m: m["weapon"] == "AK-47" and m["rarity"] == "classified", 1, spread=False), 2, 6)
    free_case("free2", "Бронзовый", {"colors": ["#b45309", "#3b1a03", "#fdba74"], "style": "military", "emblem": "shield"},
              pick(lambda m: m["rarity"] in ("milspec", "restricted") and m["price"] < 300, 22)
              + pick(lambda m: m["weapon"] == "AWP" and m["rarity"] == "covert", 1, spread=False), 10, 25)
    free_case("free3", "Золотой", {"colors": ["#ca8a04", "#3f2a00", "#fef08a"], "style": "lux", "emblem": "crown"},
              pick(lambda m: m["rarity"] in ("restricted", "classified") and m["price"] < 900, 22)
              + pick(lambda m: m["cat"] == "Knives" and m["pattern"] == "Vanilla", 1, spread=False), 20, 90)

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
    used = {c.get("series") for c in cases}
    data = {"img": IMG_PREFIX, "skins": skins, "series": [x for x in SERIES if x["id"] in used], "cases": cases}
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
