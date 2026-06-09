import argparse
import json
from pathlib import Path

import pandas as pd


DEFAULT_OUTPUT_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "jp_symbols.json"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_path = args.source.resolve()
    output_path = args.output.resolve()
    frame = pd.read_excel(source_path)
    records = []
    for _, row in frame.iterrows():
        code = str(row["コード"]).strip()
        name = str(row["銘柄名"]).strip()
        category = str(row["市場・商品区分"]).strip()
        if not code or code == "nan" or not name or name == "nan":
            continue
        records.append(
            {
                "code": code,
                "name": name,
                "category": category,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{output_path}: {len(records)}銘柄")


if __name__ == "__main__":
    main()
