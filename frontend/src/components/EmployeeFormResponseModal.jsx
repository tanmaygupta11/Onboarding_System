import { useEffect, useMemo, useState } from 'react';

const HIDDEN_KEYS = new Set([
  'id',
  'employee_id',
  'client_id',
  'created_at',
  'updated_at',
  'designation',
  'submission_status',
  'aad_name'
]);

/** Strip DB column prefixes used on job_app_form so labels read naturally in the PM view */
const LABEL_PREFIXES = ['aad_', 'pd_', 'qual_', 'kyc_', 'bp_'];

function stripFieldPrefix(key) {
  const k = String(key);
  for (const p of LABEL_PREFIXES) {
    if (k.startsWith(p)) return k.slice(p.length);
  }
  return k;
}

function prettifyKey(key) {
  return stripFieldPrefix(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDisplayValue(key, val) {
  if (val === null || val === undefined) {
    return <span className="text-slate-500">Not provided</span>;
  }
  if (typeof val === 'string' && val.trim() === '') {
    return <span className="text-slate-500">Not provided</span>;
  }
  if (Array.isArray(val)) {
    const urls = val.filter((x) => typeof x === 'string' && x.trim());
    if (urls.length === 0) return <span className="text-slate-500">Not provided</span>;
    return (
      <ul className="list-inside list-disc space-y-1 text-indigo-700">
        {urls.map((u, i) => (
          <li key={`${u}-${i}`}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-indigo-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 7.5A1.5 1.5 0 017.5 6H9m7.5 9v1.5A1.5 1.5 0 0115 18H7.5A1.5 1.5 0 016 16.5V9a1.5 1.5 0 011.5-1.5H9"
                />
              </svg>
              View Document
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (typeof val === 'object') {
    return (
      <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }
  const s = String(val);
  if (/_url$/i.test(key) && /^https?:\/\//i.test(s)) {
    return (
      <a
        href={s}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 7.5A1.5 1.5 0 017.5 6H9m7.5 9v1.5A1.5 1.5 0 0115 18H7.5A1.5 1.5 0 016 16.5V9a1.5 1.5 0 011.5-1.5H9"
          />
        </svg>
        View Document
      </a>
    );
  }
  return s;
}

function hasProvidedValue(key, val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.some((x) => typeof x === 'string' && x.trim());
  return true;
}

const ORDERED_FIELDS = [
  // Aadhaar snapshot / verified profile
  'name',
  'mobile',
  'email',
  'aadhaar_number',
  'aad_profile_photo',
  'aad_name',
  'aad_care_of',
  'aad_dob',
  'aad_gender',
  'aad_address',
  'aad_state',
  'aad_district',
  'aad_pincode',
  // Personal info
  'pd_alternate_number',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'pd_city',
  'pd_age',
  // Qualification
  'qual_highest_qualification',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  // KYC
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_passbook_url',
  // Bank & Photo
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_police_verification_url'
];

const DOCUMENT_TAB_DEFINITIONS = [
  { key: 'aad_profile_photo', label: 'Profile Photo' },
  { key: 'kyc_aadhar_front_url', label: 'Aadhaar Front' },
  { key: 'kyc_aadhar_back_url', label: 'Aadhaar Back' },
  { key: 'qual_education_certificate_url', label: 'Education' },
  { key: 'qual_additional_certificates_url', label: 'Additional Cert' },
  { key: 'kyc_bank_passbook_url', label: 'Bank Passbook' },
  { key: 'kyc_pan_card_url', label: 'PAN Card' },
  { key: 'pd_driving_license_url', label: 'Driving Lic' },
  { key: 'bp_passport_photo_url', label: 'Photo' },
  { key: 'bp_police_verification_url', label: 'Police Verification' }
];

const DOCUMENT_FIELD_KEYS = new Set(DOCUMENT_TAB_DEFINITIONS.map((item) => item.key));

const PM_MARKABLE_FIELDS = new Set([
  'pd_alternate_number',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'qual_highest_qualification',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_passbook_url',
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_police_verification_url'
]);

function sectionNameForField(key) {
  if (key === 'bp_passport_photo_url') return 'Photo';
  if (key === 'bp_esic_number' || key === 'bp_pf_uan_number') return 'Employement History';
  if (key === 'bp_police_verification_url') return 'Security Check';
  if (key === 'name' || key === 'mobile' || key === 'email' || key === 'aadhaar_number' || key.startsWith('aad_')) {
    return 'Basic Information';
  }
  if (key.startsWith('pd_')) return 'Personal Info';
  if (key.startsWith('qual_')) return 'Qualification';
  if (key.startsWith('kyc_')) return 'KYC Documents';
  if (key.startsWith('bp_')) return 'Bank & Photo';
  return null;
}

function sortedFormKeys(form) {
  const base = ORDERED_FIELDS.filter((k) => !HIDDEN_KEYS.has(k));
  if (!form || typeof form !== 'object') return base;
  return base;
}

function inferImageMimeFromBase64(value) {
  const v = String(value ?? '');
  if (v.startsWith('/9j/')) return 'image/jpeg';
  if (v.startsWith('iVBOR')) return 'image/png';
  if (v.startsWith('R0lGOD')) return 'image/gif';
  if (v.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function isLikelyBase64(value) {
  if (typeof value !== 'string') return false;
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 120) return false;
  if (compact.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(compact);
}

function normalizeDocumentSource(fieldKey, value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return trimmed;
  if (fieldKey === 'aad_profile_photo' && isLikelyBase64(trimmed)) {
    const compact = trimmed.replace(/\s+/g, '');
    return `data:${inferImageMimeFromBase64(compact)};base64,${compact}`;
  }
  return trimmed;
}

function normalizeDocumentUrls(fieldKey, value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDocumentSource(fieldKey, item))
      .filter((item) => typeof item === 'string' && item.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [normalizeDocumentSource(fieldKey, value)].filter(Boolean);
  }
  return [];
}

function previewKindForUrl(url) {
  const raw = String(url ?? '').toLowerCase();
  if (raw.startsWith('data:image/')) return 'image';
  if (raw.startsWith('data:application/pdf')) return 'pdf';
  const safe = raw
    .toLowerCase()
    .split('#')[0]
    .split('?')[0];
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(safe)) return 'image';
  if (/\.pdf$/.test(safe)) return 'pdf';
  return 'other';
}

function IconCross({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function FieldIncorrectToggle({ fieldLabel, mark, onToggle }) {
  const isIncorrect = mark === 'incorrect';
  return (
    <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`Verify ${fieldLabel}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isIncorrect}
        aria-label={isIncorrect ? `Unmark ${fieldLabel} as incorrect` : `Mark ${fieldLabel} as incorrect`}
        title={isIncorrect ? 'Marked incorrect' : 'Mark as incorrect'}
        className={`group relative inline-flex items-center justify-center rounded-lg border p-2 transition-colors ${
          isIncorrect
            ? 'border-rose-300 bg-rose-100 text-rose-800'
            : 'border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700'
        }`}
      >
        <IconCross className="h-3.5 w-3.5" />
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md group-hover:block">
          Mark as wrong
        </span>
      </button>
    </div>
  );
}

export default function EmployeeFormResponseModal({
  open,
  onClose,
  employeeName,
  loading,
  error,
  form,
  previousCorrectionRejectedFields = [],
  onDecision,
  deciding = false,
  reviewMode = 'program_manager',
  pmApproverName = null
}) {
  const isPayrollMode = reviewMode === 'payroll';
  const [fieldMarks, setFieldMarks] = useState({});
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [activeDecision, setActiveDecision] = useState(null);
  const [activeDocumentTabId, setActiveDocumentTabId] = useState('');

  useEffect(() => {
    if (open) {
      if (isPayrollMode) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFieldMarks({});
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFieldMarks({});
      }
      setDecisionReason('');
      setDecisionError('');
      setActiveDecision(null);
    }
  }, [open, form, previousCorrectionRejectedFields, isPayrollMode]);

  const keys = useMemo(() => (form && typeof form === 'object' ? sortedFormKeys(form) : []), [form]);
  const documentTabs = useMemo(() => {
    if (!form || typeof form !== 'object') return [];
    const tabs = [];
    for (const def of DOCUMENT_TAB_DEFINITIONS) {
      const urls = normalizeDocumentUrls(def.key, form[def.key]);
      const suffixNeeded = urls.length > 1;
      urls.forEach((url, index) => {
        tabs.push({
          id: `${def.key}-${index}`,
          fieldKey: def.key,
          label: suffixNeeded ? `${def.label} ${index + 1}` : def.label,
          url
        });
      });
    }
    return tabs;
  }, [form]);
  const activeDocumentTab = useMemo(
    () => documentTabs.find((tab) => tab.id === activeDocumentTabId) ?? null,
    [documentTabs, activeDocumentTabId]
  );

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveDocumentTabId((prev) => {
      if (documentTabs.some((tab) => tab.id === prev)) return prev;
      return documentTabs[0]?.id ?? '';
    });
  }, [open, documentTabs]);

  const grouped = useMemo(() => {
    const groups = [];
    let lastSection = null;
    for (const key of keys.filter((item) => !DOCUMENT_FIELD_KEYS.has(item))) {
      const section = sectionNameForField(key);
      if (!section) continue;
      if (section !== lastSection) {
        groups.push({ title: section, keys: [key] });
        lastSection = section;
      } else {
        groups[groups.length - 1].keys.push(key);
      }
    }
    return groups;
  }, [keys]);

  const setIncorrect = (key) => {
    setFieldMarks((prev) => {
      if (prev[key] === 'incorrect') {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: 'incorrect' };
    });
    setDecisionError('');
  };

  const reviewableKeys = keys.filter((k) => PM_MARKABLE_FIELDS.has(k) && hasProvidedValue(k, form?.[k]));
  const incorrectFieldKeys = reviewableKeys.filter((k) => fieldMarks[k] === 'incorrect');
  const incorrectFieldLabels = incorrectFieldKeys.map((k) => prettifyKey(k));

  const submitDecision = async (decisionStatus) => {
    if (!onDecision || deciding) return;
    if (decisionStatus === 'APPROVED' && incorrectFieldLabels.length > 0) {
      setDecisionError(`Please verify this field first: ${incorrectFieldLabels.join(', ')}`);
      return;
    }
    if ((decisionStatus === 'REJECTED' || decisionStatus === 'CORRECTION_REQUESTED') && !decisionReason.trim()) {
      setDecisionError('Please add a reason before continuing.');
      return;
    }
    if (isPayrollMode && decisionStatus === 'CORRECTION_REQUESTED') {
      setDecisionError('Invalid decision.');
      return;
    }
    if (decisionStatus === 'CORRECTION_REQUESTED' && incorrectFieldKeys.length === 0) {
      setDecisionError('Please cross at least one field to request correction.');
      return;
    }
    const completeFieldMarks = Object.fromEntries(
      reviewableKeys.map((key) => [key, fieldMarks[key] === 'incorrect' ? 'incorrect' : 'correct'])
    );
    setDecisionError('');
    await onDecision({
      decision_status: decisionStatus,
      decision_reason: decisionReason.trim() || null,
      rejected_fields: decisionStatus === 'CORRECTION_REQUESTED' ? incorrectFieldKeys : [],
      field_marks: completeFieldMarks
    });
  };

  const chooseDecision = (decisionStatus) => {
    if (deciding) return;
    setDecisionError('');
    setActiveDecision(decisionStatus);
    if (!isPayrollMode && decisionStatus !== 'REJECTED' && decisionStatus !== 'CORRECTION_REQUESTED') {
      setDecisionReason('');
    }
    if (isPayrollMode && decisionStatus !== 'REJECTED') {
      setDecisionReason('');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 transition-opacity"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(90vh,760px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">
              {isPayrollMode ? 'Payroll Lead review' : 'Application response'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-slate-600">{employeeName}</p>
            {!isPayrollMode && (
              <p className="mt-0.5 text-xs text-slate-500">
                Submission Attempt Count:{' '}
                <span className="font-semibold text-slate-700">{form?.submission_attempt_count ?? 1}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start sm:gap-3">
            {isPayrollMode && pmApproverName && (
              <div className="max-w-[min(200px,42vw)] text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Approved by PM
                </p>
                <p className="truncate text-sm font-semibold text-slate-900" title={pmApproverName}>
                  {pmApproverName}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading && <p className="text-sm text-slate-600">Loading application…</p>}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}
          {!loading && !error && form && keys.length === 0 && (
            <p className="text-sm text-slate-600">No saved field data on this application.</p>
          )}
          {!loading && !error && form && keys.length > 0 && (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="max-h-[min(58vh,560px)] space-y-5 overflow-y-auto pr-1">
                {grouped.map((group) => (
                  <section key={group.title} className="rounded-xl border border-slate-200 bg-slate-50/60">
                    <div className="border-b border-slate-200 px-4 py-2.5">
                      <h3 className="text-sm font-semibold text-slate-800">{group.title}</h3>
                    </div>
                    <dl className="divide-y divide-slate-100 px-4">
                      {group.keys.map((key) => {
                        const label = prettifyKey(key);
                        const provided = hasProvidedValue(key, form[key]);
                        const markable = PM_MARKABLE_FIELDS.has(key);
                        return (
                          <div key={key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-4">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                            <dd className="flex min-w-0 flex-col gap-2 text-sm text-slate-900 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                              <div className="min-w-0 flex-1 break-all">{formatDisplayValue(key, form[key])}</div>
                              {provided && markable && (
                                <FieldIncorrectToggle
                                  fieldLabel={label}
                                  mark={fieldMarks[key]}
                                  onToggle={() => setIncorrect(key)}
                                />
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto border-b border-slate-200 bg-slate-50">
                  <div className="flex min-w-max items-center px-2">
                    {documentTabs.length === 0 && (
                      <p className="px-2 py-3 text-sm text-slate-500">No uploaded documents.</p>
                    )}
                    {documentTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveDocumentTabId(tab.id)}
                        className={`border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                          tab.id === activeDocumentTabId
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  {activeDocumentTab &&
                    PM_MARKABLE_FIELDS.has(activeDocumentTab.fieldKey) &&
                    hasProvidedValue(activeDocumentTab.fieldKey, form?.[activeDocumentTab.fieldKey]) && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Verify {prettifyKey(activeDocumentTab.fieldKey)}
                        </p>
                        <FieldIncorrectToggle
                          fieldLabel={prettifyKey(activeDocumentTab.fieldKey)}
                          mark={fieldMarks[activeDocumentTab.fieldKey]}
                          onToggle={() => setIncorrect(activeDocumentTab.fieldKey)}
                        />
                      </div>
                    )}

                  {activeDocumentTab && (
                    <div className="relative h-[440px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <a
                        href={activeDocumentTab.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open document in new tab"
                        title="Open in new tab"
                        className="absolute right-2 top-2 z-10 inline-flex rounded-md border border-slate-200 bg-white/95 p-1.5 text-slate-600 shadow-sm transition hover:bg-white hover:text-indigo-700"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5" />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 7.5A1.5 1.5 0 017.5 6H9m7.5 9v1.5A1.5 1.5 0 0115 18H7.5A1.5 1.5 0 016 16.5V9a1.5 1.5 0 011.5-1.5H9"
                          />
                        </svg>
                      </a>
                      {previewKindForUrl(activeDocumentTab.url) === 'image' && (
                        <div className="flex min-h-full items-start justify-center">
                          <img
                            src={activeDocumentTab.url}
                            alt={activeDocumentTab.label}
                            className="h-auto max-w-full rounded"
                          />
                        </div>
                      )}
                      {previewKindForUrl(activeDocumentTab.url) === 'pdf' && (
                        <iframe
                          src={activeDocumentTab.url}
                          title={activeDocumentTab.label}
                          className="h-full w-full rounded bg-white"
                        />
                      )}
                      {previewKindForUrl(activeDocumentTab.url) === 'other' && (
                        <div className="flex h-full items-center justify-center">
                          <div className="space-y-2 text-center">
                          <p className="text-sm text-slate-600">Preview is not available for this file type.</p>
                          <a
                            href={activeDocumentTab.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                          >
                            Open document in new tab
                          </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="mb-3 space-y-2">
            {decisionError && <p className="text-sm text-rose-700">{decisionError}</p>}
            {!decisionError && incorrectFieldLabels.length > 0 && (
              <p className="text-xs text-rose-700">
                Marked incorrect: {incorrectFieldLabels.slice(0, 3).join(', ')}
                {incorrectFieldLabels.length > 3 ? ` +${incorrectFieldLabels.length - 3} more` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!activeDecision && (
              <>
                <button
                  type="button"
                  onClick={() => chooseDecision('REJECTED')}
                  disabled={deciding}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                >
                  Rejected
                </button>
                {!isPayrollMode && (
                  <button
                    type="button"
                    onClick={() => chooseDecision('CORRECTION_REQUESTED')}
                    disabled={deciding}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                  >
                    Request Correction
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => submitDecision('APPROVED')}
                  disabled={deciding}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {deciding ? 'Submitting...' : 'Approve'}
                </button>
              </>
            )}
          </div>
          {(activeDecision === 'REJECTED' || (!isPayrollMode && activeDecision === 'CORRECTION_REQUESTED')) && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="review-reason">
                Reason
              </label>
              <textarea
                id="review-reason"
                value={decisionReason}
                onChange={(e) => {
                  setDecisionReason(e.target.value);
                  setDecisionError('');
                }}
                rows={2}
                placeholder="Enter reason here..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (deciding) return;
                      setActiveDecision(null);
                      setDecisionError('');
                    }}
                    disabled={deciding}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => submitDecision(activeDecision)}
                    disabled={deciding}
                    className={
                      activeDecision === 'REJECTED'
                        ? 'rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100'
                        : 'rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100'
                    }
                  >
                    {deciding
                      ? 'Submitting...'
                      : activeDecision === 'REJECTED'
                        ? 'Submit rejection'
                        : 'Request Correction'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
