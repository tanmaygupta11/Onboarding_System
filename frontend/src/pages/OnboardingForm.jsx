import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

const MOBILE_DIGITS_REGEX = /\D/g;
const TEN_DIGIT_REGEX = /^\d{10}$/;
const TWELVE_DIGIT_REGEX = /^\d{12}$/;
const SIX_DIGIT_REGEX = /^\d{6}$/;

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];
const DRIVING_OPTIONS = ['Yes', 'No'];
const DRIVING_LICENSE_MAX_BYTES = 12 * 1024 * 1024;
const QUALIFICATION_MAX_BYTES = 12 * 1024 * 1024;
const KYC_MAX_BYTES = 12 * 1024 * 1024;
const BP_MAX_BYTES = 12 * 1024 * 1024;
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_CODE_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{6,18}$/;

const HIGHEST_QUALIFICATION_OPTIONS = [
  '10th Pass',
  '12th Pass',
  'Diploma',
  'ITI',
  'Graduate',
  'Post Graduate',
  'Professional Degree',
  'Others',
];

function normalizeMobile(raw) {
  const digits = String(raw ?? '').replace(MOBILE_DIGITS_REGEX, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizeAadhaar(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 12);
}

function normalizeOtp(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 6);
}

function formatAadDob(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAadGender(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (c === 'M') return 'Male';
  if (c === 'F') return 'Female';
  if (c === 'T' || c === 'X') return 'Other';
  return code || '—';
}

function fatherNameFromCareOf(careOf) {
  return String(careOf ?? '')
    .replace(/^C\/O:\s*/i, '')
    .trim();
}

function ageFromIsoDob(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
  return String(a);
}

function buildPersonalDraft(f) {
  return {
    email: f.email ?? '',
    pd_alternate_number: f.pd_alternate_number ? String(f.pd_alternate_number) : '',
    pd_marital_status: f.pd_marital_status ?? '',
    pd_driving_license: f.pd_driving_license ?? '',
  };
}

function cityFromJobForm(f) {
  return (f.pd_city ?? f.aad_district ?? '').trim() || '—';
}

function fieldClass(readOnly) {
  return readOnly
    ? 'w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 select-none'
    : 'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900';
}

function UploadedFileBanner({ href }) {
  if (!href) return null;
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm"
      role="status"
    >
      <span className="flex items-center gap-2 text-green-700">
        <span className="text-base font-semibold leading-none text-green-600" aria-hidden>
          ✓
        </span>
        <span className="font-medium">File uploaded</span>
      </span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-blue-600 underline decoration-blue-600 underline-offset-2 hover:text-blue-800"
      >
        View Current File
      </a>
    </div>
  );
}

function parseAdditionalCertificateUrls(form) {
  const v = form?.qual_additional_certificates_url;
  if (Array.isArray(v)) return v.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim());
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? parseAdditionalCertificateUrls({ qual_additional_certificates_url: p }) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isEmptyForCorrection(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).length === 0;
  return false;
}

const STEP_ORDER = ['personal', 'qualification', 'kyc', 'photo'];
const STEP_PREFIX_RULES = {
  personal: ['email', 'pd_'],
  qualification: ['qual_'],
  kyc: ['kyc_'],
  photo: ['bp_']
};
const STEP_OPTIONAL_FIELDS = {
  personal: ['pd_alternate_number'],
  qualification: ['qual_additional_certificates_url'],
  kyc: [],
  photo: ['bp_esic_number', 'bp_pf_uan_number', 'bp_police_verification_url']
};
const STEP_ALL_FIELDS = {
  personal: ['email', 'pd_alternate_number', 'pd_marital_status', 'pd_driving_license', 'pd_driving_license_url'],
  qualification: ['qual_highest_qualification', 'qual_education_certificate_url', 'qual_additional_certificates_url'],
  kyc: [
    'kyc_aadhar_front_url',
    'kyc_aadhar_back_url',
    'kyc_pan_number',
    'kyc_pan_card_url',
    'kyc_account_holder_name',
    'kyc_account_number',
    'kyc_ifsc_code',
    'kyc_bank_passbook_url'
  ],
  photo: ['bp_passport_photo_url', 'bp_esic_number', 'bp_pf_uan_number', 'bp_police_verification_url']
};

function isAllowedQualificationFile(file) {
  const m = String(file.type || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  if (m === 'application/pdf') return true;
  if (m === 'application/msword') return true;
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  return false;
}

function IconCheckCircle({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconShield({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      />
    </svg>
  );
}

function IconArrowLeft({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function IconCamera({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.716-1.017H8.25a2.192 2.192 0 00-1.716 1.017l-.822 1.316a2.31 2.31 0 01-1.64 1.055z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}

function FormStepper({ currentStep }) {
  const steps = [
    { n: 1, label: 'Personal' },
    { n: 2, label: 'Qualification' },
    { n: 3, label: 'KYC' },
    { n: 4, label: 'Bank & Photo' },
  ];
  return (
    <nav className="mb-8" aria-label="Form progress">
      <div className="flex items-start justify-between gap-1 sm:gap-2">
        {steps.map((s) => {
          const done = currentStep > s.n;
          const active = currentStep === s.n;
          return (
            <div key={s.n} className="flex min-w-0 flex-1 flex-col items-center">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? (
                  <IconCheckCircle className="h-5 w-5" />
                ) : active && s.n === 4 ? (
                  <IconCamera className="h-5 w-5" />
                ) : (
                  s.n
                )}
              </div>
              <span className="mt-2 max-w-[4.5rem] text-center text-[10px] font-medium leading-tight text-slate-600 sm:max-w-none sm:text-xs">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        Step {currentStep} of 4 · {steps[currentStep - 1]?.label ?? ''}
      </p>
    </nav>
  );
}

function IconDocument({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function QualificationForm({ jobForm, mobile, employeeId, onPrevious, onSaveSuccess, correction }) {
  const [highest, setHighest] = useState(() => jobForm.qual_highest_qualification ?? '');
  const [eduUrl, setEduUrl] = useState(() => jobForm.qual_education_certificate_url ?? '');
  const [additionalUrls, setAdditionalUrls] = useState(() => parseAdditionalCertificateUrls(jobForm));
  const [eduUploading, setEduUploading] = useState(false);
  const [addUploading, setAddUploading] = useState(false);
  const [eduError, setEduError] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setHighest(visible?.has('qual_highest_qualification') ? '' : (jobForm.qual_highest_qualification ?? ''));
    setEduUrl(visible?.has('qual_education_certificate_url') ? '' : (jobForm.qual_education_certificate_url ?? ''));
    setAdditionalUrls(visible?.has('qual_additional_certificates_url') ? [] : parseAdditionalCertificateUrls(jobForm));
    setEduError('');
    setAddError('');
    setError('');
  }, [jobForm, correction]);

  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  const canNext = (
    (!isRequired('qual_highest_qualification', true) || Boolean(String(highest).trim())) &&
    (!isRequired('qual_education_certificate_url', true) || Boolean(String(eduUrl).trim()))
  );

  const uploadIfValid = async (file) => {
    if (!isAllowedQualificationFile(file)) {
      throw new Error('Use an image, PDF, or Word document (.doc / .docx).');
    }
    if (file.size > QUALIFICATION_MAX_BYTES) {
      throw new Error('File must be 12 MB or smaller.');
    }
    const { url } = await api.uploadQualificationCertificate({ mobile, employeeId, file });
    return url ?? '';
  };

  const handleEducationFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEduError('');
    setEduUploading(true);
    try {
      const url = await uploadIfValid(file);
      setEduUrl(url);
    } catch (err) {
      setEduError(err.message || 'Upload failed.');
    } finally {
      setEduUploading(false);
    }
  };

  const handleAdditionalFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAddError('');
    setAddUploading(true);
    try {
      const url = await uploadIfValid(file);
      setAdditionalUrls((prev) => [...prev, url]);
    } catch (err) {
      setAddError(err.message || 'Upload failed.');
    } finally {
      setAddUploading(false);
    }
  };

  const handleNext = async () => {
    if (!canNext || saving) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'qualification',
        qual_highest_qualification: String(highest).trim(),
        qual_education_certificate_url: String(eduUrl).trim(),
        qual_additional_certificates_url: additionalUrls,
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <FormStepper currentStep={2} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconDocument className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">Qualification</h2>
      </div>

      <div className="space-y-6">
        {shouldShow('qual_highest_qualification') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="qual-highest">
            Highest Qualification <span className="text-rose-500">*</span>
          </label>
          <select
            id="qual-highest"
            className={fieldClass(false)}
            value={highest}
            onChange={(e) => setHighest(e.target.value)}
          >
            <option value="">Select Highest Qualification</option>
            {HIGHEST_QUALIFICATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>}

        {shouldShow('qual_education_certificate_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="qual-edu-cert">
            ITI/Diploma Education Certificate {isRequired('qual_education_certificate_url', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="qual-edu-cert"
            type="file"
            accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={eduUploading}
            onChange={handleEducationFile}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Max file size: 12MB. Supported: image/*, application/pdf, .doc, .docx
          </p>
          {eduUploading && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {eduError && <p className="mt-2 text-sm text-rose-600">{eduError}</p>}
          {eduUrl && !eduUploading && <UploadedFileBanner href={eduUrl} />}
        </div>}

        {shouldShow('qual_additional_certificates_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800">Additional Certificates (Optional)</label>
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
            <p className="mb-3 text-sm text-slate-600">Add Certificate</p>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={addUploading}
              onChange={handleAdditionalFile}
              className="mx-auto block max-w-full cursor-pointer text-sm text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-slate-500">Same limits as above. You can add multiple files.</p>
          </div>
          {addUploading && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {addError && <p className="mt-2 text-sm text-rose-600">{addError}</p>}
          {additionalUrls.length > 0 && (
            <ul className="mt-3 space-y-2">
              {additionalUrls.map((u, idx) => (
                <li
                  key={`${u}-${idx}`}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <UploadedFileBanner href={u} />
                  </div>
                  <button
                    type="button"
                    className="shrink-0 self-end text-sm font-medium text-rose-600 hover:text-rose-800 sm:self-center"
                    onClick={() => setAdditionalUrls((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canNext || saving}
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Next'} <span aria-hidden>›</span>
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 2 of 4 · Qualification</p>
    </div>
  );
}

function isAllowedKycPassbookFile(file) {
  const m = String(file.type || '').toLowerCase();
  return m.startsWith('image/') || m === 'application/pdf';
}

function KycDocumentsForm({ jobForm, mobile, employeeId, onPrevious, onSaveSuccess, correction }) {
  const aadhaarVerified = Boolean(
    String(jobForm?.aadhaar_number ?? '').trim() || String(jobForm?.aad_name ?? '').trim()
  );

  const [frontUrl, setFrontUrl] = useState(() => jobForm.kyc_aadhar_front_url ?? '');
  const [backUrl, setBackUrl] = useState(() => jobForm.kyc_aadhar_back_url ?? '');
  const [panCardUrl, setPanCardUrl] = useState(() => jobForm.kyc_pan_card_url ?? '');
  const [passbookUrl, setPassbookUrl] = useState(() => jobForm.kyc_bank_passbook_url ?? '');

  const [panNumber, setPanNumber] = useState(() =>
    String(jobForm.kyc_pan_number ?? '')
      .replace(/\s/g, '')
      .toUpperCase()
  );
  const [accountHolder, setAccountHolder] = useState(() => jobForm.kyc_account_holder_name ?? '');
  const [accountNumber, setAccountNumber] = useState(() =>
    String(jobForm.kyc_account_number ?? '').replace(/\s/g, '')
  );
  const [ifsc, setIfsc] = useState(() =>
    String(jobForm.kyc_ifsc_code ?? '')
      .replace(/\s/g, '')
      .toUpperCase()
  );

  const [frontUp, setFrontUp] = useState(false);
  const [backUp, setBackUp] = useState(false);
  const [panCardUp, setPanCardUp] = useState(false);
  const [passUp, setPassUp] = useState(false);
  const [frontErr, setFrontErr] = useState('');
  const [backErr, setBackErr] = useState('');
  const [panCardErr, setPanCardErr] = useState('');
  const [passErr, setPassErr] = useState('');

  const [panVerified, setPanVerified] = useState(false);
  const [panVerifyMsg, setPanVerifyMsg] = useState('');
  const [bankVerified, setBankVerified] = useState(false);
  const [bankVerifying, setBankVerifying] = useState(false);
  const [bankVerifyMsg, setBankVerifyMsg] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setFrontUrl(visible?.has('kyc_aadhar_front_url') ? '' : (jobForm.kyc_aadhar_front_url ?? ''));
    setBackUrl(visible?.has('kyc_aadhar_back_url') ? '' : (jobForm.kyc_aadhar_back_url ?? ''));
    setPanCardUrl(visible?.has('kyc_pan_card_url') ? '' : (jobForm.kyc_pan_card_url ?? ''));
    setPassbookUrl(visible?.has('kyc_bank_passbook_url') ? '' : (jobForm.kyc_bank_passbook_url ?? ''));
    setPanNumber(visible?.has('kyc_pan_number') ? '' : String(jobForm.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase());
    setAccountHolder(visible?.has('kyc_account_holder_name') ? '' : (jobForm.kyc_account_holder_name ?? ''));
    setAccountNumber(visible?.has('kyc_account_number') ? '' : String(jobForm.kyc_account_number ?? '').replace(/\s/g, ''));
    setIfsc(visible?.has('kyc_ifsc_code') ? '' : String(jobForm.kyc_ifsc_code ?? '').replace(/\s/g, '').toUpperCase());
    setFrontErr('');
    setBackErr('');
    setPanCardErr('');
    setPassErr('');
    const panLoaded = visible?.has('kyc_pan_number')
      ? ''
      : String(jobForm.kyc_pan_number ?? '').replace(/\s/g, '').toUpperCase();
    setPanVerified(PAN_NUMBER_REGEX.test(panLoaded));
    setPanVerifyMsg('');

    const hLoaded = visible?.has('kyc_account_holder_name') ? '' : String(jobForm.kyc_account_holder_name ?? '').trim();
    const acctLoaded = visible?.has('kyc_account_number') ? '' : String(jobForm.kyc_account_number ?? '').replace(/\s/g, '');
    const ifscLoaded = visible?.has('kyc_ifsc_code') ? '' : String(jobForm.kyc_ifsc_code ?? '').replace(/\s/g, '').toUpperCase();
    setBankVerified(
      hLoaded.length >= 2 &&
        ACCOUNT_NUMBER_REGEX.test(acctLoaded) &&
        IFSC_CODE_REGEX.test(ifscLoaded)
    );
    setBankVerifyMsg('');
    setError('');
  }, [jobForm, correction]);

  const uploadKyc = async (kind, file) => {
    const { url } = await api.uploadKycDocument({ mobile, employeeId, file, kind });
    return url ?? '';
  };

  const handleAadhaarFront = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFrontErr('Images only (e.g. JPG, PNG).');
      return;
    }
    if (file.size > KYC_MAX_BYTES) {
      setFrontErr('File must be 12 MB or smaller.');
      return;
    }
    setFrontErr('');
    setFrontUp(true);
    try {
      setFrontUrl(await uploadKyc('aadhaar_front', file));
    } catch (err) {
      setFrontErr(err.message || 'Upload failed.');
    } finally {
      setFrontUp(false);
    }
  };

  const handleAadhaarBack = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBackErr('Images only (e.g. JPG, PNG).');
      return;
    }
    if (file.size > KYC_MAX_BYTES) {
      setBackErr('File must be 12 MB or smaller.');
      return;
    }
    setBackErr('');
    setBackUp(true);
    try {
      setBackUrl(await uploadKyc('aadhaar_back', file));
    } catch (err) {
      setBackErr(err.message || 'Upload failed.');
    } finally {
      setBackUp(false);
    }
  };

  const handlePanCard = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPanCardErr('Images only (e.g. JPG, PNG).');
      return;
    }
    if (file.size > KYC_MAX_BYTES) {
      setPanCardErr('File must be 12 MB or smaller.');
      return;
    }
    setPanCardErr('');
    setPanCardUp(true);
    try {
      setPanCardUrl(await uploadKyc('pan_card', file));
    } catch (err) {
      setPanCardErr(err.message || 'Upload failed.');
    } finally {
      setPanCardUp(false);
    }
  };

  const handlePassbook = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedKycPassbookFile(file)) {
      setPassErr('Upload an image or PDF.');
      return;
    }
    if (file.size > KYC_MAX_BYTES) {
      setPassErr('File must be 12 MB or smaller.');
      return;
    }
    setPassErr('');
    setPassUp(true);
    try {
      setPassbookUrl(await uploadKyc('bank_passbook', file));
    } catch (err) {
      setPassErr(err.message || 'Upload failed.');
    } finally {
      setPassUp(false);
    }
  };

  const handleVerifyPan = () => {
    setPanVerifyMsg('');
    const p = panNumber.trim();
    if (!PAN_NUMBER_REGEX.test(p)) {
      setPanVerified(false);
      setPanVerifyMsg('Enter a valid PAN (e.g. ABCDE1234F).');
      return;
    }
    setPanVerified(true);
    setPanVerifyMsg('PAN format looks valid. Final verification will be completed later.');
  };

  const handleVerifyBank = () => {
    if (bankVerifying) return;
    setBankVerifyMsg('');
    const h = String(accountHolder).trim();
    const acct = String(accountNumber).replace(/\s/g, '');
    const ifscNorm = String(ifsc)
      .replace(/\s/g, '')
      .toUpperCase();
    if (h.length < 2) {
      setBankVerified(false);
      setBankVerifyMsg('Enter the account holder name.');
      return;
    }
    if (!ACCOUNT_NUMBER_REGEX.test(acct)) {
      setBankVerified(false);
      setBankVerifyMsg('Account number must be 6–18 digits.');
      return;
    }
    if (!IFSC_CODE_REGEX.test(ifscNorm)) {
      setBankVerified(false);
      setBankVerifyMsg('Enter a valid IFSC (e.g. HDFC0001234).');
      return;
    }
    setBankVerifying(true);
    api
      .verifyBankAccount({
        mobile,
        employeeId,
        accountHolderName: h,
        accountNumber: acct,
        ifsc: ifscNorm,
      })
      .then((result) => {
        setAccountHolder(result.account_holder_name ?? h);
        setAccountNumber(result.account_number ?? acct);
        setIfsc(result.ifsc ?? ifscNorm);
        setBankVerified(true);
        setBankVerifyMsg('Bank details verified successfully.');
      })
      .catch((err) => {
        setBankVerified(false);
        setBankVerifyMsg(err.message || 'Bank verification failed. Please check details and try again.');
      })
      .finally(() => {
        setBankVerifying(false);
      });
  };

  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  const docsOk =
    (!isRequired('kyc_aadhar_front_url', true) || Boolean(String(frontUrl).trim())) &&
    (!isRequired('kyc_aadhar_back_url', true) || Boolean(String(backUrl).trim())) &&
    (!isRequired('kyc_pan_card_url', true) || Boolean(String(panCardUrl).trim())) &&
    (!isRequired('kyc_bank_passbook_url', true) || Boolean(String(passbookUrl).trim()));
  const panOk = !isRequired('kyc_pan_number', true) || (panVerified && PAN_NUMBER_REGEX.test(panNumber.trim()));
  const bankOk =
    !(
      isRequired('kyc_account_holder_name', true) ||
      isRequired('kyc_account_number', true) ||
      isRequired('kyc_ifsc_code', true)
    ) || bankVerified;
  const canNext = docsOk && panOk && bankOk;

  const handleNext = async () => {
    if (!canNext || saving) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'kyc',
        kyc_aadhar_front_url: String(frontUrl).trim(),
        kyc_aadhar_back_url: String(backUrl).trim(),
        kyc_pan_number: panNumber.trim(),
        kyc_pan_card_url: String(panCardUrl).trim(),
        kyc_account_holder_name: String(accountHolder).trim(),
        kyc_account_number: String(accountNumber).replace(/\s/g, ''),
        kyc_ifsc_code: String(ifsc)
          .replace(/\s/g, '')
          .toUpperCase(),
        kyc_bank_passbook_url: String(passbookUrl).trim(),
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <FormStepper currentStep={3} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconDocument className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">KYC Documents</h2>
      </div>

      {aadhaarVerified && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your Aadhaar is already verified from the earlier step. Upload clear photos of your Aadhaar card
          (front and back) below.
        </div>
      )}

      {(shouldShow('kyc_aadhar_front_url') || shouldShow('kyc_aadhar_back_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Aadhaar card</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          {shouldShow('kyc_aadhar_front_url') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-aad-front">
              Aadhaar front {isRequired('kyc_aadhar_front_url', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-aad-front"
              type="file"
              accept="image/*"
              disabled={frontUp}
              onChange={handleAadhaarFront}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-slate-500">Images only · max 12MB</p>
            {frontUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
            {frontErr && <p className="mt-2 text-sm text-rose-600">{frontErr}</p>}
            {frontUrl && !frontUp && <UploadedFileBanner href={frontUrl} />}
          </div>}
          {shouldShow('kyc_aadhar_back_url') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-aad-back">
              Aadhaar back {isRequired('kyc_aadhar_back_url', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-aad-back"
              type="file"
              accept="image/*"
              disabled={backUp}
              onChange={handleAadhaarBack}
              className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-slate-500">Images only · max 12MB</p>
            {backUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
            {backErr && <p className="mt-2 text-sm text-rose-600">{backErr}</p>}
            {backUrl && !backUp && <UploadedFileBanner href={backUrl} />}
          </div>}
        </div>
      </section>
      )}

      {(shouldShow('kyc_pan_number') || shouldShow('kyc_pan_card_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">PAN</h3>
        {shouldShow('kyc_pan_number') && <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-pan-num">
              PAN number {isRequired('kyc_pan_number', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-pan-num"
              type="text"
              value={panNumber}
              onChange={(e) => {
                const v = e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 10);
                setPanNumber(v);
                setPanVerified(false);
                setPanVerifyMsg('');
              }}
              className={fieldClass(false)}
              placeholder="ABCDE1234F"
              maxLength={10}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={handleVerifyPan}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Verify PAN
          </button>
        </div>}
        {shouldShow('kyc_pan_number') && panVerifyMsg && (
          <p className={`text-sm ${panVerified ? 'text-emerald-700' : 'text-rose-600'}`}>{panVerifyMsg}</p>
        )}
        {shouldShow('kyc_pan_card_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-pan-card">
            PAN card image {isRequired('kyc_pan_card_url', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="kyc-pan-card"
            type="file"
            accept="image/*"
            disabled={panCardUp}
            onChange={handlePanCard}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-slate-500">Images only · max 12MB</p>
          {panCardUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {panCardErr && <p className="mt-2 text-sm text-rose-600">{panCardErr}</p>}
          {panCardUrl && !panCardUp && <UploadedFileBanner href={panCardUrl} />}
        </div>}
      </section>
      )}

      {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code') || shouldShow('kyc_bank_passbook_url')) && (
      <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Bank account</h3>
        {shouldShow('kyc_account_holder_name') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-acc-name">
            Account holder name {isRequired('kyc_account_holder_name', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="kyc-acc-name"
            type="text"
            value={accountHolder}
            onChange={(e) => {
              setAccountHolder(e.target.value);
              setBankVerified(false);
              setBankVerifyMsg('');
            }}
            className={fieldClass(false)}
            placeholder="Name as on bank account"
            autoComplete="name"
          />
        </div>}
        {(shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && <div className="grid gap-4 sm:grid-cols-2">
          {shouldShow('kyc_account_number') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-acc-no">
              Account number {isRequired('kyc_account_number', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-acc-no"
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18));
                setBankVerified(false);
                setBankVerifyMsg('');
              }}
              className={fieldClass(false)}
              placeholder="Account number"
              autoComplete="off"
            />
          </div>}
          {shouldShow('kyc_ifsc_code') && <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-ifsc">
              IFSC {isRequired('kyc_ifsc_code', true) && <span className="text-rose-500">*</span>}
            </label>
            <input
              id="kyc-ifsc"
              type="text"
              value={ifsc}
              onChange={(e) => {
                setIfsc(e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 11));
                setBankVerified(false);
                setBankVerifyMsg('');
              }}
              className={fieldClass(false)}
              placeholder="HDFC0001234"
              autoComplete="off"
            />
          </div>}
        </div>}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && <button
          type="button"
          onClick={handleVerifyBank}
          disabled={bankVerifying}
          className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {bankVerifying ? 'Verifying…' : 'Verify bank'}
        </button>}
        {(shouldShow('kyc_account_holder_name') || shouldShow('kyc_account_number') || shouldShow('kyc_ifsc_code')) && bankVerifyMsg && (
          <p className={`text-sm ${bankVerified ? 'text-emerald-700' : 'text-rose-600'}`}>{bankVerifyMsg}</p>
        )}
        {shouldShow('kyc_bank_passbook_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="kyc-passbook">
            Bank passbook / statement {isRequired('kyc_bank_passbook_url', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="kyc-passbook"
            type="file"
            accept="image/*,.pdf,application/pdf"
            disabled={passUp}
            onChange={handlePassbook}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-slate-500">Image or PDF · max 12MB</p>
          {passUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {passErr && <p className="mt-2 text-sm text-rose-600">{passErr}</p>}
          {passbookUrl && !passUp && <UploadedFileBanner href={passbookUrl} />}
        </div>}
      </section>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canNext || saving}
          onClick={handleNext}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Next'} <span aria-hidden>›</span>
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 3 of 4 · KYC</p>
    </div>
  );
}

function BankPhotoForm({ jobForm, mobile, employeeId, onPrevious, onSubmitted, onGoToStatus, correction }) {
  const [photoUrl, setPhotoUrl] = useState(() => jobForm.bp_passport_photo_url ?? '');
  const [esic, setEsic] = useState(() => jobForm.bp_esic_number ?? '');
  const [pfUan, setPfUan] = useState(() => String(jobForm.bp_pf_uan_number ?? '').replace(/\D/g, ''));
  const [policeUrl, setPoliceUrl] = useState(() => jobForm.bp_police_verification_url ?? '');
  const [photoUp, setPhotoUp] = useState(false);
  const [policeUp, setPoliceUp] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [policeErr, setPoliceErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(
    () => String(jobForm?.submission_status ?? '').trim() === 'Submitted'
  );

  useEffect(() => {
    const visible = correction?.active ? correction.visibleFields : null;
    setPhotoUrl(visible?.has('bp_passport_photo_url') ? '' : (jobForm.bp_passport_photo_url ?? ''));
    setEsic(visible?.has('bp_esic_number') ? '' : (jobForm.bp_esic_number ?? ''));
    setPfUan(visible?.has('bp_pf_uan_number') ? '' : String(jobForm.bp_pf_uan_number ?? '').replace(/\D/g, ''));
    setPoliceUrl(visible?.has('bp_police_verification_url') ? '' : (jobForm.bp_police_verification_url ?? ''));
    setPhotoErr('');
    setPoliceErr('');
    setError('');
    if (!correction?.active && String(jobForm.submission_status ?? '').trim() === 'Submitted') {
      setSubmitted(true);
    } else if (correction?.active) {
      setSubmitted(false);
    }
  }, [jobForm, correction]);

  const handlePassportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoErr('Only image files are allowed.');
      return;
    }
    if (file.size > BP_MAX_BYTES) {
      setPhotoErr('File must be 12 MB or smaller.');
      return;
    }
    setPhotoErr('');
    setPhotoUp(true);
    try {
      const { url } = await api.uploadBpDocument({ mobile, employeeId, file, kind: 'passport_photo' });
      setPhotoUrl(url ?? '');
    } catch (err) {
      setPhotoErr(err.message || 'Upload failed.');
    } finally {
      setPhotoUp(false);
    }
  };

  const handlePoliceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isAllowedQualificationFile(file)) {
      setPoliceErr('Use an image, PDF, or Word document (.doc / .docx).');
      return;
    }
    if (file.size > BP_MAX_BYTES) {
      setPoliceErr('File must be 12 MB or smaller.');
      return;
    }
    setPoliceErr('');
    setPoliceUp(true);
    try {
      const { url } = await api.uploadBpDocument({ mobile, employeeId, file, kind: 'police_verification' });
      setPoliceUrl(url ?? '');
    } catch (err) {
      setPoliceErr(err.message || 'Upload failed.');
    } finally {
      setPoliceUp(false);
    }
  };

  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;
  const canSubmit = !isRequired('bp_passport_photo_url', true) || Boolean(String(photoUrl).trim());
  const pfUanError =
    pfUan.length > 0 && pfUan.length !== 12 ? 'PF UAN must be 12 digits, or leave empty.' : '';

  const handleSubmit = async () => {
    if (!canSubmit || saving || pfUanError) return;
    setSaving(true);
    setError('');
    try {
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'bank_photo',
        bp_passport_photo_url: String(photoUrl).trim(),
        bp_esic_number: String(esic).trim() || null,
        bp_pf_uan_number: pfUan.length === 12 ? pfUan : null,
        bp_police_verification_url: String(policeUrl).trim() || null,
      });
      setSubmitted(true);
      onSubmitted?.(form);
    } catch (err) {
      setError(err.message || 'Could not submit. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg py-2 sm:py-4">
        <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center shadow-lg sm:px-10 sm:py-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <IconCheckCircle className="h-9 w-9 text-emerald-600" aria-hidden />
          </div>
          <h2 className="mt-6 text-xl font-bold text-emerald-600 sm:text-2xl">Application Submitted Successfully!</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-800 sm:text-base">
            Thank you for applying with us. Our HR team will review your application and contact you within 3-5
            business days.
          </p>
          <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-center text-sm leading-relaxed text-blue-900 sm:text-base">
            <p>
              <span className="font-bold">Important:</span> Please keep your phone accessible as we may call you for
              further verification or interview scheduling.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToStatus}
            className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Go to Next Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <FormStepper currentStep={4} />

      <div className="flex items-center gap-2 text-slate-900">
        <IconCamera className="h-8 w-8 text-indigo-600" />
        <h2 className="text-xl font-semibold sm:text-2xl">Bank &amp; Photo</h2>
      </div>

      <div className="space-y-6">
        {shouldShow('bp_passport_photo_url') && <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-passport-photo">
            Passport Size Photo {isRequired('bp_passport_photo_url', true) && <span className="text-rose-500">*</span>}
          </label>
          <input
            id="bp-passport-photo"
            type="file"
            accept="image/*"
            disabled={photoUp}
            onChange={handlePassportFile}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-1.5 text-xs text-slate-500">Max file size: 12MB. Supported: image/*</p>
          {photoUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
          {photoErr && <p className="mt-2 text-sm text-rose-600">{photoErr}</p>}
          {photoUrl && !photoUp && <UploadedFileBanner href={photoUrl} />}
        </div>}

        {(shouldShow('bp_esic_number') || shouldShow('bp_pf_uan_number') || shouldShow('bp_police_verification_url')) && (
        <div className="border-t border-slate-200 pt-6">
          <p className="mb-4 text-sm font-medium text-slate-700">Optional information</p>
          <div className="space-y-4">
            {shouldShow('bp_esic_number') && <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-esic">
                ESIC Number (Optional)
              </label>
              <input
                id="bp-esic"
                type="text"
                value={esic}
                onChange={(e) => setEsic(e.target.value)}
                className={fieldClass(false)}
                placeholder="ESIC Number (Optional)"
                autoComplete="off"
              />
            </div>}
            {shouldShow('bp_pf_uan_number') && <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-pf-uan">
                PF UAN Number (Optional)
              </label>
              <input
                id="bp-pf-uan"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={pfUan}
                onChange={(e) => setPfUan(e.target.value.replace(/\D/g, '').slice(0, 12))}
                className={fieldClass(false)}
                placeholder="PF UAN Number (Optional)"
                autoComplete="off"
              />
              {pfUanError && <p className="mt-1.5 text-sm text-rose-600">{pfUanError}</p>}
            </div>}
            {shouldShow('bp_police_verification_url') && <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="bp-police">
                Police Verification Document (Optional)
              </label>
              <input
                id="bp-police"
                type="file"
                accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={policeUp}
                onChange={handlePoliceFile}
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Max file size: 12MB. Supported: image/*, application/pdf, .doc, .docx
              </p>
              <p className="mt-1 text-xs text-slate-500">Optional: Upload police verification document if available</p>
              {policeUp && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
              {policeErr && <p className="mt-2 text-sm text-rose-600">{policeErr}</p>}
              {policeUrl && !policeUp && <UploadedFileBanner href={policeUrl} />}
            </div>}
          </div>
        </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-800">Verification Status</h3>
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            Aadhaar
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            PAN
          </li>
          <li className="flex items-center gap-2 text-sm text-slate-800">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            Bank Account
          </li>
        </ul>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="inline-flex items-center justify-center gap-1 rounded-xl border-2 border-indigo-600 bg-white px-5 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span> Previous
        </button>
        <button
          type="button"
          disabled={!canSubmit || saving || Boolean(pfUanError)}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">Step 4 of 4 · Bank &amp; Photo</p>
    </div>
  );
}

function PersonalDetailsForm({ jobForm, mobile, employeeId, onSaveSuccess, correction }) {
  const [draft, setDraft] = useState(() => buildPersonalDraft(jobForm));
  const [licenseImageUrl, setLicenseImageUrl] = useState(() => jobForm.pd_driving_license_url ?? '');
  const [licenseUploading, setLicenseUploading] = useState(false);
  const [licenseError, setLicenseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const base = buildPersonalDraft(jobForm);
    if (correction?.active) {
      const visible = correction.visibleFields;
      setDraft({
        email: visible.has('email') ? '' : base.email,
        pd_alternate_number: visible.has('pd_alternate_number') ? '' : base.pd_alternate_number,
        pd_marital_status: visible.has('pd_marital_status') ? '' : base.pd_marital_status,
        pd_driving_license: visible.has('pd_driving_license') ? '' : base.pd_driving_license
      });
      setLicenseImageUrl(visible.has('pd_driving_license_url') ? '' : (jobForm.pd_driving_license_url ?? ''));
    } else {
      setDraft(base);
      setLicenseImageUrl(jobForm.pd_driving_license_url ?? '');
    }
    setLicenseError('');
  }, [jobForm, correction]);

  const dobIso = jobForm.aad_dob ? String(jobForm.aad_dob).slice(0, 10) : '';
  const ageDisplay = ageFromIsoDob(dobIso) || (jobForm.pd_age != null ? String(jobForm.pd_age) : '');

  const dl = String(draft.pd_driving_license).trim();
  const needsLicenseImage = dl === 'Yes';
  const licenseImageOk = !needsLicenseImage || Boolean(String(licenseImageUrl).trim());
  const shouldShow = (field) => !correction?.active || correction.visibleFields.has(field);
  const isRequired = (field, fallbackRequired = false) =>
    correction?.active ? correction.requiredFields.has(field) : fallbackRequired;

  const requiredOk =
    (!isRequired('email', true) || String(draft.email).trim()) &&
    (!isRequired('pd_marital_status', true) || String(draft.pd_marital_status).trim()) &&
    (!isRequired('pd_driving_license', true) || Boolean(dl)) &&
    (!isRequired('pd_driving_license_url', true) || licenseImageOk);

  const handleLicenseFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLicenseError('Only image files are allowed.');
      return;
    }
    if (file.size > DRIVING_LICENSE_MAX_BYTES) {
      setLicenseError('File must be 12 MB or smaller.');
      return;
    }
    setLicenseError('');
    setLicenseUploading(true);
    try {
      const { url } = await api.uploadDrivingLicense({ mobile, employeeId, file });
      setLicenseImageUrl(url ?? '');
    } catch (err) {
      setLicenseError(err.message || 'Upload failed.');
    } finally {
      setLicenseUploading(false);
    }
  };

  const handleSave = async () => {
    if (!requiredOk || saving) return;
    setSaving(true);
    setError('');
    try {
      const alt = String(draft.pd_alternate_number).replace(/\D/g, '');
      const { form } = await api.patchJobAppForm({
        mobile,
        employee_id: employeeId || null,
        patch_step: 'personal',
        email: String(draft.email).trim(),
        pd_alternate_number: alt.length === 10 ? alt : null,
        pd_marital_status: String(draft.pd_marital_status).trim(),
        pd_driving_license: dl,
        pd_driving_license_url: needsLicenseImage ? String(licenseImageUrl).trim() : null,
      });
      onSaveSuccess?.(form);
    } catch (err) {
      setError(err.message || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (correction?.active) {
    return (
      <div className="space-y-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Please correct the highlighted fields and resubmit your form.
        </div>
        <div className="space-y-4">
          {shouldShow('email') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Email Address {isRequired('email', true) && <span className="text-rose-500">*</span>}
              </label>
              <input
                type="email"
                autoComplete="email"
                className={fieldClass(false)}
                placeholder="example@example.com"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
          )}
          {shouldShow('pd_alternate_number') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Alternate Number / Alternate WhatsApp Number (Optional)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                className={fieldClass(false)}
                placeholder="10-digit alternate number"
                value={draft.pd_alternate_number}
                onChange={(e) => setDraft((d) => ({ ...d, pd_alternate_number: normalizeMobile(e.target.value) }))}
              />
            </div>
          )}
          {shouldShow('pd_marital_status') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Marital Status {isRequired('pd_marital_status', true) && <span className="text-rose-500">*</span>}
              </label>
              <select
                className={fieldClass(false)}
                value={draft.pd_marital_status}
                onChange={(e) => setDraft((d) => ({ ...d, pd_marital_status: e.target.value }))}
              >
                <option value="">Select Marital Status</option>
                {MARITAL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shouldShow('pd_driving_license') && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800">
                Do you have a Driving License? {isRequired('pd_driving_license', true) && <span className="text-rose-500">*</span>}
              </label>
              <select
                className={fieldClass(false)}
                value={draft.pd_driving_license}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((d) => ({ ...d, pd_driving_license: v }));
                  if (v !== 'Yes') {
                    setLicenseImageUrl('');
                    setLicenseError('');
                  }
                }}
              >
                <option value="">Select</option>
                {DRIVING_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          {shouldShow('pd_driving_license_url') && needsLicenseImage && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="driving-license-file">
                Upload Driving License Image {isRequired('pd_driving_license_url', true) && <span className="text-rose-500">*</span>}
              </label>
              <input
                id="driving-license-file"
                type="file"
                accept="image/*"
                disabled={licenseUploading}
                onChange={handleLicenseFile}
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {licenseUploading && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
              {licenseError && <p className="mt-2 text-sm text-rose-600">{licenseError}</p>}
              {licenseImageUrl && !licenseUploading && <UploadedFileBanner href={licenseImageUrl} />}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={!requiredOk || saving}
          onClick={handleSave}
          className="mt-2 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-900">Personal Info</h2>
        <p className="mt-2 text-sm text-slate-600">Confirm details from your Aadhaar and add any optional contacts.</p>
      </div>

      {/* Section A — read-only Aadhaar-matched */}
      <section>
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>Fields below are auto-filled from your Aadhaar verification and cannot be edited.</p>
        </div>

        <div className="space-y-4">
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Full Name (As per Aadhaar) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={fieldClass(true)}
              value={jobForm.aad_name ?? ''}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Father&apos;s Name (As per Aadhaar) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={fieldClass(true)}
              value={fatherNameFromCareOf(jobForm.aad_care_of)}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="select-none rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="font-medium tabular-nums text-slate-900">{mobile}</p>
              <p className="mt-1 text-xs text-sky-900">This mobile number is locked and cannot be changed.</p>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Alternate Number / Alternate WhatsApp Number (Optional)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              className={fieldClass(false)}
              placeholder="10-digit alternate number"
              value={draft.pd_alternate_number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pd_alternate_number: normalizeMobile(e.target.value) }))
              }
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Optional: Provide if you have a different contact number for emergencies or WhatsApp updates.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-slate-200" />

      {/* Section B — Aadhaar-locked identity + editable application fields */}
      <section>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>
            State, city, address, pincode, date of birth, age, and gender come from your Aadhaar record and cannot be
            edited here.
          </p>
        </div>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Personal Details</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              className={fieldClass(false)}
              placeholder="example@example.com"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              State <span className="text-rose-500">*</span>
            </label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={jobForm.aad_state ?? ''} />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              City <span className="text-rose-500">*</span>
            </label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={cityFromJobForm(jobForm)} />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Complete Address (As per Aadhaar) <span className="text-rose-500">*</span>
            </label>
            <textarea
              readOnly
              tabIndex={-1}
              rows={3}
              className={`${fieldClass(true)} resize-none`}
              value={jobForm.aad_address ?? ''}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Pincode <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={`${fieldClass(true)} tabular-nums`}
              value={jobForm.aad_pincode ?? ''}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">
              Date of Birth <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={`${fieldClass(true)} tabular-nums`}
              value={formatAadDob(jobForm.aad_dob)}
            />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">Age</label>
            <input type="text" readOnly tabIndex={-1} className={fieldClass(true)} value={ageDisplay} placeholder="—" />
          </div>
          <div className="cursor-not-allowed">
            <label className="mb-1.5 block cursor-inherit text-sm font-medium text-slate-800">Gender</label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className={fieldClass(true)}
              value={formatAadGender(jobForm.aad_gender)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Marital Status <span className="text-rose-500">*</span>
            </label>
            <select
              className={fieldClass(false)}
              value={draft.pd_marital_status}
              onChange={(e) => setDraft((d) => ({ ...d, pd_marital_status: e.target.value }))}
            >
              <option value="">Select Marital Status</option>
              {MARITAL_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Do you have a Driving License? <span className="text-rose-500">*</span>
            </label>
            <select
              className={fieldClass(false)}
              value={draft.pd_driving_license}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => ({ ...d, pd_driving_license: v }));
                if (v !== 'Yes') {
                  setLicenseImageUrl('');
                  setLicenseError('');
                }
              }}
            >
              <option value="">Select</option>
              {DRIVING_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {needsLicenseImage && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="driving-license-file">
                Upload Driving License Image <span className="text-rose-500">*</span>
              </label>
              <input
                id="driving-license-file"
                type="file"
                accept="image/*"
                disabled={licenseUploading}
                onChange={handleLicenseFile}
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Max file size: 12MB. Supported: image/* (JPEG, PNG, WebP, GIF, HEIC, etc.)
              </p>
              {licenseUploading && <p className="mt-2 text-sm text-slate-600">Uploading…</p>}
              {licenseError && <p className="mt-2 text-sm text-rose-600">{licenseError}</p>}
              {licenseImageUrl && !licenseUploading && <UploadedFileBanner href={licenseImageUrl} />}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="button"
          disabled={!requiredOk || saving}
          onClick={handleSave}
          className="mt-8 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save & continue'}
        </button>
      </section>
    </div>
  );
}

export default function OnboardingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeId = searchParams.get('employee_id') || '';
  const resumeMode = searchParams.get('resume') === 'true';
  const resumeStep = searchParams.get('step') || '';

  const [mobile, setMobile] = useState('');
  const [mobileVerified, setMobileVerified] = useState(false);
  const [mobileSubmitting, setMobileSubmitting] = useState(false);
  const [mobileError, setMobileError] = useState('');

  const [aadhaar, setAadhaar] = useState('');
  const [aadhaarPhase, setAadhaarPhase] = useState(null);
  const [otp, setOtp] = useState('');
  const [aadhaarSubmitting, setAadhaarSubmitting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [aadhaarError, setAadhaarError] = useState('');

  const [aadhaarComplete, setAadhaarComplete] = useState(false);
  const [aadhaarKyc, setAadhaarKyc] = useState(null);

  const [formView, setFormView] = useState('onboarding');
  const [jobFormRow, setJobFormRow] = useState(null);
  const [proceedLoading, setProceedLoading] = useState(false);
  const [proceedError, setProceedError] = useState('');
  const correctionModeActive =
    resumeMode && String(jobFormRow?.review_status ?? '').trim() === 'CORRECTION_REQUESTED';

  const visibleSteps = (() => {
    if (!correctionModeActive || !jobFormRow) return STEP_ORDER;
    const editable = new Set(Array.isArray(jobFormRow.editable_fields) ? jobFormRow.editable_fields : []);
    const hasEditableForStep = (step) => {
      const rules = STEP_PREFIX_RULES[step] || [];
      for (const field of editable) {
        const f = String(field ?? '').trim();
        if (!f) continue;
        if (rules.some((prefix) => (prefix.endsWith('_') ? f.startsWith(prefix) : f === prefix))) return true;
      }
      return false;
    };
    const hasOptionalMissingForStep = (step) => {
      const optionalFields = STEP_OPTIONAL_FIELDS[step] || [];
      return optionalFields.some((k) => isEmptyForCorrection(jobFormRow?.[k]));
    };
    const filtered = STEP_ORDER.filter((step) => hasEditableForStep(step) || hasOptionalMissingForStep(step));
    if (filtered.length === 0) return ['personal', 'photo'];
    if (!filtered.includes('photo')) filtered.push('photo');
    return filtered;
  })();

  const nextVisibleStep = (current) => {
    const idx = visibleSteps.indexOf(current);
    if (idx < 0) return visibleSteps[0] || 'personal';
    return visibleSteps[idx + 1] || current;
  };

  const previousVisibleStep = (current) => {
    const idx = visibleSteps.indexOf(current);
    if (idx <= 0) return current;
    return visibleSteps[idx - 1] || current;
  };
  const correctionConfigForStep = (step) => {
    if (!correctionModeActive || !jobFormRow) {
      return { active: false, visibleFields: new Set(), requiredFields: new Set() };
    }
    const requiredFields = new Set(
      (Array.isArray(jobFormRow.editable_fields) ? jobFormRow.editable_fields : []).filter((f) =>
        (STEP_ALL_FIELDS[step] || []).includes(String(f ?? '').trim())
      )
    );
    const visibleFields = new Set(requiredFields);
    for (const optionalField of STEP_OPTIONAL_FIELDS[step] || []) {
      if (isEmptyForCorrection(jobFormRow?.[optionalField])) {
        visibleFields.add(optionalField);
      }
    }
    return { active: true, visibleFields, requiredFields };
  };

  const navigateToStatus = (mobileValue) => {
    const q = new URLSearchParams();
    q.set('mobile', mobileValue || mobile);
    if (employeeId) q.set('employee_id', employeeId);
    navigate(`/onboarding-status?${q.toString()}`);
  };

  const resolveResumeFormView = () => {
    const requested = resumeStep === 'qualification' || resumeStep === 'kyc' || resumeStep === 'photo' ? resumeStep : 'personal';
    if (visibleSteps.includes(requested)) return requested;
    return visibleSteps[0] || 'personal';
  };

  const hasValidMobile = TEN_DIGIT_REGEX.test(mobile);
  const hasValidAadhaar = TWELVE_DIGIT_REGEX.test(aadhaar);
  const hasValidOtp = SIX_DIGIT_REGEX.test(otp);

  const handleMobileContinue = async () => {
    if (!hasValidMobile || mobileSubmitting) return;
    setMobileSubmitting(true);
    setMobileError('');
    try {
      const result = await api.lookupOnboardingMobile({ mobile, employeeId });
      if (!result.matched) {
        setMobileError('This mobile number is not associated with a valid onboarding form.');
        return;
      }
      const { form } = await api.getJobAppForm({ mobile, employeeId });
      const reviewStatus = String(form?.review_status ?? '').trim();
      const submitted = String(form?.submission_status ?? '').trim() === 'Submitted';
      const isFinalized = reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED';
      const isWaitingForPm = submitted && reviewStatus !== 'CORRECTION_REQUESTED';
      if (isFinalized || isWaitingForPm) {
        navigateToStatus(mobile);
        return;
      }
      if (resumeMode && reviewStatus === 'CORRECTION_REQUESTED') {
        setMobileVerified(true);
        setAadhaarComplete(true);
        setJobFormRow(form);
        setFormView(resolveResumeFormView());
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setMobileVerified(true);
      setAadhaarPhase('input');
    } catch (err) {
      setMobileError(err.message || 'Unable to verify mobile number right now.');
    } finally {
      setMobileSubmitting(false);
    }
  };

  const handleSendAadhaarOtp = async () => {
    if (!hasValidAadhaar || aadhaarSubmitting || !mobileVerified) return;
    setAadhaarSubmitting(true);
    setAadhaarError('');
    try {
      await api.sendAadhaarOtp({ mobile, employeeId, aadhaar });
      setOtp('');
      setAadhaarPhase('otp');
    } catch (err) {
      setAadhaarError(err.message || 'Could not send OTP. Try again.');
    } finally {
      setAadhaarSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!hasValidOtp || otpVerifying) return;
    setOtpVerifying(true);
    setAadhaarError('');
    try {
      const result = await api.verifyAadhaarOtp({ mobile, employeeId, otp });
      setAadhaarKyc(result.aadhaarDetails ?? null);
      setAadhaarComplete(true);
    } catch (err) {
      setAadhaarError(err.message || 'Verification failed.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleProceedToPersonal = async () => {
    setProceedError('');
    setProceedLoading(true);
    try {
      const { form } = await api.getJobAppForm({ mobile, employeeId });
      const reviewStatus = String(form?.review_status ?? '').trim();
      const submitted = String(form?.submission_status ?? '').trim() === 'Submitted';
      const isFinalized = reviewStatus === 'APPROVED' || reviewStatus === 'REJECTED';
      const isWaitingForPm = submitted && reviewStatus !== 'CORRECTION_REQUESTED';
      if (isFinalized || isWaitingForPm) {
        navigateToStatus(mobile);
        return;
      }
      setJobFormRow(form);
      setFormView(resumeMode ? resolveResumeFormView() : 'personal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setProceedError(err.message || 'Could not load personal details.');
    } finally {
      setProceedLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <h1 className="text-2xl font-semibold text-slate-900">Job Application Form</h1>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            English
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {formView === 'photo' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <BankPhotoForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('photo')}
              onPrevious={() => {
                setFormView(previousVisibleStep('photo'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSubmitted={(form) => {
                setJobFormRow(form);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onGoToStatus={() => navigateToStatus(mobile)}
            />
          </div>
        ) : formView === 'kyc' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <KycDocumentsForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('kyc')}
              onPrevious={() => {
                setFormView(previousVisibleStep('kyc'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('kyc'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : formView === 'qualification' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <QualificationForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('qualification')}
              onPrevious={() => {
                setFormView(previousVisibleStep('qualification'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('qualification'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : formView === 'personal' && jobFormRow ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <FormStepper currentStep={1} />
            <PersonalDetailsForm
              jobForm={jobFormRow}
              mobile={mobile}
              employeeId={employeeId}
              correction={correctionConfigForStep('personal')}
              onSaveSuccess={(form) => {
                setJobFormRow(form);
                setFormView(nextVisibleStep('personal'));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-8 text-center">
              <p className="mb-4 text-sm font-semibold text-indigo-600">Onboarding Portal</p>
              <h2 className="mb-2 text-3xl font-semibold text-slate-900">Welcome to Our Job Portal</h2>
              <p className="text-slate-600">
                {!mobileVerified
                  ? 'Please enter your mobile number to begin your application'
                  : aadhaarComplete
                    ? 'Your Aadhaar has been verified. Review your details below.'
                    : 'Verify your Aadhaar to continue your application'}
              </p>
            </div>

            <div className="mx-auto max-w-xl">
              <div className={mobileVerified ? 'cursor-not-allowed' : undefined}>
                <label
                  htmlFor="onboarding-mobile"
                  className={`mb-2 block text-xl font-medium text-slate-800 ${mobileVerified ? 'cursor-inherit' : ''}`}
                >
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  id="onboarding-mobile"
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(normalizeMobile(e.target.value))}
                  inputMode="numeric"
                  maxLength={10}
                  readOnly={mobileVerified}
                  className={`w-full rounded-xl border px-5 py-4 text-2xl text-slate-900 ${
                    mobileVerified
                      ? 'cursor-not-allowed select-none border-slate-200 bg-sky-50'
                      : 'border-slate-300 bg-white'
                  }`}
                  placeholder="Enter 10-digit mobile number"
                />

                {!mobileVerified && (
                  <button
                    type="button"
                    onClick={handleMobileContinue}
                    disabled={!hasValidMobile || mobileSubmitting}
                    className="mt-5 w-full rounded-xl bg-indigo-600 py-4 text-xl font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mobileSubmitting ? 'Checking...' : 'Continue'}
                  </button>
                )}

                {mobileVerified && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                    <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm font-medium">
                      Mobile number verified: <span className="tabular-nums">{mobile}</span>
                    </p>
                  </div>
                )}

                {!mobileVerified && mobile.length > 0 && !hasValidMobile && (
                  <p className="mt-3 text-sm text-rose-600">Please enter a valid 10-digit mobile number.</p>
                )}
                {mobileError && <p className="mt-3 text-sm text-rose-600">{mobileError}</p>}
              </div>

              {!mobileVerified && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="font-semibold">Note:</span> Make sure you enter a valid mobile number. This number
                  will be used for all future communications.
                </div>
              )}

              {mobileVerified && !aadhaarComplete && (
                <>
                  <hr className="my-10 border-slate-200" />

                  <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <IconShield className="h-7 w-7 text-indigo-600" />
                    <h3 className="text-lg font-semibold">Aadhaar Verification</h3>
                  </div>

                  {aadhaarPhase === 'input' && (
                    <>
                      <p className="mb-4 text-sm text-slate-600">
                        Enter the 12-digit Aadhaar number linked to your mobile{' '}
                        <span className="tabular-nums">{mobile}</span>. We will send an OTP to your Aadhaar-registered
                        mobile number.
                      </p>
                      <label htmlFor="onboarding-aadhaar" className="mb-2 block text-sm font-medium text-slate-800">
                        Aadhaar Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="onboarding-aadhaar"
                        type="text"
                        value={aadhaar}
                        onChange={(e) => setAadhaar(normalizeAadhaar(e.target.value))}
                        inputMode="numeric"
                        maxLength={12}
                        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg tracking-widest text-slate-900 tabular-nums"
                        placeholder="12-digit Aadhaar"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={handleSendAadhaarOtp}
                        disabled={!hasValidAadhaar || aadhaarSubmitting}
                        className="mt-5 w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
                      >
                        {aadhaarSubmitting ? 'Sending...' : 'Send OTP'}
                      </button>
                    </>
                  )}

                  {aadhaarPhase === 'otp' && (
                    <>
                      <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                        OTP sent to your Aadhaar-registered mobile number.
                      </div>

                      <label htmlFor="onboarding-aadhaar-otp" className="mb-2 block text-sm font-medium text-slate-800">
                        Enter OTP <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="onboarding-aadhaar-otp"
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(normalizeOtp(e.target.value))}
                        inputMode="numeric"
                        maxLength={6}
                        className="mb-6 w-full max-w-xs rounded-lg border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.3em] text-slate-900 tabular-nums"
                        placeholder="6-digit OTP"
                        autoComplete="one-time-code"
                      />

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={!hasValidOtp || otpVerifying}
                          className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAadhaarPhase('input');
                            setOtp('');
                            setAadhaarError('');
                          }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-600 bg-white px-6 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          <IconArrowLeft className="h-4 w-4" />
                          Change Number
                        </button>
                      </div>
                    </>
                  )}

                  {aadhaarError && <p className="mt-4 text-sm text-rose-600">{aadhaarError}</p>}
                </>
              )}

              {aadhaarComplete && aadhaarKyc && (
                <>
                  <hr className="my-10 border-slate-200" />
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-slate-900">
                        <IconShield className="h-7 w-7 text-indigo-600" />
                        <h3 className="text-lg font-semibold">Aadhaar Verification</h3>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                        Verified
                      </span>
                    </div>

                    <div className="mb-6 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                      <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <p className="text-sm font-semibold">Aadhaar Verified Successfully</p>
                    </div>

                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                      <div className="shrink-0 sm:pt-0.5">
                        <img
                          src={aadhaarKyc.aad_profile_photo}
                          alt="Aadhaar profile photo"
                          className="h-32 w-32 rounded-xl border border-slate-200 object-cover shadow-sm"
                          width={128}
                          height={128}
                        />
                      </div>
                      <dl className="min-w-0 flex-1 space-y-4 text-sm">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
                          <dd className="mt-0.5 text-base font-medium text-slate-900">{aadhaarKyc.aad_name}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Father / Guardian</dt>
                          <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_care_of}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Date of birth</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-slate-900">
                            {formatAadDob(aadhaarKyc.aad_dob)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Gender</dt>
                          <dd className="mt-0.5 text-slate-800">{formatAadGender(aadhaarKyc.aad_gender)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</dt>
                          <dd className="mt-0.5 whitespace-pre-line text-slate-800">{aadhaarKyc.aad_address}</dd>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">State</dt>
                            <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_state}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">District</dt>
                            <dd className="mt-0.5 text-slate-800">{aadhaarKyc.aad_district}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Pincode</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{aadhaarKyc.aad_pincode}</dd>
                          </div>
                        </div>
                      </dl>
                    </div>

                    <p className="mb-2 mt-6 text-xs text-slate-500">
                      Aadhaar KYC details are fetched from verification response and stored on your application record.
                    </p>
                    {proceedError && <p className="mt-2 text-sm text-rose-600">{proceedError}</p>}
                    <button
                      type="button"
                      onClick={handleProceedToPersonal}
                      disabled={proceedLoading}
                      className="mt-2 w-full rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {proceedLoading ? 'Loading...' : (
                        <>
                          Proceed to Personal Details <span aria-hidden>›</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {aadhaarComplete && !aadhaarKyc && (
                <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
                  <div className="flex items-start gap-2">
                    <IconCheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold">Aadhaar verified</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        Your identity has been confirmed. Refresh the page if details do not appear.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
