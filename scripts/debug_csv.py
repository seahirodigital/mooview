"""CSVのエンコーディングとインポートロジックのデバッグスクリプト"""
import re

CSV_PATH = r"C:\Users\mahha\OneDrive\開発\mooview\docs\セクター別.csv"

# ファイルをバイナリで読み込み
with open(CSV_PATH, "rb") as f:
    raw = f.read()

print("=== ファイル情報 ===")
print(f"バイトサイズ: {len(raw)}")
print(f"先頭3バイト(BOM確認): {raw[:3].hex()}")

# エンコーディング試行
decoded = None
for enc in ["utf-8-sig", "utf-8", "cp932", "shift_jis"]:
    try:
        decoded = raw.decode(enc)
        print(f"エンコーディング: {enc} OK")
        break
    except Exception as e:
        print(f"エンコーディング: {enc} FAIL -> {e}")

if not decoded:
    print("デコード不可")
    exit(1)

print("\n=== ヘッダー行 ===")
lines = decoded.splitlines()
print(f"行数: {len(lines)}")
cols = lines[0].split(",")
print(f"ヘッダー列数: {len(cols)}")
print(f"ヘッダー[0]: {repr(cols[0])}")
print(f"ヘッダー[1]: {repr(cols[1]) if len(cols) > 1 else 'N/A'}")
print(f"ヘッダー[2]: {repr(cols[2]) if len(cols) > 2 else 'N/A'}")

print("\n=== データ行 ===")
for i, line in enumerate(lines[1:], 1):
    if not line.strip():
        print(f"Row{i}: 空行")
        continue
    row_cols = line.split(",")
    code = row_cols[0] if len(row_cols) > 0 else ""
    name = row_cols[1] if len(row_cols) > 1 else ""
    market = row_cols[2] if len(row_cols) > 2 else ""
    print(f"Row{i}: code={repr(code)} name={repr(name[:20])} market={repr(market)}")

print("\n=== フロントエンドのCSVパーサー再現 ===")
# parseCsvRows の Python版
def parse_csv_rows(text):
    rows = []
    row = []
    value = ""
    in_quotes = False
    i = 0
    while i < len(text):
        char = text[i]
        next_char = text[i+1] if i+1 < len(text) else ""
        if char == '"':
            if in_quotes and next_char == '"':
                value += '"'
                i += 1
            else:
                in_quotes = not in_quotes
            i += 1
            continue
        if char == "," and not in_quotes:
            row.append(value)
            value = ""
            i += 1
            continue
        if char in ("\n", "\r") and not in_quotes:
            if char == "\r" and next_char == "\n":
                i += 1
            row.append(value)
            if any(cell.strip() for cell in row):
                rows.append(row)
            row = []
            value = ""
            i += 1
            continue
        value += char
        i += 1
    row.append(value)
    if any(cell.strip() for cell in row):
        rows.append(row)
    return rows

rows = parse_csv_rows(decoded)
print(f"パース後の行数: {len(rows)}")

if len(rows) < 2:
    print("ERROR: 2行未満のため候補なし")
else:
    headers = [h.replace("\uFEFF", "").strip() for h in rows[0]]
    print(f"ヘッダー(正規化後): {headers[:5]}")
    
    code_idx = next((i for i, h in enumerate(headers) if h == "コード" or h.lower() == "code"), -1)
    name_idx = next((i for i, h in enumerate(headers) if h == "銘柄" or h.lower() == "name"), -1)
    market_idx = next((i for i, h in enumerate(headers) if h == "市場" or h.lower() == "market"), -1)
    
    print(f"codeIndex: {code_idx}")
    print(f"nameIndex: {name_idx}")
    print(f"marketIndex: {market_idx}")
    
    if code_idx == -1:
        print("ERROR: コード列が見つかりません！")
    else:
        candidates = []
        for row in rows[1:]:
            code = str(row[code_idx] if code_idx < len(row) else "").strip()
            name = str(row[name_idx] if name_idx >= 0 and name_idx < len(row) else "").strip()
            market = str(row[market_idx] if market_idx >= 0 and market_idx < len(row) else "").strip()
            if code:
                candidates.append({"code": code, "name": name, "market": market})
        
        print(f"\n候補数: {len(candidates)}")
        for c in candidates[:5]:
            print(f"  code={repr(c['code'])} name={repr(c['name'][:20])} market={repr(c['market'])}")

print("\n=== normalizeTickerSymbolForStorage 再現 ===")
def normalize_ticker_symbol(raw_symbol):
    cleaned = raw_symbol.strip().strip("\"'")
    if not cleaned:
        return ""
    upper = cleaned.upper()
    if upper.endswith(".JP"):
        return f"JP.{cleaned[:-3].upper()}"
    if upper.endswith(".US"):
        return cleaned[:-3].upper()
    if upper.startswith("JP."):
        return f"JP.{cleaned[3:].upper()}"
    if upper.startswith("US."):
        return cleaned[3:].upper()
    if upper.endswith(".T"):
        return f"JP.{cleaned[:-2].upper()}"
    if re.fullmatch(r"\d{3,5}[A-Z]?", upper):
        return f"JP.{upper}"
    return upper

if len(rows) >= 2 and code_idx >= 0:
    headers = [h.replace("\uFEFF", "").strip() for h in rows[0]]
    code_idx = next((i for i, h in enumerate(headers) if h == "コード" or h.lower() == "code"), -1)
    for row in rows[1:5]:
        raw_code = str(row[code_idx] if code_idx < len(row) else "").strip()
        normalized = normalize_ticker_symbol(raw_code)
        print(f"  '{raw_code}' → '{normalized}'")
