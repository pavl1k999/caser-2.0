"""Авторские кейсы сайта: тематические подборки скинов.

Каждая тема — словарь:
    id            уникальный id кейса
    name          название (рус.)
    series        серия на витрине (Стихии, Мифы, Космос, Улицы, Неон, Статус, Оружие)
    emblem        имя иконки-эмблемы для обложки кейса
    style         оформление обложки: military | neon | graffiti | lux | tech | arcade
    colors        [основной, тёмный, акцент] — hex
    patterns      подстроки (без учёта регистра) для pattern.name; [] — без фильтра по паттерну
    exclude       (необяз.) подстроки, которые выкидывают совпадение (ложные срабатывания)
    weapons       (необяз.) только эти weapon.name
    cats          (необяз.) только эти category.name (Knives, Gloves, Pistols, ...)
    rarities      (необяз.) только эти редкости (consumer … covert, gold, contraband).
                  ★-предметы (gold) и контрабанда попадают в основной пул ТОЛЬКО если
                  указаны здесь явно — иначе они всегда исключаются.
    price         (необяз.) [min, max] по meta["price"] (базовая цена из build_data), None — без границы
    gold          сколько ножей/перчаток добавить сверху как джекпот (0–6)
    gold_patterns (необяз.) подстроки для выбора этих ножей/перчаток; проверяются по
                  "<pattern> <phase>", т.е. можно указать фазу ("Ruby", "Sapphire", "Emerald")
    size          сколько скинов (без джекпота) должно быть в кейсе
    tier          ценовой ориентир: cheap | mid | high | elite
    fill          (необяз.) True — тема узкая, сборщик может добрать до size обычными
                  скинами похожей редкости

Фильтрация — функции match() / match_gold() ниже; сборщик и проверка
(scratchpad/themes-check.py) пользуются ими же, чтобы результат совпадал.
"""

KNIFE_GOLD = ["Fade", "Doppler", "Tiger Tooth", "Slaughter", "Lore", "Crimson Web", "Case Hardened"]

THEMES = [
    # ------------------------------------------------------------------ Стихии
    {
        "id": "fire", "name": "Огонь", "series": "Стихии", "emblem": "flame", "style": "neon",
        "colors": ["#ff5a1f", "#3a0a00", "#ffd23f"],
        "patterns": ["Fire", "Blaze", "Flame", "Inferno", "Heat", "Magma", "Hot Rod", "Hot Shot",
                     "Hot Snakes", "Burner", "Hellfire", "Hellish", "Ticket to Hell", "Pyre", "Scorched",
                     "Searing", "Incinegator", "Meltdown", "Exothermic", "Sunbaked", "Ifrit", "Djinn"],
        "gold": 4, "gold_patterns": ["Fade", "Slaughter", "Blaze", "Charred", "Sunburst", "Ruby"],
        "size": 40, "tier": "mid",
    },
    {
        "id": "ice", "name": "Лёд", "series": "Стихии", "emblem": "snowflake", "style": "tech",
        "colors": ["#6fd3ff", "#06223a", "#e8fbff"],
        "patterns": ["Ice ", "Frost", "Snow", "Arctic", "Cold Cell", "Cold Fusion", "Stone Cold", "Glacier",
                     "Polar", "Blizzard", "Winter", "Sleet", "Avalanche", "Yeti", "Whiteout", "Coolant",
                     "Blue Steel", "Sky Blue", "Blue Titanium", "Blue Fissure", "Royal Blue", "Azure",
                     "Cobalt Quartz", "Silver", "Boreal", "Alpine", "Blue Spruce", "Shattered", "Cirrus"],
        "gold": 3, "gold_patterns": ["Blue Steel", "Bright Water", "Snow Leopard", "Cool Mint", "Spearmint",
                                     "Sapphire", "Damascus", "Cloud Chaser"],
        "size": 40, "tier": "cheap",
    },
    {
        "id": "poison", "name": "Яд", "series": "Стихии", "emblem": "biohazard", "style": "graffiti",
        "colors": ["#8dff2f", "#0f2a06", "#d4ff3a"],
        "patterns": ["Poison", "Toxic", "Acid", "Bioleak", "Radiation", "Irradiated", "Nuclear", "Contamina",
                     "Outbreak", "Virus", "Plague", "Mustard Gas", "Chemical", "Fallout", "Serum", "Goo",
                     "Arsenic", "Nightshade", "Lab Rats", "Containment", "Byproduct", "Reactor", "Fuel Rod",
                     "Core Breach", "Mummy's Rot", "Sleeping Potion", "Hexane", "Green Energy"],
        "gold": 3, "gold_patterns": ["Emerald", "Gamma Doppler", "Spearmint", "Lime Polycam", "Snakebite",
                                     "Jade", "Racing Green"],
        "size": 40, "tier": "mid",
    },
    {
        "id": "storm", "name": "Гроза", "series": "Стихии", "emblem": "bolt", "style": "tech",
        "colors": ["#7c6cff", "#110b33", "#fff35c"],
        "patterns": ["Storm", "Lightning", "Electric", "Tempest", "Tornado", "Statics", "Urban Shock", "Pulse",
                     "Flux", "Powercore", "Power Loader", "Gauss", "Oscillator", "Rain Station", "Bullet Rain",
                     "Windblown", "Faulty Wiring", "Lead Conduit", "Breaker Box", "Canvas Cloud",
                     "Thermal Currents", "Turbine"],
        "gold": 3, "gold_patterns": ["Superconductor", "Autotronic", "Ultraviolet", "Night Stripe",
                                     "Pandora's Box", "Omega"],
        "size": 40, "tier": "mid",
    },
    {
        "id": "ocean", "name": "Океан", "series": "Стихии", "emblem": "sun", "style": "neon",
        "colors": ["#00c2d1", "#032a35", "#ffd27a"],
        "patterns": ["Ocean", "Aqua", "Coral", "Reef", "Surf", "Splash", "Lionfish", "Whitefish", "Koi",
                     "Tropical", "Aloha", "Palm", "Pearl", "Nacre", "Marina", "Sea Calico", "Seabird", "Wave ",
                     "Waves", "Bright Water", "Hard Water", "Ripple", "Banana Leaf", "Turquoise", "Teal",
                     "Shipping Forecast"],
        "exclude": ["Snow Splash", "Splash Jam"],
        "gold": 3, "gold_patterns": ["Bright Water", "Wave Chaser", "Big Swell", "Amphibious", "Turtle",
                                     "Seigaiha", "Mangrove"],
        "size": 40, "tier": "cheap",
    },
    # -------------------------------------------------------------------- Мифы
    {
        "id": "dragon", "name": "Дракон", "series": "Мифы", "emblem": "dragon", "style": "lux",
        "colors": ["#e53935", "#2a0505", "#ffc93c"],
        "patterns": ["Dragon", "Wyrm", "Serpent", "Jörmungandr", "Hydra", "Basilisk", "Naga", "Xiangliu",
                     "Emphorosaur", "Firebreathing", "Irezumi", "Koi", "Carved Jade", "Mount Fuji", "Imperial",
                     "Kimono", "Sunset Storm", "Rising Sun", "Lunar Wyrm"],
        "exclude": ["Hydraulics"],
        "gold": 4, "gold_patterns": ["Lore", "Dragon Fists", "Tiger Tooth", "Jade", "Crimson Kimono",
                                     "Emerald Web", "Brocade"],
        "size": 35, "tier": "high",
    },
    {
        "id": "phoenix", "name": "Феникс", "series": "Мифы", "emblem": "phoenix", "style": "neon",
        "colors": ["#ff8a00", "#3b1200", "#ffe066"],
        "patterns": ["Phoenix", "Wing", "Feather", "Bird", "Plume", "Hawk", "Crane", "Fowl", "Icarus",
                     "Nevermore", "Circaetus", "Stymphalian", "Flock", "Daybreak", "Rising Sun", "Morning Sun",
                     "Setting Sun", "Sundown", "Angel", "Heaven Guard", "Guardian", "Sovereign Flame",
                     "Chantico", "Griffin", "Fire Elemental"],
        "gold": 3, "gold_patterns": ["Fade", "Brocade Crane", "Sunburst", "Slaughter", "Ruby", "Plum Quill",
                                     "Cloud Chaser"],
        "size": 38, "tier": "mid",
    },
    {
        "id": "poseidon", "name": "Посейдон", "series": "Мифы", "emblem": "trident", "style": "lux",
        "colors": ["#1e88e5", "#04173a", "#f4c542"],
        "patterns": ["Poseidon", "Tsunami", "Tempest", "Tide", "Undertow", "High Seas", "Naval", "Hydro Strike",
                     "Water Elemental", "Water Sigil", "Waters of", "Wave Breaker", "Aquamarine", "Oceanic",
                     "Ocean Topo", "Atlas", "Aphrodite", "Demeter", "Chronos", "Daedalus", "Labyrinth",
                     "Asterion", "Corinthian", "Triarch", "Triumvirate", "Nemesis", "Praetorian", "Royal"],
        "gold": 4, "gold_patterns": ["Sapphire", "Bright Water", "Big Swell", "Wave Chaser", "Seigaiha",
                                     "Blue Steel"],
        "size": 35, "tier": "high",
    },
    {
        "id": "medusa", "name": "Медуза", "series": "Мифы", "emblem": "snake", "style": "neon",
        "colors": ["#3fd17a", "#082517", "#c9a227"],
        "patterns": ["Medusa", "Snake", "Viper", "Cobra", "Dune Asp", "Python", "Snek", "Rattle", "Copperhead",
                     "Atheris", "Garter", "Golden Coil", "Basilisk", "Naga", "Apep", "Cold Blooded", "Gila",
                     "Anolis", "Stone", "Marbleized", "Serpent Strike", "Athena", "Deathgaze", "Hypno"],
        "gold": 3, "gold_patterns": ["King Snake", "Snakebite", "Diamondback", "Rattler", "Constrictor",
                                     "Marble Fade", "Emerald"],
        "size": 35, "tier": "high",
    },
    {
        "id": "kraken", "name": "Кракен", "series": "Мифы", "emblem": "wave", "style": "tech",
        "colors": ["#7b3ff2", "#0b0626", "#25e0c8"],
        "patterns": ["Kraken", "Abyss", "Deep Relief", "Submerged", "Last Dive", "Sonar", "Photic", "Dark Water",
                     "Blood in the Water", "Man-o", "Devourer", "Monster", "Creep", "Ensnared", "Grotto", "Murky",
                     "Worm God", "Hydra", "Naga", "Black Nile", "Undertow", "Currents"],
        "exclude": ["Hydraulics"],
        "gold": 3, "gold_patterns": ["Doppler", "Black Laminate", "Night", "Ultraviolet", "Big Swell",
                                     "Amphibious", "Constrictor"],
        "size": 32, "tier": "high",
    },
    # ------------------------------------------------------------------ Космос
    {
        "id": "moon", "name": "Луна", "series": "Космос", "emblem": "moon", "style": "neon",
        "colors": ["#b9c6ff", "#0b0f2a", "#ffffff"],
        "patterns": ["Moon", "Lunar", "Night", "Twilight", "Dusk", "Darkwing", "Shadow", "Wolf", "Umbral"],
        "exclude": ["Knight"],
        "gold": 3, "gold_patterns": ["Night", "Lunar Weave", "Eclipse", "Nocts", "Black Laminate",
                                     "Ultraviolet", "Black Pearl"],
        "size": 34, "tier": "mid",
    },
    {
        "id": "galaxy", "name": "Галактика", "series": "Космос", "emblem": "planet", "style": "neon",
        "colors": ["#b44dff", "#12052e", "#4dd8ff"],
        "patterns": ["Galaxy", "Nebula", "Space", "Astral", "Astro", "Orbit", "Supernova", "Orion", "Meteor",
                     "Phobos", "Colony", "Off World", "Battlestar", "Starlight", "Zirka", "in Libra", "in Leo",
                     "Mystic Conjunction", "Exo", "Uncharted", "Moonrise", "Re-Entry", "Airlock", "Sputnik",
                     "Doppler"],
        "exclude": ["Exothermic"],
        "gold": 4, "gold_patterns": ["Doppler", "Black Pearl", "Ultraviolet", "Marble Fade", "Nocts"],
        "size": 36, "tier": "high",
    },
    {
        "id": "rocket", "name": "Ракета", "series": "Космос", "emblem": "rocket", "style": "tech",
        "colors": ["#ff4b4b", "#1a1030", "#ffb03a"],
        "patterns": ["Rocket", "Sputnik", "Space Race", "Re-Entry", "Airlock", "Pilot", "Jet Set", "Turbo",
                     "Nitro", "Throttle", "Fuel Injector", "Aerial", "Slipstream", "Momentum", "Stratosphere",
                     "Warhawk", "Warbird", "Afterimage", "Hot Rod", "Grand Prix", "Pole Position", "Fully Tuned",
                     "Check Engine", "Hand Brake", "Roll Cage", "Brake Light", "Road Rash", "Rat Rod",
                     "Motorized", "High Beam", "Redline", "Rapid Transit"],
        "gold": 3, "gold_patterns": ["Red Racer", "Finish Line", "Overtake", "Racing Green", "Autotronic"],
        "size": 40, "tier": "mid",
    },
    # ------------------------------------------------------------------- Улицы
    {
        "id": "graffiti", "name": "Граффити", "series": "Улицы", "emblem": "spray", "style": "graffiti",
        "colors": ["#ff2fa0", "#1a1a1a", "#ffe600"],
        "patterns": ["Graf", "Contrast Spray", "Canal Spray", "Halftone", "Scrawl", "Paintover", "Wash me",
                     "Vandal", "Riot", "Rebel", "Stencil", "Marker", "Chalk", "Glitched Paint", "Squeezer",
                     "Cut Out", "Loudmouth", "Gum Wall", "Wall Bang", "Splash Jam", "Popdog", "POP AWP",
                     "Drop Me", "See Ya Later", "Kitbash", "Urban Rubble"],
        "gold": 3, "gold_patterns": ["Blackbook", "Overprint", "Freehand", "Unhinged", "Boom!", "POW!",
                                     "Slingshot"],
        "size": 40, "tier": "cheap",
    },
    {
        "id": "mask", "name": "Маска", "series": "Улицы", "emblem": "mask", "style": "graffiti",
        "colors": ["#e0245e", "#1d0610", "#f5f5f5"],
        "patterns": ["Mask", "Oni ", "Saibā Oni", "Daimyo", "Kami", "Shinobu", "Muertos", "Anubis", "Mayan",
                     "Aztec", "Ancient Ritual", "Akoben", "Mischief", "Just Smile", "Neo-Noir", "Vogue",
                     "Fever Dream", "Akihabara", "Temukau", "Sakkaku", "The Emperor", "The Empress", "Traitor",
                     "Executioner", "The Prince", "Duelist", "Queen", "Sultan"],
        "exclude": ["Damask"],
        "gold": 3, "gold_patterns": ["Crimson Kimono", "Bronze Morph", "Occult", "Vice", "Pandora's Box",
                                     "Slaughter"],
        "size": 40, "tier": "high",
    },
    {
        "id": "ghost", "name": "Призрак", "series": "Улицы", "emblem": "ghost", "style": "neon",
        "colors": ["#9fb4c7", "#0d1117", "#7cffcb"],
        "patterns": ["Ghost", "Phantom", "Spectre", "Wraith", "Spirit", "Apparition", "geist", "Zombie", "Necro",
                     "Grim", "Skull", "Death", "Bone", "Mortis", "Macabre", "Grave", "Catacombs", "Entombed",
                     "Curse", "Ossified", "Yorick", "Memento", "Hades", "Styx", "Acheron", "Cerberus",
                     "Survivor Z", "Night Terror", "Nightmare"],
        "gold": 3, "gold_patterns": ["Cobalt Skulls", "Occult", "Nocts", "Black Laminate", "Night", "Stained"],
        "size": 42, "tier": "mid",
    },
    {
        "id": "predator", "name": "Хищник", "series": "Улицы", "emblem": "wolf", "style": "military",
        "colors": ["#ff9f1c", "#1f1405", "#d32f2f"],
        "patterns": ["Tiger", "Panther", "Wolf", "Jaguar", "Gator", "Predator", "Prey", "Hunter", "Carnivor",
                     "Sobek", "Hyper Beast", "Fennec", "Stalker", "Hunting", "Food Chain", "Small Game", "Weasel",
                     "Kitty", "PAW", "Tigris", "Primal", "Cat Fight", "Tom Cat", "Blood in the Water", "Scorpion"],
        "exclude": ["Incinegator", "Tiger Moth"],
        "gold": 3, "gold_patterns": ["Tiger Tooth", "Snow Leopard", "Queen Jaguar", "Tiger Strike", "Big Game",
                                     "Giraffe", "Safari Mesh"],
        "size": 42, "tier": "mid",
    },
    # -------------------------------------------------------------------- Неон
    {
        "id": "neon", "name": "Неон", "series": "Неон", "emblem": "heart", "style": "neon",
        "colors": ["#ff2bd6", "#13002a", "#00f0ff"],
        "patterns": ["Neon", "Ultraviolet", "Blacklight", "Phosphor", "Lumen", "Prism", "Chromatic", "Vaporwave",
                     "Spectrum", "Spectrogram", "Hyper Beast", "Fever Dream", "Electric Hive", "Disco Tech",
                     "Fuschia", "Violet", "Cyanospatter", "Dazzle", "Bad Trip", "Afterimage",
                     "Limelight", "Lime Hex", "Light Box", "Sugar Rush", "Berry Gel"],
        "gold": 3, "gold_patterns": ["Vice", "Fade", "Ultraviolet", "Doppler", "Superconductor",
                                     "Pandora's Box"],
        "size": 36, "tier": "mid",
    },
    {
        "id": "arcade", "name": "Аркада", "series": "Неон", "emblem": "controller", "style": "arcade",
        "colors": ["#ffcc00", "#1c0b3a", "#ff3d7f"],
        "patterns": ["Starcade", "Player Two", "Button Masher", "Glitch", "Toy", "Fizzy POP", "Rocket Pop",
                     "Monster Mashup", "B the Monster", "Bee-Tron", "Nostalgia", "Dizzy", "Bratatat", "Sans Comic",
                     "Snack Attack", "Crakow", "Pipsqueak", "Party Animal", "Banana Cannon", "Llama Cannon",
                     "Kiss", "XOXO", "Cassette", "Music Box", "Broken Record", "Video Cam", "ZX Spectron",
                     "Elite 1.6", "Global Offensive", "Lil' Pig", "Death by", "Doomkitty", "Fairy", "Melondrama",
                     "Wurst", "Sour Grapes", "Cherries", "BOOM", "Bizoom", "Zubastick", "Necro Jr", "Buddy",
                     "Run Run Run", "High Roller", "Bamboozle", "Retrobution", "Space Cat", "LongDog"],
        "gold": 2, "gold_patterns": ["Boom!", "POW!", "Slingshot", "Unhinged", "Freehand", "Polygon",
                                     "Overprint"],
        "size": 45, "tier": "cheap",
    },
    {
        "id": "cyber", "name": "Кибер", "series": "Неон", "emblem": "eye", "style": "tech",
        "colors": ["#00ffa3", "#03140f", "#00b3ff"],
        "patterns": ["Cyber", "Digital", "Mecha", "Mainframe", "Motherboard", "Neural", "Protocol", "System Lock",
                     "Co-Processor", "Nexus", "Base-2", "Cortex", "AUTOEXEC", "Random Access", "Analog Input",
                     "Signal", "Cyrex", "Prototype", "Module", "Schematic", "Blueprint", "Switch Board",
                     "Control", "Reboot", "Trace Lock", "Target Acquired", "Threat Detected", "Smart Gun",
                     "Re.built", "Interlock", "Converter", "Exchanger", "Framework", "Directive", "Surveillance",
                     "2A2F", "O.S.I.P.R", "PC-GRN", "RMX", "Titanium Bit", "Fatal Glitch", "Spiral Glitch"],
        "gold": 3, "gold_patterns": ["Superconductor", "Autotronic", "Omega", "Polygon", "Field Agent",
                                     "Black Laminate"],
        "size": 45, "tier": "mid",
    },
    # ------------------------------------------------------- Статус (лестница цен)
    {
        "id": "bomzh", "name": "Бомж", "series": "Статус", "emblem": "coin", "style": "graffiti",
        "colors": ["#8d7b68", "#1e1a16", "#c2b280"],
        "patterns": [], "rarities": ["consumer", "industrial", "milspec"], "price": [None, 12],
        "gold": 0, "size": 40, "tier": "cheap",
    },
    {
        "id": "student", "name": "Студент", "series": "Статус", "emblem": "dice", "style": "arcade",
        "colors": ["#4fa3ff", "#0c1a2e", "#ffd166"],
        "patterns": [], "rarities": ["industrial", "milspec", "restricted"], "price": [2, 60],
        "gold": 0, "size": 40, "tier": "cheap",
    },
    {
        "id": "worker", "name": "Работяга", "series": "Статус", "emblem": "hourglass", "style": "military",
        "colors": ["#f2994a", "#25170a", "#56ccf2"],
        "patterns": [], "rarities": ["milspec", "restricted", "classified"], "price": [6, 250],
        "gold": 1, "gold_patterns": ["Vanilla", "Safari Mesh", "Boreal Forest", "Forest DDPAT", "Scorched",
                                     "Urban Masked", "Rust Coat"],
        "size": 40, "tier": "mid",
    },
    {
        "id": "businessman", "name": "Бизнесмен", "series": "Статус", "emblem": "money", "style": "lux",
        "colors": ["#2d9cdb", "#0a1622", "#d4af37"],
        "patterns": [], "rarities": ["restricted", "classified", "covert"], "price": [40, 1500],
        "gold": 2, "gold_patterns": ["Black Tie", "Mogul", "Leather", "Lt. Commander", "Crimson Weave",
                                     "Case Hardened", "Blue Steel", "Night"],
        "size": 40, "tier": "high",
    },
    {
        "id": "major", "name": "Мажор", "series": "Статус", "emblem": "diamond", "style": "lux",
        "colors": ["#bb6bd9", "#1d0a26", "#ffd700"],
        "patterns": [], "rarities": ["restricted", "classified", "covert"], "price": [110, 4000],
        "gold": 4, "gold_patterns": ["Fade", "Doppler", "Tiger Tooth", "Slaughter", "Vice", "Pandora's Box"],
        "size": 40, "tier": "high",
    },
    {
        "id": "oligarch", "name": "Олигарх", "series": "Статус", "emblem": "crown", "style": "lux",
        "colors": ["#ffd700", "#1f1600", "#ffffff"],
        "patterns": [], "rarities": ["restricted", "classified", "covert", "contraband"], "price": [140, None],
        "gold": 6, "gold_patterns": ["Ruby", "Sapphire", "Black Pearl", "Emerald", "Lore", "Fade",
                                     "Pandora's Box", "Vice", "Crimson Web"],
        "size": 40, "tier": "elite",
    },
    # ------------------------------------------------------------------ Оружие
    {
        "id": "ak47", "name": "АК-47", "series": "Оружие", "emblem": "star", "style": "military",
        "colors": ["#d32ce6", "#24062a", "#ff9f1c"],
        "patterns": [], "weapons": ["AK-47"],
        "gold": 2, "gold_patterns": KNIFE_GOLD, "size": 45, "tier": "mid",
    },
    {
        "id": "awp", "name": "AWP", "series": "Оружие", "emblem": "crosshair", "style": "military",
        "colors": ["#00b4a6", "#04211f", "#7cffcb"],
        "patterns": [], "weapons": ["AWP"],
        "gold": 2, "gold_patterns": KNIFE_GOLD, "size": 45, "tier": "high",
    },
    {
        "id": "m4", "name": "M4", "series": "Оружие", "emblem": "shield", "style": "military",
        "colors": ["#3a7bd5", "#081a33", "#9be7ff"],
        "patterns": [], "weapons": ["M4A4", "M4A1-S"],
        "gold": 2, "gold_patterns": KNIFE_GOLD, "size": 50, "tier": "mid",
    },
    {
        "id": "deagle", "name": "Дигл", "series": "Оружие", "emblem": "spade", "style": "lux",
        "colors": ["#c9a227", "#231b05", "#ff5a1f"],
        "patterns": [], "weapons": ["Desert Eagle"],
        "gold": 2, "gold_patterns": KNIFE_GOLD, "size": 40, "tier": "mid",
    },
    {
        "id": "pistols", "name": "Пистолеты", "series": "Оружие", "emblem": "skull", "style": "military",
        "colors": ["#4b69ff", "#0a1033", "#b0c3ff"],
        "patterns": [], "weapons": ["Glock-18", "USP-S", "P2000", "P250", "Five-SeveN", "Tec-9", "CZ75-Auto",
                                    "Dual Berettas", "Desert Eagle", "R8 Revolver"],
        "gold": 2, "gold_patterns": KNIFE_GOLD, "size": 50, "tier": "cheap",
    },
    {
        "id": "knife", "name": "Ножевой", "series": "Оружие", "emblem": "knife", "style": "lux",
        "colors": ["#e4ae39", "#241a05", "#fff3c4"],
        "patterns": [], "cats": ["Knives"], "rarities": ["gold"], "price": [None, 40000],
        "gold": 0, "size": 40, "tier": "elite",
    },
    {
        "id": "gloves", "name": "Перчатки", "series": "Оружие", "emblem": "glove", "style": "lux",
        "colors": ["#e4ae39", "#1f1608", "#ff7a00"],
        "patterns": [], "cats": ["Gloves"], "rarities": ["gold"],
        "gold": 0, "size": 35, "tier": "elite",
    },
]

SERIES = ["Стихии", "Мифы", "Космос", "Улицы", "Неон", "Статус", "Оружие"]


def _has(text, subs):
    t = text.lower()
    return any(s.lower() in t for s in subs)


def match(theme, m):
    """Попадает ли предмет (meta из build_data: weapon, pattern, rarity, cat, price) в основной пул темы."""
    rar = theme.get("rarities")
    if rar:
        if m["rarity"] not in rar:
            return False
    elif m["rarity"] in ("gold", "contraband"):
        return False
    if theme.get("cats") and m["cat"] not in theme["cats"]:
        return False
    if theme.get("weapons") and m["weapon"] not in theme["weapons"]:
        return False
    if theme.get("price"):
        lo, hi = theme["price"]
        if (lo is not None and m["price"] < lo) or (hi is not None and m["price"] > hi):
            return False
    if theme.get("patterns") and not _has(m["pattern"], theme["patterns"]):
        return False
    if theme.get("exclude") and _has(m["pattern"], theme["exclude"]):
        return False
    return True


def match_gold(theme, m):
    """Подходит ли нож/перчатки (rarity 'gold') как джекпот темы."""
    if m["rarity"] != "gold":
        return False
    gp = theme.get("gold_patterns")
    return not gp or _has(f"{m['pattern']} {m.get('phase') or ''}", gp)
