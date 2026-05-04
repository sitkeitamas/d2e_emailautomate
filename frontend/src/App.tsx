import { useEffect, useMemo, useState } from "react";

type PublicConfig = {
  mail_mode: string;
  smtp_host: string;
  smtp_port: string;
};

type ParseResponse = {
  columns: string[];
  rows: Record<string, string>[];
  row_count: number;
};

type PreviewItem = {
  to_email: string;
  to_name?: string | null;
  subject: string;
  body: string;
  missing_placeholders: string[];
  missing_code?: boolean;
};

type PreviewResponse = { items: PreviewItem[] };

type SendResponse = {
  mode: string;
  results: { to_email: string; ok: boolean; detail: string }[];
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? JSON.stringify(data.detail)
          : text || `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data as T;
}

function guessEmailColumn(columns: string[], rows: Record<string, string>[]): string {
  const t = (s: string) => s.trim();
  const byHeader =
    columns.find((c) => /^e-?mail$/i.test(t(c))) ||
    columns.find((c) => /e-?mail|email|posta|mail\s*c(i|í)m/i.test(c));
  if (byHeader) return byHeader;

  const sample = rows.slice(0, Math.min(rows.length, 20));
  let best = "";
  let bestScore = 0;
  for (const col of columns) {
    const vals = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (!vals.length) continue;
    const withAt = vals.filter((v) => v.includes("@")).length;
    const score = withAt / vals.length;
    if (score > bestScore) {
      bestScore = score;
      best = col;
    }
  }
  if (bestScore >= 0.25) return best;
  return "";
}

function guessNameColumn(columns: string[], emailCol: string): string {
  const rest = columns.filter((c) => c !== emailCol);
  const hit = rest.find((c) => /név|name|nev|teljes\s*név/i.test(c));
  return hit ?? "";
}

/** Kód / Clifton / azonosító oszlop — nem az e-mail és nem a név. */
function guessCodeColumn(
  columns: string[],
  rows: Record<string, string>[],
  emailCol: string,
  nameCol: string,
): string {
  const skip = new Set([emailCol, nameCol].filter(Boolean));
  const rest = columns.filter((c) => !skip.has(c));
  const byHeader = rest.find((c) => /kód|clifton|code|azonosít|pin|token|kulcs/i.test(c));
  if (byHeader) return byHeader;

  const sample = rows.slice(0, 10);
  let best = "";
  let bestScore = 0;
  for (const col of rest) {
    const vals = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (!vals.length) continue;
    const longish = vals.filter((v) => v.length >= 8 && /^[0-9A-Z]+$/i.test(v)).length;
    const score = longish / vals.length;
    if (score > bestScore) {
      bestScore = score;
      best = col;
    }
  }
  if (bestScore >= 0.2) return best;
  if (rest.length === 1) return rest[0];
  return "";
}

function emailColumnValidationMessage(
  rows: Record<string, string>[],
  emailColumn: string,
): string | null {
  if (!emailColumn || !rows.length) return null;
  const sample = rows.slice(0, 8).map((r) => (r[emailColumn] ?? "").trim()).filter(Boolean);
  if (!sample.length) return "Az e-mail oszlop első sorai üresek.";
  const withoutAt = sample.filter((v) => !v.includes("@"));
  if (withoutAt.length === sample.length) {
    return (
      "A 2. lépésben valószínűleg rossz oszlop van kiválasztva: a mintasorokban nincs @. " +
      "Válaszd az e-mail címek oszlopát (nem a nevet)."
    );
  }
  return null;
}

function labelsForMissingCode(
  rows: Record<string, string>[],
  codeColumn: string,
  nameColumn: string,
  emailColumn: string,
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if ((r[codeColumn] ?? "").trim()) continue;
    const name = nameColumn ? (r[nameColumn] ?? "").trim() : "";
    const em = (r[emailColumn] ?? "").trim();
    out.push(name || em || "névtelen sor");
  }
  return out;
}

export default function App() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");
  const [pasteText, setPasteText] = useState("");

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [codeColumn, setCodeColumn] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("Online teszt – értesítés");
  const [template, setTemplate] = useState(
    "Szia {Név},\n\n" + "A teszthez a kódod: {Kód}\n\n" + "Üdvözlettel,",
  );

  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [sendLog, setSendLog] = useState<SendResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<PublicConfig>("/api/config")
      .then((c) => {
        if (!cancelled) setCfg(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function applyImport(parsed: ParseResponse) {
    setColumns(parsed.columns);
    setRows(parsed.rows);
    const em = guessEmailColumn(parsed.columns, parsed.rows);
    const nm = guessNameColumn(parsed.columns, em);
    const cd = guessCodeColumn(parsed.columns, parsed.rows, em, nm);
    setEmailColumn(em);
    setNameColumn(nm);
    setCodeColumn(cd);
  }

  const emailColumnHint = useMemo(
    () => emailColumnValidationMessage(rows, emailColumn),
    [rows, emailColumn],
  );

  const missingCodeLabels = useMemo(() => {
    if (!codeColumn || !rows.length) return [];
    return labelsForMissingCode(rows, codeColumn, nameColumn, emailColumn);
  }, [rows, codeColumn, nameColumn, emailColumn]);

  const sendOutcome = useMemo(() => {
    if (!sendLog?.results?.length) return null;
    const failed = sendLog.results.filter((r) => !r.ok);
    const ok = sendLog.results.filter((r) => r.ok);
    return {
      mode: sendLog.mode,
      allOk: failed.length === 0,
      failCount: failed.length,
      okCount: ok.length,
      total: sendLog.results.length,
    };
  }, [sendLog]);

  async function onCsv(file: File | null) {
    setGlobalError("");
    setPreview(null);
    setSendLog(null);
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const parsed = await fetchJson<ParseResponse>("/api/parse-csv", {
        method: "POST",
        body: fd,
      });
      applyImport(parsed);
    } catch (e) {
      setColumns([]);
      setRows([]);
      setEmailColumn("");
      setNameColumn("");
      setCodeColumn("");
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onParsePaste() {
    setGlobalError("");
    setPreview(null);
    setSendLog(null);
    if (!pasteText.trim()) {
      setGlobalError("Illessz be legalább a fejlécet és egy adatsort (Excel: jelöld ki a táblát, majd Ctrl+C / Cmd+C).");
      return;
    }
    setBusy(true);
    try {
      const parsed = await fetchJson<ParseResponse>("/api/parse-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      applyImport(parsed);
    } catch (e) {
      setColumns([]);
      setRows([]);
      setEmailColumn("");
      setNameColumn("");
      setCodeColumn("");
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyTemplateFromColumns() {
    if (!nameColumn || !codeColumn) {
      setGlobalError("A 3. és 4. lépésben válaszd ki a név- és a kód oszlopot, utána újra próbáld.");
      return;
    }
    setGlobalError("");
    setTemplate(
      `Szia {${nameColumn}},\n\n` + `A teszthez a kódod: {${codeColumn}}\n\n` + `Üdvözlettel,`,
    );
  }

  async function onPreview() {
    setGlobalError("");
    setSendLog(null);
    if (!rows.length) {
      setGlobalError("1. lépés: tölts fel fájlt, vagy illessz be táblázatot, majd „Beolvasás”.");
      return;
    }
    if (!emailColumn) {
      setGlobalError("2. lépés: válaszd ki, melyik oszlop az e-mail cím (hova küldjünk).");
      return;
    }
    if (!codeColumn) {
      setGlobalError("4. lépés: válaszd ki a kód oszlopot (mit tegyen a kódsorba).");
      return;
    }
    const colHint = emailColumnValidationMessage(rows, emailColumn);
    if (colHint) {
      setGlobalError(colHint);
      return;
    }
    setBusy(true);
    try {
      const res = await fetchJson<PreviewResponse>("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          subject_template: subjectTemplate,
          rows,
          email_column: emailColumn,
          name_column: nameColumn || null,
          code_column: codeColumn,
          limit: 25,
        }),
      });
      setPreview(res.items);
    } catch (e) {
      setPreview(null);
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSend() {
    setGlobalError("");
    if (!rows.length) {
      setGlobalError("1. lépés: nincs betöltött táblázat.");
      return;
    }
    if (!emailColumn) {
      setGlobalError("2. lépés: válaszd ki az e-mail oszlopot.");
      return;
    }
    if (!codeColumn) {
      setGlobalError("4. lépés: válaszd ki a kód oszlopot.");
      return;
    }
    const colHintSend = emailColumnValidationMessage(rows, emailColumn);
    if (colHintSend) {
      setGlobalError(colHintSend);
      return;
    }
    if (missingCodeLabels.length) {
      setGlobalError(
        `Küldés nem indul: ${missingCodeLabels.length} sorban nincs kód a „${codeColumn}” oszlopban. ` +
          `Például: ${missingCodeLabels.slice(0, 4).join(", ")}. ` +
          `Töltsd ki a kódot, vagy töröld ezeket a sorokat a táblázatból.`,
      );
      return;
    }

    if (cfg?.mail_mode === "live") {
      const ok = window.confirm(
        "A szerver LIVE módban van. A levelek a kiválasztott e-mail oszlop címeire mennek. Folytatod?",
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await fetchJson<SendResponse>("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          subject_template: subjectTemplate,
          rows,
          email_column: emailColumn,
          name_column: nameColumn || null,
          code_column: codeColumn,
        }),
      });
      setSendLog(res);
    } catch (e) {
      setSendLog(null);
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function insertPlaceholder(col: string) {
    const token = `{${col}}`;
    setTemplate((t) => (t.endsWith("\n") || t.length === 0 ? t + token : t + token));
  }

  const modeBadge =
    cfg?.mail_mode === "live" ? (
      <span className="badge badge-live">mód: live</span>
    ) : cfg?.mail_mode === "sandbox" ? (
      <span className="badge badge-ok">mód: sandbox</span>
    ) : (
      <span className="badge">mód: dry-run</span>
    );

  return (
    <div className="shell">
      <header>
        <h1>D2E – e-mail automatizáció</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {modeBadge}
          {cfg ? (
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              SMTP: {cfg.smtp_host}:{cfg.smtp_port}
            </span>
          ) : null}
        </div>
      </header>

      <section className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>Folyamat:</strong>
        </p>
        <ol className="flow-lead muted">
          <li>
            <strong>Táblázat</strong> — CSV fájl vagy Excelből kimásolt táblázat (fejléc + sorok).
          </li>
          <li>
            <strong>E-mail oszlop</strong> — melyik fejléc alatt vannak a címzettek (ide megy a levél).
          </li>
          <li>
            <strong>Név oszlop</strong> — kinek szól a szöveg a sablon <code>{"{…}"}</code> helyén.
          </li>
          <li>
            <strong>Kód oszlop</strong> — melyik cella megy a kódsorba;{" "}
            <strong>üres kódnál nem indul a küldés</strong> (előtte javítsd a listát).
          </li>
        </ol>
      </section>

      {missingCodeLabels.length > 0 ? (
        <div className="panel warn-banner">
          <strong>Figyelem:</strong> {missingCodeLabels.length} résztvevőnek nincs kitöltve a „
          {codeColumn}” oszlop (pl. {missingCodeLabels.slice(0, 3).join(", ")}
          ). Küldés csak akkor engedélyezett, ha minden sorban van kód — vagy töröld a hiányos sorokat.
        </div>
      ) : null}

      <section className="panel">
        <h2 className="step-title">1. Táblázat betöltése</h2>
        <label htmlFor="csv">Fájl (CSV)</label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => void onCsv(e.target.files?.[0] ?? null)}
        />
        <p className="muted" style={{ marginTop: "0.65rem" }}>
          Vagy másold ki az Excelből (fejléc + sorok), és illeszd be ide — tabbal elválasztott, ahogy az
          Excel másolja:
        </p>
        <textarea
          id="paste"
          rows={8}
          placeholder={"Név\tEmail\tClifton kód\nKiss Anna\tanna@pelda.hu\tABCD1234…"}
          value={pasteText}
          disabled={busy}
          onChange={(e) => setPasteText(e.target.value)}
          style={{ marginTop: "0.35rem" }}
        />
        <div className="row-actions" style={{ marginTop: "0.5rem" }}>
          <button type="button" className="primary" disabled={busy} onClick={() => void onParsePaste()}>
            Beolvasás (beillesztett szöveg)
          </button>
        </div>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Teszt fájlok: <code>fixtures/participants_fake.csv</code> (minden rendben),{" "}
          <code>fixtures/participants_test_errors.csv</code> (szándékos hiba: egy sorban érvénytelen e-mail — küldés/dry
          run közben látszik). Üres kód teszt: hiányos „Kód” cellát adj a táblázathoz. Éles névsor ne
          kerüljön nyilvános repóba.
        </p>
        {rows.length ? (
          <p className="muted" style={{ marginTop: "0.35rem" }}>
            Beolvasva: <strong>{rows.length}</strong> adatsor | oszlopok:{" "}
            <strong>{columns.join(", ")}</strong>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="step-title">2. E-mail oszlop (címzett — hova küldjünk)</h2>
        <label htmlFor="emailCol">Oszlop neve a táblázatban</label>
        <select
          id="emailCol"
          value={emailColumn}
          disabled={!columns.length || busy}
          onChange={(e) => setEmailColumn(e.target.value)}
        >
          <option value="">— válassz —</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {emailColumnHint ? (
          <p className="error" style={{ marginTop: "0.45rem", fontSize: "0.92rem" }}>
            {emailColumnHint}
          </p>
        ) : rows.length && emailColumn ? (
          <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.88rem" }}>
            Minta (első sor): <code>{(rows[0][emailColumn] ?? "").slice(0, 80) || "üres"}</code>
          </p>
        ) : null}

        <h2 className="step-title" style={{ marginTop: "1.1rem" }}>
          3. Név oszlop (megszólítás a levélben)
        </h2>
        <label htmlFor="nameCol">Melyik oszlop tartalmazza a teljes nevet?</label>
        <select
          id="nameCol"
          value={nameColumn}
          disabled={!columns.length || busy}
          onChange={(e) => setNameColumn(e.target.value)}
        >
          <option value="">— nincs kiválasztva —</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.88rem" }}>
          A levélszövegben ugyanilyen fejlécnevet használj kapcsos zárójelben, pl. ha innen választod a „
          {nameColumn || "Név"}” oszlopot, írd a sablonba: <code>{"{" + (nameColumn || "Név") + "}"}</code>
        </p>

        <h2 className="step-title" style={{ marginTop: "1.1rem" }}>
          4. Kód oszlop (tesztkód / Clifton — mit írjunk a kódsorba)
        </h2>
        <label htmlFor="codeCol">Melyik oszlop a személyre szóló kód?</label>
        <select
          id="codeCol"
          value={codeColumn}
          disabled={!columns.length || busy}
          onChange={(e) => setCodeColumn(e.target.value)}
        >
          <option value="">— válassz —</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {rows.length && codeColumn ? (
          <p className="muted" style={{ marginTop: "0.35rem", fontSize: "0.88rem" }}>
            Minta kód (első sor): <code>{(rows[0][codeColumn] ?? "").slice(0, 40) || "üres — ez gond lehet"}</code>
          </p>
        ) : null}

        <div className="row-actions" style={{ marginTop: "0.75rem" }}>
          <button type="button" disabled={busy || !nameColumn || !codeColumn} onClick={applyTemplateFromColumns}>
            Sablon kitöltése a kiválasztott oszlopnevekkel
          </button>
        </div>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Egyéb mezők (pl. csoport) szintén beírhatók a levélbe: a fejléc nevét tedd kapcsos zárójelbe.{" "}
          <strong>A kisbetű/nagybetű nem számít</strong> a párosításnál.
        </p>

        {columns.length ? (
          <div>
            <div className="muted" style={{ marginTop: "0.5rem" }}>
              Helyőrző beszúrása a levél végére (kattints):
            </div>
            <div className="chips">
              {columns.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => insertPlaceholder(c)}
                >
                  {"{" + c + "}"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="step-title">Levél szövege</h2>
        <label htmlFor="subj">Tárgy sablon</label>
        <input
          id="subj"
          type="text"
          value={subjectTemplate}
          disabled={busy}
          onChange={(e) => setSubjectTemplate(e.target.value)}
        />

        <label htmlFor="body">Szöveg (plain text + {"{oszlopnevek}"})</label>
        <textarea id="body" value={template} disabled={busy} onChange={(e) => setTemplate(e.target.value)} />

        <div className="row-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void onPreview()}>
            Előnézet
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void onSend()}>
            Küldés (szerver mód szerint)
          </button>
        </div>
        {globalError ? (
          <div className="panel error" style={{ marginTop: "0.75rem" }}>
            {globalError}
          </div>
        ) : null}
        <p className="muted" style={{ marginTop: "0.6rem" }}>
          <strong>dry-run:</strong> nem megy SMTP; <strong>sandbox:</strong> összes tesztlevél egy biztonságos
          címre; <strong>live:</strong> valódi címzettek.
        </p>
      </section>

      {preview?.length ? (
        <section className="panel preview">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Előnézet (első {preview.length} sor)</h2>
          <table>
            <thead>
              <tr>
                <th>Címzett</th>
                <th>Kód</th>
                <th>Tárgy</th>
                <th>Helyőrző</th>
                <th>Szöveg (rövidítve)</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, idx) => (
                <tr key={idx} className={p.missing_code ? "row-warn" : undefined}>
                  <td>
                    {p.to_name ? `${p.to_name} ` : ""}
                    <code>{p.to_email}</code>
                  </td>
                  <td>{p.missing_code ? "HIÁNYZIK" : "OK"}</td>
                  <td>{p.subject}</td>
                  <td>{p.missing_placeholders.length ? p.missing_placeholders.join(", ") : "—"}</td>
                  <td>
                    <pre>{p.body.length > 500 ? p.body.slice(0, 500) + "…" : p.body}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {sendOutcome && sendLog?.results?.length ? (
        <>
          {sendOutcome.allOk ? (
            <div className="panel panel-success">
              {sendOutcome.mode === "dry-run" ? (
                <>
                  <strong>Dry run sikeres</strong>
                  Mind a(z) {sendOutcome.total} sor rendben lenne (tárgy + szöveg validálva); SMTP nem futott, egyetlen
                  levél sem ment ki.
                </>
              ) : sendOutcome.mode === "sandbox" ? (
                <>
                  <strong>Küldés kész (sandbox)</strong>
                  {sendOutcome.total} levél ment a sandbox címre — nem az eredeti címzettek postafiókjába.
                </>
              ) : (
                <>
                  <strong>Küldés kész (live)</strong>
                  {sendOutcome.total} levél elküldve a megadott e-mail oszlop szerint.
                </>
              )}
            </div>
          ) : (
            <div className="panel panel-partial">
              <strong>Volt hiba</strong>
              {sendOutcome.failCount} sor nem rendben ({sendOutcome.okCount} sor OK). A „Részlet” oszlopban látszik az ok —
              gyakori: üres kód, rosszul kiválasztott e-mail oszlop (nincs @), hiányzó helyőrző a sablonban.
            </div>
          )}

          <section className="panel">
            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Küldés napló (mód: {sendLog.mode})</h2>
            <table>
            <thead>
              <tr>
                <th>Címzett</th>
                <th>Eredmény</th>
                <th>Részlet</th>
              </tr>
            </thead>
            <tbody>
              {sendLog.results.map((r, idx) => (
                <tr key={idx + r.to_email + r.detail.slice(0, 40)}>
                  <td>
                    <code>{r.to_email}</code>
                  </td>
                  <td>{r.ok ? "OK" : "HIBA"}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
