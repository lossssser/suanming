from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable


STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]
BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"]
BRANCH_ELEMENT = {
    "子": "水",
    "丑": "土",
    "寅": "木",
    "卯": "木",
    "辰": "土",
    "巳": "火",
    "午": "火",
    "未": "土",
    "申": "金",
    "酉": "金",
    "戌": "土",
    "亥": "水",
}
ELEMENTS = ["木", "火", "土", "金", "水"]
GENERATES = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
CONTROLS = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}

TRIGRAMS = {
    (1, 1, 1): ("乾", "天", "金"),
    (1, 1, 0): ("兑", "泽", "金"),
    (1, 0, 1): ("离", "火", "火"),
    (1, 0, 0): ("震", "雷", "木"),
    (0, 1, 1): ("巽", "风", "木"),
    (0, 1, 0): ("坎", "水", "水"),
    (0, 0, 1): ("艮", "山", "土"),
    (0, 0, 0): ("坤", "地", "土"),
}

TRIGRAM_BY_NAME = {value[0]: key for key, value in TRIGRAMS.items()}

HEXAGRAMS = {
    ("乾", "乾"): (1, "乾为天"),
    ("兑", "乾"): (43, "泽天夬"),
    ("离", "乾"): (14, "火天大有"),
    ("震", "乾"): (34, "雷天大壮"),
    ("巽", "乾"): (9, "风天小畜"),
    ("坎", "乾"): (5, "水天需"),
    ("艮", "乾"): (26, "山天大畜"),
    ("坤", "乾"): (11, "地天泰"),
    ("乾", "兑"): (10, "天泽履"),
    ("兑", "兑"): (58, "兑为泽"),
    ("离", "兑"): (38, "火泽睽"),
    ("震", "兑"): (54, "雷泽归妹"),
    ("巽", "兑"): (61, "风泽中孚"),
    ("坎", "兑"): (60, "水泽节"),
    ("艮", "兑"): (41, "山泽损"),
    ("坤", "兑"): (19, "地泽临"),
    ("乾", "离"): (13, "天火同人"),
    ("兑", "离"): (49, "泽火革"),
    ("离", "离"): (30, "离为火"),
    ("震", "离"): (55, "雷火丰"),
    ("巽", "离"): (37, "风火家人"),
    ("坎", "离"): (63, "水火既济"),
    ("艮", "离"): (22, "山火贲"),
    ("坤", "离"): (36, "地火明夷"),
    ("乾", "震"): (25, "天雷无妄"),
    ("兑", "震"): (17, "泽雷随"),
    ("离", "震"): (21, "火雷噬嗑"),
    ("震", "震"): (51, "震为雷"),
    ("巽", "震"): (42, "风雷益"),
    ("坎", "震"): (3, "水雷屯"),
    ("艮", "震"): (27, "山雷颐"),
    ("坤", "震"): (24, "地雷复"),
    ("乾", "巽"): (44, "天风姤"),
    ("兑", "巽"): (28, "泽风大过"),
    ("离", "巽"): (50, "火风鼎"),
    ("震", "巽"): (32, "雷风恒"),
    ("巽", "巽"): (57, "巽为风"),
    ("坎", "巽"): (48, "水风井"),
    ("艮", "巽"): (18, "山风蛊"),
    ("坤", "巽"): (46, "地风升"),
    ("乾", "坎"): (6, "天水讼"),
    ("兑", "坎"): (47, "泽水困"),
    ("离", "坎"): (64, "火水未济"),
    ("震", "坎"): (40, "雷水解"),
    ("巽", "坎"): (59, "风水涣"),
    ("坎", "坎"): (29, "坎为水"),
    ("艮", "坎"): (4, "山水蒙"),
    ("坤", "坎"): (7, "地水师"),
    ("乾", "艮"): (33, "天山遁"),
    ("兑", "艮"): (31, "泽山咸"),
    ("离", "艮"): (56, "火山旅"),
    ("震", "艮"): (62, "雷山小过"),
    ("巽", "艮"): (53, "风山渐"),
    ("坎", "艮"): (39, "水山蹇"),
    ("艮", "艮"): (52, "艮为山"),
    ("坤", "艮"): (15, "地山谦"),
    ("乾", "坤"): (12, "天地否"),
    ("兑", "坤"): (45, "泽地萃"),
    ("离", "坤"): (35, "火地晋"),
    ("震", "坤"): (16, "雷地豫"),
    ("巽", "坤"): (20, "风地观"),
    ("坎", "坤"): (8, "水地比"),
    ("艮", "坤"): (23, "山地剥"),
    ("坤", "坤"): (2, "坤为地"),
}

PALACE_SEQUENCE = [
    ("本宫", 0b000000, 6),
    ("一世", 0b000001, 1),
    ("二世", 0b000011, 2),
    ("三世", 0b000111, 3),
    ("四世", 0b001111, 4),
    ("五世", 0b011111, 5),
    ("游魂", 0b010111, 4),
    ("归魂", 0b010000, 3),
]

PALACE_ELEMENT = {
    "乾": "金",
    "兑": "金",
    "离": "火",
    "震": "木",
    "巽": "木",
    "坎": "水",
    "艮": "土",
    "坤": "土",
}

NAYIN_BRANCHES = {
    "乾": ["子", "寅", "辰", "午", "申", "戌"],
    "坤": ["未", "巳", "卯", "丑", "亥", "酉"],
    "坎": ["寅", "辰", "午", "申", "戌", "子"],
    "艮": ["辰", "午", "申", "戌", "子", "寅"],
    "震": ["子", "寅", "辰", "午", "申", "戌"],
    "巽": ["丑", "亥", "酉", "未", "巳", "卯"],
    "离": ["卯", "丑", "亥", "酉", "未", "巳"],
    "兑": ["巳", "卯", "丑", "亥", "酉", "未"],
}

SIX_SPIRITS_BY_DAY_STEM = {
    "甲": ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"],
    "乙": ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"],
    "丙": ["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"],
    "丁": ["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"],
    "戊": ["勾陈", "螣蛇", "白虎", "玄武", "青龙", "朱雀"],
    "己": ["螣蛇", "白虎", "玄武", "青龙", "朱雀", "勾陈"],
    "庚": ["白虎", "玄武", "青龙", "朱雀", "勾陈", "螣蛇"],
    "辛": ["白虎", "玄武", "青龙", "朱雀", "勾陈", "螣蛇"],
    "壬": ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"],
    "癸": ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"],
}

KONG_WANG_BY_XUN = {
    0: ("戌", "亥"),
    1: ("申", "酉"),
    2: ("午", "未"),
    3: ("辰", "巳"),
    4: ("寅", "卯"),
    5: ("子", "丑"),
}


@dataclass(frozen=True)
class HexagramInfo:
    number: int
    name: str
    upper: str
    lower: str
    palace: str
    palace_element: str
    palace_stage: str
    shi: int
    ying: int


@dataclass(frozen=True)
class LineInfo:
    index: int
    spirit: str
    relation: str
    branch: str
    element: str
    symbol: str
    moving: bool
    marker: str
    changed_symbol: str


@dataclass(frozen=True)
class Chart:
    question: str
    cast_time: str
    day_ganzhi: str
    empty_branches: tuple[str, str]
    original: HexagramInfo
    changed: HexagramInfo
    lines: list[LineInfo]


def line_relation(palace_element: str, line_element: str) -> str:
    if line_element == palace_element:
        return "兄弟"
    if GENERATES[line_element] == palace_element:
        return "父母"
    if GENERATES[palace_element] == line_element:
        return "子孙"
    if CONTROLS[line_element] == palace_element:
        return "官鬼"
    if CONTROLS[palace_element] == line_element:
        return "妻财"
    raise ValueError(f"unknown element relation: {palace_element}, {line_element}")


def parse_lines(raw: str) -> list[tuple[int, bool]]:
    tokens = raw.replace(",", " ").replace("，", " ").split()
    if len(tokens) == 1 and len(tokens[0]) == 6:
        tokens = list(tokens[0])
    if len(tokens) != 6:
        raise ValueError("请输入 6 个爻，从初爻到上爻，例如：6 7 8 9 7 8")

    result = []
    for token in tokens:
        if token in {"6", "老阴", "x", "X"}:
            result.append((0, True))
        elif token in {"7", "少阳", "阳"}:
            result.append((1, False))
        elif token in {"8", "少阴", "阴"}:
            result.append((0, False))
        elif token in {"9", "老阳", "o", "O"}:
            result.append((1, True))
        else:
            raise ValueError(f"无法识别爻值：{token}")
    return result


def hexagram_info(bits: Iterable[int]) -> HexagramInfo:
    line_bits = tuple(bits)
    lower = TRIGRAMS[line_bits[:3]][0]
    upper = TRIGRAMS[line_bits[3:]][0]
    number, name = HEXAGRAMS[(upper, lower)]
    palace, stage, shi = find_palace(line_bits)
    ying = ((shi + 2) % 6) + 1
    return HexagramInfo(
        number=number,
        name=name,
        upper=upper,
        lower=lower,
        palace=palace,
        palace_element=PALACE_ELEMENT[palace],
        palace_stage=stage,
        shi=shi,
        ying=ying,
    )


def find_palace(bits: tuple[int, ...]) -> tuple[str, str, int]:
    value = bits_to_int(bits)
    for palace, trigram_bits in TRIGRAM_BY_NAME.items():
        base = bits_to_int(trigram_bits + trigram_bits)
        for stage, mask, shi in PALACE_SEQUENCE:
            if value == (base ^ mask):
                return palace, stage, shi
    raise ValueError(f"无法定位八宫：{bits}")


def bits_to_int(bits: tuple[int, ...]) -> int:
    return sum(bit << index for index, bit in enumerate(bits))


def day_ganzhi_from_date(dt: datetime) -> str:
    # 1900-01-31 is commonly used as a known 甲辰 day anchor.
    anchor = datetime(1900, 1, 31)
    offset = (dt.date() - anchor.date()).days
    return STEMS[offset % 10] + BRANCHES[(4 + offset) % 12]


def kong_wang(day_ganzhi: str) -> tuple[str, str]:
    stem_index = STEMS.index(day_ganzhi[0])
    branch_index = BRANCHES.index(day_ganzhi[1])
    xun_index = ((branch_index - stem_index) % 12) // 2
    return KONG_WANG_BY_XUN[xun_index]


def build_chart(
    raw_lines: str,
    question: str = "",
    cast_time: datetime | None = None,
    day_ganzhi: str | None = None,
) -> Chart:
    parsed = parse_lines(raw_lines)
    cast_dt = cast_time or datetime.now()
    original_bits = [bit for bit, _ in parsed]
    changed_bits = [1 - bit if moving else bit for bit, moving in parsed]
    original = hexagram_info(original_bits)
    changed = hexagram_info(changed_bits)
    day = day_ganzhi or day_ganzhi_from_date(cast_dt)
    spirits = SIX_SPIRITS_BY_DAY_STEM[day[0]]
    empty = kong_wang(day)

    branches = line_branches(original.lower, original.upper)
    lines = []
    for index, ((bit, moving), branch) in enumerate(zip(parsed, branches), start=1):
        element = BRANCH_ELEMENT[branch]
        marker = "世" if index == original.shi else "应" if index == original.ying else ""
        lines.append(
            LineInfo(
                index=index,
                spirit=spirits[index - 1],
                relation=line_relation(original.palace_element, element),
                branch=branch,
                element=element,
                symbol=line_symbol(bit, moving),
                moving=moving,
                marker=marker,
                changed_symbol=line_symbol(1 - bit if moving else bit, False),
            )
        )

    return Chart(
        question=question,
        cast_time=cast_dt.strftime("%Y-%m-%d %H:%M"),
        day_ganzhi=day,
        empty_branches=empty,
        original=original,
        changed=changed,
        lines=lines,
    )


def line_branches(lower: str, upper: str) -> list[str]:
    return NAYIN_BRANCHES[lower][:3] + NAYIN_BRANCHES[upper][3:]


def line_symbol(bit: int, moving: bool) -> str:
    if bit == 1 and moving:
        return "━━━ ○"
    if bit == 0 and moving:
        return "━ ━ ×"
    if bit == 1:
        return "━━━"
    return "━ ━"


def format_chart(chart: Chart) -> str:
    header = [
        f"问题：{chart.question or '未填写'}",
        f"时间：{chart.cast_time}  日辰：{chart.day_ganzhi}  空亡：{chart.empty_branches[0]}{chart.empty_branches[1]}",
        (
            f"本卦：{chart.original.name}（{chart.original.number}） "
            f"{chart.original.palace}宫{chart.original.palace_element} "
            f"{chart.original.palace_stage}"
        ),
        (
            f"变卦：{chart.changed.name}（{chart.changed.number}） "
            f"{chart.changed.palace}宫{chart.changed.palace_element} "
            f"{chart.changed.palace_stage}"
        ),
        "",
        "六神   六亲   地支五行  本卦       标  变卦",
        "-" * 50,
    ]
    body = []
    for line in reversed(chart.lines):
        body.append(
            f"{line.spirit:<3}   {line.relation:<2}   "
            f"{line.branch}{line.element:<2}     {line.symbol:<7}  "
            f"{line.marker:<1}   {line.changed_symbol}"
        )
    return "\n".join(header + body)
