import re
from datetime    import date
from decimal     import Decimal
from unicodedata import normalize

DATE = re.compile(r"(?<!\d)(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?:일)?(?!\d)")
TOTAL = re.compile(r"(?:총결제금액|실결제금액|결제금액|승인금액|청구금액|총합계|합계금액|합계|총액|GRAND\s*TOTAL|AMOUNT\s*DUE|(?<!SUB)TOTAL)\s*[:：]?\s*(?:KRW|₩|\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d,.])", re.I)
MERCHANT = re.compile(r"^(?:상호(?:명)?|가맹점(?:명)?|업체명|MERCHANT|STORE\s*NAME)\s*[:：]?\s*(.+)", re.I)
BIZ = re.compile(r"(?<!\d)(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})(?!\d)")

def unique(values: list[str]) -> str | None:
    found = set(values)
    return next(iter(found)) if len(found) == 1 else None

def extract(rows: list[dict]) -> dict[str, str | None]:
    dates, amounts, titles, numbers = [], [], [], []
    for row in rows:
        if row["confidence"] < 0.65: continue
        text = normalize("NFKC", row["text"])
        if not re.search(r"유효|유통|제조|만료|생년|EXPIR|BIRTH", text, re.I):
            for match in DATE.finditer(text):
                try: dates.append(date(*map(int, match.groups())).isoformat())
                except ValueError: pass
        if not re.search(r"소계|공급가|부가세|거스름|할인|환불|취소|SUBTOTAL|TOTAL\s*TAX|REFUND", text, re.I):
            for match in TOTAL.finditer(text):
                value = Decimal(match[1].replace(",", ""))
                if 0 <= value < Decimal("1000000000000000000"): amounts.append(format(value, ".2f"))
        merchant = MERCHANT.match(text)
        if merchant: titles.append(merchant[1].strip()[:160])
        numbers.extend("-".join(match.groups()) for match in BIZ.finditer(text))
    return {"date": unique(dates), "amount": unique(amounts), "title": unique(titles), "bizNumber": unique(numbers)}
