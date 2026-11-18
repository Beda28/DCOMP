FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home app
COPY main.py ./
COPY router ./router
USER app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

