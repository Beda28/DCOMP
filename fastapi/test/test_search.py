import unittest
from processing.search import search

class SearchTests(unittest.TestCase):
    def test_korean_ranking_pages_unknown_and_empty(self):
        documents = [
            {"id": 1, "text": "바나나 납품 영수증 합계 12345"},
            {"id": 2, "text": "바나나 납품 내역 바나나 납품"},
            {"id": 3, "text": "사과 구매 합계 980"},
            {"id": 4, "text": ""},
        ]
        result = search("바나나 납품", documents, 1, 1)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["data"][0]["id"], 2)
        self.assertEqual(search("바나나 납품", documents, 2, 1)["data"][0]["id"], 1)
        self.assertEqual(search("unknownenglishword", documents, 1, 20)["total"], 0)
        self.assertEqual(search("바나나", [], 1, 20), {"data": [], "total": 0})
        self.assertEqual(search("!!!", documents, 1, 20)["total"], 0)

    def test_partial_korean_case_unicode_and_request_isolation(self):
        self.assertEqual(search("바나나", [{"id": 1, "text": "바나나납품"}], 1, 20)["total"], 1)
        self.assertEqual(search("invoice", [{"id": 2, "text": "ＩＮＶＯＩＣＥ"}], 1, 20)["total"], 1)
        self.assertEqual(search("바나나", [{"id": 3, "text": "사과"}], 1, 20)["total"], 0)
        result = search("needle", [{"id": 4, "text": "prefix " * 100 + "needle " + "suffix " * 100}], 1, 20)
        self.assertIn("needle", result["data"][0]["snippet"])
        self.assertLessEqual(len(result["data"][0]["snippet"]), 242)

if __name__ == "__main__": unittest.main()
