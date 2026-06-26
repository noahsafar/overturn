"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  DocumentIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

type FileStatus = "pending" | "processing" | "success" | "error";

interface FileUpload {
  file: File;
  status: FileStatus;
  denials?: number;
  skipped?: number;
  message?: string;
}

export default function UploadPage() {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalInfo, setGlobalInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const ACCEPTED_FORMATS = [
    ".txt", ".era", ".835", ".csv", ".pdf",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ];

  const handleFilesSelect = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: FileUpload[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!;
      const ext = "." + file.name.split(".").pop()?.toLowerCase();

      if (ACCEPTED_FORMATS.includes(ext)) {
        newFiles.push({
          file,
          status: "pending",
        });
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      setGlobalError(null);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    handleFilesSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
    setResult(null);
    setGlobalError(null);
  };

  const handleUpload = () => {
    if (files.length === 0) return;

    setGlobalError(null);
    setGlobalInfo(null);
    setResult(null);

    // Mark all as processing
    setFiles((prev) => prev.map((f) => ({ ...f, status: "processing" as const })));

    startTransition(async () => {
      try {
        const formData = new FormData();
        files.forEach((f) => {
          formData.append("files", f.file);
        });

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorText = await res.text();
          setGlobalError(errorText);
          setFiles((prev) =>
            prev.map((f) => ({ ...f, status: "error" as const }))
          );
          return;
        }

        const data = (await res.json()) as {
          results: Array<{
            file: string;
            denials: number;
            skipped: number;
            status: string;
            message?: string;
          }>;
          total: number;
          totalSkipped: number;
          errors: number;
        };

        // Update file statuses
        setFiles((prev) =>
          prev.map((f) => {
            const result = data.results.find((r) => r.file === f.file.name);
            if (result) {
              return {
                ...f,
                status: result.status === "error" ? "error" : ("success" as const),
                denials: result.denials,
                skipped: result.skipped,
                message: result.message,
              };
            }
            return f;
          })
        );

        // Three distinct outcomes:
        //  - new denials created → success banner
        //  - no new but some were already imported → info banner (not an error)
        //  - nothing created and nothing skipped → genuine parse failure → error
        if (data.total > 0) {
          const skippedSuffix =
            data.totalSkipped > 0
              ? ` (${data.totalSkipped} duplicate${data.totalSkipped !== 1 ? "s" : ""} skipped)`
              : "";
          setResult(
            `Successfully processed ${data.total} denial${data.total !== 1 ? "s" : ""}${skippedSuffix}${
              data.errors > 0 ? `, ${data.errors} file${data.errors !== 1 ? "s" : ""} had issues` : ""
            }. Appeal drafts are ready for review.`,
          );
          router.refresh();
        } else if (data.errors > 0) {
          setGlobalError("Could not extract denial information from uploaded files");
        } else if (data.totalSkipped > 0) {
          setGlobalInfo(
            `${data.totalSkipped} claim${data.totalSkipped !== 1 ? "s" : ""} already imported — nothing new to add.`,
          );
        } else {
          setGlobalError("No denial information found in uploaded files");
        }
      } catch (error) {
        setGlobalError(
          error instanceof Error ? error.message : "Upload failed"
        );
        setFiles((prev) => prev.map((f) => ({ ...f, status: "error" as const })));
      }
    });
  };

  const anyProcessing = files.some((f) => f.status === "processing");
  const anySuccess = files.some((f) => f.status === "success");
  const totalDenials = files.reduce((sum, f) => sum + (f.denials || 0), 0);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Upload denied claims
        </h1>
        <p className="mt-2 text-base text-gray-600">
          Upload files with denied insurance claims. We'll automatically extract claim details and generate appeal drafts.
        </p>
      </div>

      {/* Main Upload Area */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-brand-500 bg-brand-50 scale-[1.02]"
            : files.length === 0
            ? "border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50"
            : "border-brand-200 bg-white"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FORMATS.join(",")}
          className="hidden"
          onChange={(e) => handleFilesSelect(e.target.files)}
        />

        {files.length === 0 ? (
          <div className="space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 mx-auto">
              <CloudArrowUpIcon className="h-8 w-8 text-brand-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                Drop your files here
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Supports ERA files, billing exports, PDFs, and images
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mx-auto">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {files.length} file{files.length !== 1 ? "s" : ""} ready
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Click or drag to add more
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              Files to process
            </span>
            {files.length > 1 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-200">
            {files.map((f, i) => (
              <div
                key={`${f.file.name}-${i}`}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div className="flex-shrink-0">
                  {f.status === "processing" && (
                    <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                  )}
                  {f.status === "success" && (
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  )}
                  {f.status === "error" && (
                    <ExclamationCircleIcon className="h-5 w-5 text-red-500" />
                  )}
                  {f.status === "pending" && (
                    <DocumentIcon className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {f.file.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">
                      {(f.file.size / 1024).toFixed(1)} KB
                    </span>
                    {f.denials !== undefined && f.denials > 0 && (
                      <span className="text-xs font-medium text-green-600">
                        {f.denials} new denial{f.denials !== 1 ? "s" : ""}
                      </span>
                    )}
                    {f.skipped !== undefined && f.skipped > 0 && (
                      <span className="text-xs font-medium text-gray-500">
                        {f.skipped} already imported
                      </span>
                    )}
                    {f.message && (
                      <span className="text-xs text-gray-500">
                        {f.message}
                      </span>
                    )}
                  </div>
                </div>
                {f.status !== "processing" && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Button */}
      {files.length > 0 && (
        <div className="flex items-center gap-4">
          <button
            disabled={pending || anyProcessing}
            onClick={handleUpload}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending || anyProcessing ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />
                Processing...
              </>
            ) : (
              "Process files"
            )}
          </button>
          {result && (
            <div className="inline-flex items-center gap-2 text-sm font-medium text-success-700">
              <CheckCircleIcon className="h-5 w-5" />
              {result}
            </div>
          )}
        </div>
      )}

      {/* Info Display — non-error outcomes that still warrant a message
          (e.g. all claims were already imported on a re-upload). */}
      {globalInfo && (
        <div className="card border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="h-5 w-5 shrink-0 text-gray-500" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-700">Nothing new to import</h4>
              <p className="mt-1 text-sm text-gray-700">{globalInfo}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {globalError && (
        <div className="card border-error-200 bg-error-50 p-4">
          <div className="flex items-start gap-3">
            <ExclamationCircleIcon className="h-5 w-5 shrink-0 text-error-600" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-error-700">Processing issue</h4>
              <p className="mt-1 text-sm text-error-700">{globalError}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
