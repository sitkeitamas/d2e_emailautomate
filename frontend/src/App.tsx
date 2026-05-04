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

const DEFAULT_TEMPLATE =
  "Szia {Név},\n\n" +
  "itt a személyreszóló tesztkódod: {Kód}\n\n" +
  "Üdv,\nautomata";

export default function App() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");

  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [subjectTemplate, setSubjectTemplate] = useState("Online teszt – értesítés");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

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

  const heuristicColumns = useMemo(() => {
    const em = columns.find((c) => /email|e-mail|mail/i.test(c));
    const nm = columns.find((c) => /név|name|nev/i.test(c));
    return { em, nm };
  }, [columns]);

  useEffect(() => {
    if (!emailColumn && heuristicColumns.em) setEmailColumn(heuristicColumns.em);
    if (!nameColumn && heuristicColumns.nm) setNameColumn(heuristicColumns.nm);
  }, [heuristicColumns, emailColumn, nameColumn]);

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
      setColumns(parsed.columns);
      setRows(parsed.rows);
      setEmailColumn("");
      setNameColumn("");
    } catch (e) {
      setColumns([]);
      setRows([]);
      setGlobalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    setGlobalError("");
    setSendLog(null);
    if (!rows.length) {
      setGlobalError("Előbb tölts fel CSV-t.");
      return;
    }
    if (!emailColumn) {
      setGlobalError("Válaszd ki az e-mail oszlopot.");
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
      setGlobalError("Előbb tölts fel CSV-t.");
      return;
    }
    if (!emailColumn) {
      setGlobalError("Válaszd ki az e-mail oszlopot.");
      return;
    }

    if (cfg?.mail_mode === "live") {
      const ok = window.confirm(
        "A szerver LIVE módban van. Valóban az Excel/CSV sorok címére mennek a levelek?",
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

      {globalError ? <div className="panel error">{globalError}</div> : null}

      <section className="panel">
        <label htmlFor="csv">CSV feltöltés (fejléc + sorok; elválasztó: vessző vagy pontosvessző)</label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => void onCsv(e.target.files?.[0] ?? null)}
        />
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Tesztadat: <code>fixtures/participants_fake.csv</code> (nem éles címek / kódok).
        </p>
        {rows.length ? (
          <p className="muted" style={{ marginTop: "0.35rem" }}>
            Beolvasva: <strong>{rows.length}</strong> sor, oszlopok: {columns.join(", ")}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <label htmlFor="emailCol">E-mail oszlop</label>
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

        <label htmlFor="nameCol">Név oszlop (opcionális, csak napló / jövőbeli fejléc)</label>
        <select
          id="nameCol"
          value={nameColumn}
          disabled={!columns.length || busy}
          onChange={(e) => setNameColumn(e.target.value)}
        >
          <option value="">— nincs —</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <p className="muted" style={{ marginTop: "0.6rem" }}>
          Helyőrzők: a sablonban pontosan a fejléc neve kapcsos zárójelben, pl.{" "}
          <code>{"{Név}"}</code>, <code>{"{Email}"}</code>, <code>{"{Kód}"}</code> — egyeznie kell a CSV
          első sorával (kisbetű/nagybetű nem számít).
        </p>

        {columns.length ? (
          <div>
            <div className="muted" style={{ marginTop: "0.5rem" }}>
              Kattints: beszúrás a levél végére
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
        <label htmlFor="subj">Tárgy sablon</label>
        <input
          id="subj"
          type="text"
          value={subjectTemplate}
          disabled={busy}
          onChange={(e) => setSubjectTemplate(e.target.value)}
        />

        <label htmlFor="body">Levél szövege (plain text)</label>
        <textarea id="body" value={template} disabled={busy} onChange={(e) => setTemplate(e.target.value)} />

        <div className="row-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void onPreview()}>
            Előnézet
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => void onSend()}>
            Küldés (szerver mód szerint)
          </button>
        </div>
        <p className="muted" style={{ marginTop: "0.6rem" }}>
          <strong>dry-run:</strong> nem megy SMTP; <strong>sandbox:</strong> minden levél a{" "}
          <code>SANDBOX_REDIRECT_TO</code> címre; <strong>live:</strong> a CSV e-mail oszlopa.
        </p>
      </section>

      {preview?.length ? (
        <section className="panel preview">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Előnézet (első {preview.length} sor)</h2>
          <table>
            <thead>
              <tr>
                <th>Címzett</th>
                <th>Tárgy</th>
                <th>Hiányzó</th>
                <th>Szöveg (rövidítve)</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.to_email + p.subject}>
                  <td>
                    {p.to_name ? `${p.to_name} ` : ""}
                    <code>{p.to_email}</code>
                  </td>
                  <td>{p.subject}</td>
                  <td>{p.missing_placeholders.length ? p.missing_placeholders.join(", ") : "—"}</td>
                  <td>
                    <pre>{p.body.length > 600 ? p.body.slice(0, 600) + "…" : p.body}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {sendLog?.results?.length ? (
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
              {sendLog.results.map((r) => (
                <tr key={r.to_email + r.detail}>
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
      ) : null}
    </div>
  );
}
