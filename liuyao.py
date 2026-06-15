from __future__ import annotations

import argparse
from datetime import datetime

from liuyao_core import build_chart, format_chart


def main() -> None:
    parser = argparse.ArgumentParser(description="六爻基础排盘工具")
    parser.add_argument(
        "lines",
        nargs="?",
        help="六个爻，从初爻到上爻。6 老阴动，7 少阳，8 少阴，9 老阳动。例如：6 7 8 9 7 8",
    )
    parser.add_argument("-q", "--question", default="", help="所问事项")
    parser.add_argument(
        "-t",
        "--time",
        help="起卦时间，格式：YYYY-MM-DD HH:MM。不填则使用当前时间。",
    )
    parser.add_argument(
        "-d",
        "--day",
        help="手动指定日辰，例如：甲子。若指定则优先使用。",
    )
    args = parser.parse_args()

    raw_lines = args.lines
    question = args.question
    if not raw_lines:
        print("请输入六个爻，从初爻到上爻。")
        print("规则：6 老阴动，7 少阳，8 少阴，9 老阳动")
        raw_lines = input("六爻：").strip()
    if not question:
        question = input("所问事项（可空）：").strip()

    cast_time = None
    if args.time:
        cast_time = datetime.strptime(args.time, "%Y-%m-%d %H:%M")

    chart = build_chart(
        raw_lines=raw_lines,
        question=question,
        cast_time=cast_time,
        day_ganzhi=args.day,
    )
    print(format_chart(chart))


if __name__ == "__main__":
    main()
