import hashlib
import os
import tempfile
import unittest
from pathlib import Path
from PIL     import Image, ImageDraw, ImageFont
from processing.fields import extract
from processing.ocr    import process

class OcrTests(unittest.TestCase):
    def test_fields_and_ambiguous_values(self):
        rows = [{"text": text, "confidence": 0.95} for text in ["상호: 테스트상사", "거래일 2026-11-22", "합계 12,345원", "123-45-67890"]]
        self.assertEqual(extract(rows), {"date": "2026-11-22", "amount": "12345.00", "title": "테스트상사", "bizNumber": "123-45-67890"})
        rows += [{"text": "합계 9,999원", "confidence": 0.95}, {"text": "2026-02-30", "confidence": 0.99}]
        self.assertIsNone(extract(rows)["amount"])
        self.assertEqual(extract(rows)["date"], "2026-11-22")
        self.assertIsNone(extract([{"text": "합계 100", "confidence": 0.2}])["amount"])

    def test_real_image_pdf_and_invalid_path(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = os.environ.get("UPLOAD_DIR")
            os.environ["UPLOAD_DIR"] = directory
            try:
                folder = Path(directory) / "1"
                folder.mkdir()
                image = Image.new("RGB", (1200, 600), "white")
                draw = ImageDraw.Draw(image)
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 45)
                draw.multiline_text((60, 80), "INVOICE\nDATE 2026-11-22\nTOTAL 12345.00\nMERCHANT: DCOMP", font=font, fill="black", spacing=30)
                for extension, content_type in [("PNG", "image/png"), ("PDF", "application/pdf")]:
                    key = "1/11111111-1111-1111-1111-111111111111"
                    path = Path(directory) / key
                    image.save(path, format=extension)
                    sha = hashlib.sha256(path.read_bytes()).hexdigest()
                    result = process(key, content_type, sha)
                    self.assertIn("12345", result["text"])
                    self.assertEqual(result["fields"]["amount"], "12345.00")
                    with self.assertRaises(ValueError): process(key, content_type, "0" * 64)
                with self.assertRaises(ValueError): process("../outside", "image/png", "0" * 64)
                image.close()
            finally:
                if previous is None: os.environ.pop("UPLOAD_DIR", None)
                else: os.environ["UPLOAD_DIR"] = previous

if __name__ == "__main__": unittest.main()
