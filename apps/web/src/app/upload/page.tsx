"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";

const SAMPLE_CSV = `external_patient_id,first_name,last_name,dob,member_id,payer_id,service_date,cpt,icd,billed_amount,submitted_at,denial_code,denial_reason,denied_amount,era_raw,received_at
PT-0042,Alex,Kim,1992-03-04,YJK111222333,seed_payer_bcbs,2025-10-01,90837,F33.1,180.00,2025-10-03,CO-50,Not deemed a medical necessity,180.00,"CAS*CO*50*180.00",2025-10-15`;

type UploadMode = "csv" | "era";

export default function UploadPage() {
  const [mode, setMode] = useState<UploadMode>("era");
  const [csv, setCsv] = useState("");
  const [eraFile, setEraFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpload = () => {
    setErr(null);
    setResult(null);

    if (mode === "csv") {
      startTransition(async () => {
        const res = await fetch("/api/claims/upload", {
          method: "POST",
          headers: { "content-type": "text/csv" },
          body: csv,
        });
        if (!res.ok) {
          setErr(await res.text());
        } else {
          const j = (await res.json()) as { created: number };
          setResult(`Imported ${j.created} denial(s).`);
          setCsv("");
          router.refresh();
        }
      });
    } else {
      if (!eraFile) {
        setErr("Please select an ERA file");
        return;
      }
      startTransition(async () => {
        const formData = new FormData();
        formData.append("era", eraFile);
        const res = await fetch("/api/era/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          setErr(await res.text());
        } else {
          const j = (await res.json()) as { created: number };
          setResult(`Imported ${j.created} denial(s).`);
          setEraFile(null);
          router.refresh();
        }
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Upload claims & denials
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {mode === "csv"
            ? "Paste a CSV of denied claims. Each row creates a patient (if new), claim, and denial."
            : "Upload an ERA/835 file to parse denied claims automatically."}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode("era")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "era"
              ? "border-brand-700 text-brand-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <DocumentIcon className="h-4 w-4 inline mr-1" />
          ERA File
        </button>
        <button
          type="button"
          onClick={() => setMode("csv")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === "csv"
              ? "border-brand-700 text-brand-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <DocumentTextIcon className="h-4 w-4 inline mr-1" />
          CSV Text
        </button>
      </div>

      {mode === "csv" ? (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              CSV input
            </div>
            <button
              type="button"
              className="text-xs font-medium text-primary-700 hover:text-primary-800"
              onClick={() => setCsv(SAMPLE_CSV)}
            >
              Load sample row
            </button>
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={14}
            className="block w-full resize-none border-0 bg-white p-4 font-mono text-xs leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            placeholder="paste CSV with headers…"
          />
        </div>
      ) : (
        <div className="card p-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <ArrowUpTrayIcon className="h-6 w-6 text-gray-400" />
            </div>
            <div className="text-center">
              <label
                htmlFor="era-upload"
                className="cursor-pointer text-sm font-medium text-primary-700 hover:text-primary-800"
              >
                Select ERA file
                <input
                  id="era-upload"
                  type="file"
                  accept=".txt,.era,.835"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setEraFile(file);
                  }}
                />
              </label>
              <p className="mt-1 text-xs text-gray-500">
                ERA/835 files (.txt, .era, .835)
              </p>
            </div>
            {eraFile && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <DocumentIcon className="h-4 w-4" />
                {eraFile.name}
                <button
                  type="button"
                  onClick={() => setEraFile(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          disabled={pending || (mode === "csv" ? !csv.trim() : !eraFile)}
          onClick={handleUpload}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          {pending ? "Uploading…" : "Upload"}
        </button>
        {result && (
          <div className="inline-flex items-center gap-2 text-sm font-medium text-success-700">
            <CheckCircleIcon className="h-5 w-5" />
            {result}
          </div>
        )}
      </div>

      {err && (
        <div className="card border-error-200 bg-error-50 p-4">
          <div className="flex items-start gap-3">
            <ExclamationCircleIcon className="h-5 w-5 shrink-0 text-error-600" />
            <div>
              <h4 className="text-sm font-semibold text-error-700">Upload failed</h4>
              <pre className="mt-1 whitespace-pre-wrap text-xs text-error-700">{err}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
