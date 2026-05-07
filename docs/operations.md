# Üzemeltetés és hibaelhárítás

## Napi üzemeltetés

- Belépés: app Basic Auth (production módban kötelező)
- Mód ellenőrzés: fejléc badge és `Szerver beállítások` menü
- Küldés előtt:
  - e-mail oszlop helyes
  - kód oszlop helyes
  - előnézet rendben

## SMTP működés

- 587 + `SMTP_TLS=true` -> STARTTLS
- 465 + `SMTP_TLS=true` -> implicit TLS
- auth csak akkor történik, ha user + jelszó is be van állítva

## Archív BCC

- cél: kimenő levelek nyomon követése / továbbíthatóság
- beállítás kulcs: `ARCHIVE_BCC_TO`
- UI-ban módosítható: `Szerver beállítások` -> `Archív BCC cím`

## Health endpoint

- `GET /api/health` mindig auth nélkül elérhető
- erre lehet monitorozást kötni

Példa:

```bash
curl -sS https://sendout.sitkeitamas.hu/api/health
```

## Logok

```bash
/usr/local/bin/docker logs --tail 200 d2e-e-mail-automation-app-1
```

## Gyakori problémák

- **401 mindenhol**
  - Basic Auth aktív, add meg a felhasználó/jelszó párost

- **SMTP: Connection already using TLS**
  - tipikusan dupla TLS hívás okozza; a jelenlegi kód ezt kezeli

- **SMTP recipient refused / client host rejected**
  - relay policy / jogosultság gond a szerveren
  - ellenőrizd SMTP user/jelszó/feladó domain policy-t

- **Beállítások eltűnnek restart után**
  - hiányzik a `./data:/app/data` volume
  - rossz `RUNTIME_SETTINGS_FILE` útvonal

- **HTTP nem redirectel HTTPS-re**
  - a 80-as reverse proxy szabály az appra lő, nem redirectre
  - DSM-ben külön HTTP->HTTPS redirect szabály kell

## Frissítési checklist

1. kód frissítése NAS mappába
2. `/usr/local/bin/docker-compose up -d --build`
3. health check (`/api/health`)
4. bejelentkezés + gyors UI próba
5. egy tesztküldés `sandbox` módban
