import { useState } from 'react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import { api } from '../lib/api';

const TEMPLATE_HEADERS = [
  'name',
  'mobile',
  'email'
];

const PREVIEW_LIMIT = 10;
const BATCH_THRESHOLD = 100;
const BATCH_SIZE = 50;

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildTemplateCsv() {
  const demoRow = {
    name: 'Demo Employee',
    mobile: '9000000000',
    email: 'demo.employee@example.com'
  };
  const lines = [
    TEMPLATE_HEADERS.join(','),
    TEMPLATE_HEADERS.map(h => csvEscape(demoRow[h])).join(',')
  ];
  return lines.join('\n') + '\n';
}

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ACCEPT_ATTR = [
  '.xlsx',
  '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
].join(',');

function normalizeHeaderKey(k) {
  return String(k).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function looksCsv(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.csv') || type === 'text/csv' || type === 'application/csv';
}

function looksXlsx(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return name.endsWith('.xlsx')
    || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || type === 'application/vnd.ms-excel';
}

async function parseCsvFile(file) {
  const text = await file.text();
  return parseCsvText(text);
}

function parseCsvText(text) {
  const { data, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => normalizeHeaderKey(String(h ?? ''))
  });
  const fatal = errors.find(e => e.type === 'Quotes' || e.type === 'FieldMismatch');
  if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
  return (data || []).map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k) continue;
      out[k] = v ?? '';
    }
    return out;
  });
}

async function parseXlsxFile(file) {
  const matrix = await readXlsxFile(file);
  if (!matrix.length) return [];
  const headers = matrix[0].map(c => normalizeHeaderKey(String(c ?? '')));
  return matrix.slice(1).map(row => {
    const out = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;
      let value = row[i] ?? '';
      if (value instanceof Date) {
        const mm = String(value.getMonth() + 1).padStart(2, '0');
        const dd = String(value.getDate()).padStart(2, '0');
        value = `${value.getFullYear()}-${mm}-${dd}`;
      }
      out[h] = value;
    }
    return out;
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function BulkUploadModal({ clientId, onClose, onDone }) {
  const [sourceLabel, setSourceLabel] = useState('');
  const [pastedCsv, setPastedCsv] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [parsing, setParsing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total }
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const resetResults = () => {
    setResult(null);
    setError(null);
    setProgress(null);
  };

  const onChooseFile = async (e) => {
    const selected = e.target.files?.[0] ?? null;
    setSourceLabel('');
    setRows([]);
    setParseError(null);
    resetResults();

    if (!selected) return;

    const isCsv = looksCsv(selected);
    const isXlsx = looksXlsx(selected);
    if (!isCsv && !isXlsx) {
      setParseError('Only .xlsx and .csv files are supported.');
      return;
    }

    setParsing(true);
    try {
      const parsed = isCsv ? await parseCsvFile(selected) : await parseXlsxFile(selected);
      setSourceLabel(selected.name || 'file');
      setRows(parsed);
      if (parsed.length === 0) {
        setParseError('The file has no data rows.');
      }
    } catch (err) {
      setParseError(err.message || 'Could not read the file.');
    } finally {
      setParsing(false);
    }
  };

  const onParsePastedCsv = () => {
    setSourceLabel('');
    setRows([]);
    setParseError(null);
    resetResults();
    if (!pastedCsv.trim()) {
      setParseError('Paste CSV text first.');
      return;
    }
    setParsing(true);
    try {
      const parsed = parseCsvText(pastedCsv);
      setRows(parsed);
      setSourceLabel('Pasted CSV');
      if (parsed.length === 0) {
        setParseError('The pasted CSV has no data rows.');
      }
    } catch (err) {
      setParseError(err.message || 'Could not parse pasted CSV.');
    } finally {
      setParsing(false);
    }
  };

  const onDownloadTemplate = () => {
    const csv = buildTemplateCsv();
    triggerDownload('employee-upload-template.csv', csv, 'text/csv;charset=utf-8');
  };

  const onUpload = async (e) => {
    e.preventDefault();
    if (!rows.length) {
      setError('No rows to upload. Pick a file first.');
      return;
    }
    resetResults();
    setSubmitting(true);

    const batches = rows.length > BATCH_THRESHOLD ? chunk(rows, BATCH_SIZE) : [rows];
    let inserted = 0;
    let skipped = 0;
    const errors = [];
    let rowOffset = 0; // to report original spreadsheet row numbers (1-based incl. header)

    try {
      for (let i = 0; i < batches.length; i++) {
        setProgress({ current: i + 1, total: batches.length });
        const batch = batches[i];
        const res = await api.createEmployee({ client_id: clientId, employees: batch });
        inserted += res.inserted ?? 0;
        skipped += res.skipped ?? 0;
        for (const err of (res.errors || [])) {
          const originalIndex = rowOffset + (err.index ?? 0);
          errors.push({ row: originalIndex + 2, errors: err.errors });
        }
        rowOffset += batch.length;
      }
      setResult({ inserted, skipped, errors });
      if (inserted > 0) onDone();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const previewRows = rows.slice(0, PREVIEW_LIMIT);
  const willBatch = rows.length > BATCH_THRESHOLD;
  const batchCount = willBatch ? Math.ceil(rows.length / BATCH_SIZE) : 1;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Bulk Upload Available Employees</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700" aria-label="Close">x</button>
        </div>

        <form onSubmit={onUpload} className="px-5 py-4 space-y-4 overflow-auto">
          <div className="text-sm text-slate-600 space-y-2">
            <p>
              Upload an Excel (<code>.xlsx</code>) or CSV (<code>.csv</code>) file. Required columns:
            </p>
            <code className="block text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700">
              {TEMPLATE_HEADERS.join(', ')}
            </code>
            <p className="text-xs text-slate-500">
              Optional columns: <code>designation</code>, <code>date_of_joining</code>, <code>ctc_type</code>, <code>ctc_value</code>.
            </p>
            <p className="text-xs">
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
              >
                Download template (.csv)
              </button>
              {' '}with the correct headers and one demo row.
            </p>
          </div>

          <input
            type="file"
            accept={ACCEPT_ATTR}
            onChange={onChooseFile}
            disabled={submitting}
            className="text-sm"
          />

          <div className="pt-1 border-t border-slate-100">
            <p className="text-sm text-slate-600 mb-2">
              Or paste comma-separated values directly:
            </p>
            <textarea
              value={pastedCsv}
              onChange={(e) => setPastedCsv(e.target.value)}
              disabled={submitting}
              rows={7}
              placeholder="name,mobile,email&#10;John Doe,9000001001,john@example.com"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="mt-2">
              <button
                type="button"
                onClick={onParsePastedCsv}
                disabled={submitting}
                className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Use Pasted CSV
              </button>
            </div>
          </div>

          {parsing && (
            <div className="text-sm text-slate-500">Reading file...</div>
          )}

          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {parseError}
            </div>
          )}

          {rows.length > 0 && !parseError && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-900">
                  Preview (first {Math.min(PREVIEW_LIMIT, rows.length)} of {rows.length} {rows.length === 1 ? 'record' : 'records'})
                </h4>
                {sourceLabel && (
                  <span className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">
                    Source: {sourceLabel}
                  </span>
                )}
                {willBatch && (
                  <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5">
                    Will upload in {batchCount} batches of up to {BATCH_SIZE}
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded overflow-auto max-h-64">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      {TEMPLATE_HEADERS.map(h => (
                        <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row, idx) => (
                      <tr key={idx}>
                        {TEMPLATE_HEADERS.map(h => (
                          <td key={h} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-500">
                Total records: <b className="text-slate-800">{rows.length}</b>
              </p>
            </div>
          )}

          {progress && (
            <div className="text-sm text-slate-700 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
              Uploading batch {progress.current} of {progress.total}...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2">
              <p className="text-slate-800">
                Inserted: <b>{result.inserted}</b> &middot; Skipped: <b>{result.skipped}</b>
              </p>
              {result.errors?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-red-700 text-xs max-h-40 overflow-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.errors.join('; ')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {result ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" disabled={submitting || !rows.length || !!parseError}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60">
              {submitting
                ? (progress ? `Uploading ${progress.current}/${progress.total}...` : 'Uploading...')
                : (willBatch ? `Upload ${rows.length} rows (${batchCount} batches)` : `Upload ${rows.length} row${rows.length === 1 ? '' : 's'}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
