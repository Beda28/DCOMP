FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV OMP_THREAD_LIMIT=2
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home app
COPY main.py ./
COPY router ./router
COPY processing ./processing
COPY test ./test
USER app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

