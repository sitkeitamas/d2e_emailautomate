# NAS deploy (Synology DSM / MailPlus környezet)

Ez a leírás a projekt Synology NAS-ra telepítéséhez készült.

## Előfeltételek

- Synology DSM, SSH elérés
- Container Manager / Docker telepítve
- Domain + reverse proxy (opcionális, de ajánlott)

## Cél mappa NAS-on

Példa:

- `/volume1/docker/d2e-e-mail-automation`

## Kötelező fájlok

- `docker-compose.yml`
- `.env`
- `backend/`, `frontend/`, `requirements.txt`, `Dockerfile`

## Ajánlott compose

```yaml
services:
  app:
    build: .
    env_file:
      - .env
    ports:
      - "18000:8000"
    volumes:
      - ./data:/app/data
```

Megjegyzés:

- A `./data:/app/data` mount kell ahhoz, hogy a UI-ban mentett szerverbeállítások restart után is megmaradjanak.

## Ajánlott .env kulcsok

```env
APP_ENV=production
BASIC_AUTH_ENABLED=true
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=<eros-jelszo>

MAIL_MODE=live
SMTP_HOST=mail.sitkeitamas.hu
SMTP_PORT=587
SMTP_TLS=true
SMTP_USER=sitkeitamas
SMTP_PASSWORD=<smtp-jelszo>
MAIL_FROM=me@sitkeitamas.hu
SANDBOX_REDIRECT_TO=sitkei.freemail@gmail.com
ARCHIVE_BCC_TO=selfridge.parker@gmail.com

RUNTIME_SETTINGS_FILE=/app/data/server_settings.json
MAX_UPLOAD_MB=2
```

## Indítás / frissítés

```bash
cd /volume1/docker/d2e-e-mail-automation
/usr/local/bin/docker-compose up -d --build
```

## Gyors ellenőrzés

```bash
curl -sS http://127.0.0.1:18000/api/health
/usr/local/bin/docker ps --filter name=d2e-e-mail-automation-app-1
```

## Reverse proxy (DSM)

Ajánlott cél:

- Source: `https://sendout.sitkeitamas.hu:443`
- Destination: `http://127.0.0.1:18000`

HTTP -> HTTPS:

- legyen külön redirect szabály (80 -> 443)
- ha a 80-as host közvetlenül appra mutat, nem lesz redirect (auth/401 jöhet)

## Gyakori hiba

- `Bind for 0.0.0.0:8000 failed: port is already allocated`
  - oka: ütközés más konténerrel
  - megoldás: használd a `18000:8000` mappingot
