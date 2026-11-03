# ML Backend (Python / FastAPI) — основа от Software Architekt + модель AI Expert
FROM python:3.12-slim

# Не создаём .pyc и сразу пишем логи в stdout (видно в `docker compose logs ml-service`)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Сначала только зависимости — этот слой кешируется и не пересобирается
# при каждом изменении кода
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Сервис работает не от root (так настроил Architect).
# Папка models принадлежит пользователю app — туда сохраняется обученная модель.
RUN groupadd --system app && useradd --system --gid app --home /app app \
    && mkdir -p /app/models && chown app:app /app/models
COPY --chown=app:app app/ ./app/
USER app

# Модель хранится в volume, чтобы переживать перезапуск контейнера
VOLUME ["/app/models"]

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
