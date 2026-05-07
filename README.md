# D2E e-mail automatizáció

Egyszerű, biztonságos, webes eszköz személyre szabott tömeges e-mail küldéshez (tréningkódok, egyedi linkek, stb.).

## Mire való?

- CSV vagy Excelből kimásolt táblázat beolvasása
- személyes mezők behelyettesítése sablonba (`{Név}`, `{Kód}`, stb.)
- küldés `dry-run`, `sandbox`, vagy `live` módban
- SMTP beállítás és üzemmód kezelése UI-ból
- archív BCC (másolat minden kimenő levélről)

## Fő funkciók

- **Kampány folyamat**: import -> oszlopválasztás -> előnézet -> küldés
- **Kódkényszer**: üres kódos soroknál a küldés megáll
- **Biztonság**: production módban Basic Auth
- **NAS-kompatibilis**: egy konténerben fut (FastAPI + buildelt React SPA)
- **Perzisztens szerverbeállítások**: restart után is megmaradnak

## Gyors indulás (lokál)

1. Másold az env mintát:
   - `cp .env.example .env`
2. Indítsd:
   - `docker compose up --build`
3. Nyisd meg:
   - `http://localhost:8000`

## Küldési módok

- `dry-run`: SMTP kapcsolat nincs, csak validáció
- `sandbox`: minden levél a sandbox címre megy
- `live`: valós címzetteknek küld

## Alapvető használat

1. **Táblázat betöltése** (CSV vagy beillesztés)
2. **E-mail oszlop kiválasztása**
3. **Név és Kód oszlop kiválasztása**
4. **Sablon ellenőrzés** (`{OszlopNév}` helyőrzők)
5. **Előnézet**
6. **Küldés**

## Dokumentáció

- NAS deploy: `docs/nas-deploy.md`
- Üzemeltetés és hibaelhárítás: `docs/operations.md`

## Biztonság / adatkezelés

- Valós névsorok és kódok ne kerüljenek nyilvános repóba.
- A `Doc/*.docx` és `xls/*.xlsx` fájlok ezért gitignore alatt vannak.
- Lokális operatív jegyzetekhez használd a `README.local.md` fájlt (ez nem verzionált).
