import math
import re
from collections import Counter
from unicodedata import normalize

def tokens(text: str) -> list[str]:
    words = re.findall(r"[^\W_]+", normalize("NFKC", text).casefold())
    result = list(words)
    for word in words:
        if not re.search(r"[가-힣]", word): continue
        for size in (1, 2, 3):
            result.extend("#" + word[index:index + size] for index in range(len(word) - size + 1))
    return result

def snippet(text: str, query: str) -> str:
    text = " ".join(text.split())
    words = re.findall(r"[^\W_]+", query.casefold())
    positions = [text.casefold().find(word) for word in words]
    positions = [position for position in positions if position >= 0]
    start = max(0, min(positions) - 60) if positions else 0
    return ("…" if start else "") + text[start:start + 240] + ("…" if start + 240 < len(text) else "")

def search(query: str, documents: list[dict], page: int, limit: int) -> dict:
    if not documents: return {"data": [], "total": 0}
    counts = [Counter(tokens(document["text"])) for document in documents]
    frequency = Counter(word for count in counts for word in count)
    query_count = Counter(tokens(query))
    idf = {word: math.log((1 + len(documents)) / (1 + value)) + 1 for word, value in frequency.items()}
    query_vector = {word: value * idf[word] for word, value in query_count.items() if word in idf}
    query_norm = math.sqrt(sum(value * value for value in query_vector.values()))
    if not query_norm: return {"data": [], "total": 0}

    ranked = []
    for document, count in zip(documents, counts):
        dot = sum(query_vector[word] * count[word] * idf[word] for word in query_vector if word in count)
        if dot <= 0: continue
        norm = math.sqrt(sum((value * idf[word]) ** 2 for word, value in count.items()))
        score = dot / (norm * query_norm) if norm else 0
        ranked.append({"id": document["id"], "score": round(min(1, score), 6), "snippet": snippet(document["text"], query)})
    ranked.sort(key=lambda row: (-row["score"], -row["id"]))
    offset = (page - 1) * limit
    return {"data": ranked[offset:offset + limit], "total": len(ranked)}
