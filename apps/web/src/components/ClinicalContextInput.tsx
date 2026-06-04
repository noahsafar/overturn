"use client";

import { useState, useTransition } from "react";
import {
  SparklesIcon,
  DocumentTextIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface ClinicalContextInputProps {
  denialId: string;
  initialContext?: string;
  onContextChange: (context: string) => void;
}

export function ClinicalContextInput({
  denialId,
  initialContext = "",
  onContextChange,
}: ClinicalContextInputProps) {
  const [context, setContext] = useState(initialContext);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/clinical-context/generate/${denialId}`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to generate template");
      }

      const data = await res.json();
      setContext(data.clinicalContext);
      onContextChange(data.clinicalContext);
      setIsTemplate(true);
    } catch (error) {
      console.error("Auto-generate failed:", error);
      setTemplateError("Failed to generate template. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDocumentUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setSaved(false);

    try {
      const formData = new FormData();
      formData.append("document", file);

      const res = await fetch("/api/clinical-context/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to process document");
      }

      const data = await res.json();

      if (data.success && data.extracted) {
        setContext(data.extracted);
        onContextChange(data.extracted);
        setIsTemplate(true);
        setSaved(false); // Mark as unsaved so user knows to save
      } else {
        throw new Error(data.error || "Failed to extract content");
      }
    } catch (error) {
      console.error("Document upload failed:", error);
      setUploadError(
        (error as Error).message ||
        "Failed to process document. Please try a different file."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setSaved(false);
    try {
      const res = await fetch(`/api/denials/${denialId}/chart`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartExcerptsText: context }),
      });

      if (!res.ok) {
        throw new Error("Failed to save clinical context");
      }

      setSaved(true);

      // Show success feedback then clear after a delay
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Save failed:", error);
      setSaved(false);
    }
  };

  const handleClear = () => {
    setContext("");
    onContextChange("");
    setIsTemplate(false);
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleAutoGenerate}
          disabled={isGenerating}
          className="btn-secondary text-sm"
        >
          <SparklesIcon className="h-4 w-4 inline mr-1" />
          {isGenerating ? "Generating..." : "Generate Template"}
        </button>

        <label className="btn-secondary text-sm cursor-pointer">
          <CloudArrowUpIcon className="h-4 w-4 inline mr-1" />
          Upload Document
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                await handleDocumentUpload(file);
              }
            }}
          />
          {isUploading && " (Processing...)"}
        </label>

        {context && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Error Messages */}
      {uploadError && (
        <div className="card border-error-200 bg-error-50 p-3">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-error-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-error-700">{uploadError}</p>
            </div>
          </div>
        </div>
      )}

      {templateError && (
        <div className="card border-warning-200 bg-warning-50 p-3">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-700">{templateError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Editor */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Clinical Context for Appeal
        </label>
        <p className="mb-2 text-xs text-gray-500">
          This is the clinical documentation that supports your appeal. The AI will cite verbatim
          from this text when generating the appeal letter. Include specific measurements, assessments,
          and progress notes from your medical records.
        </p>

        <textarea
          value={context}
          onChange={(e) => {
            setContext(e.target.value);
            onContextChange(e.target.value);
            setIsTemplate(false);
            setSaved(false);
          }}
          rows={15}
          className="block w-full border border-gray-300 rounded-md p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-700"
          placeholder="Option 1: Upload a medical document (PDF) to auto-populate this field&#10;&#10;Option 2: Click 'Generate Template' for a denial-specific template&#10;&#10;Option 3: Paste clinical context manually from your EHR system"
        />
      </div>

      {/* Document Upload Info */}
      {isTemplate && context && (
        <div className="card bg-blue-50 border-blue-200 p-3">
          <div className="flex items-start gap-2">
            <DocumentTextIcon className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-700">
                {isTemplate ? "Template generated from claim data" : "Extracted from document"}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Review and edit this context before saving. The AI will cite verbatim from this
                text when generating your appeal letter.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      {context && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary"
          >
            {saved ? "Saved" : "Save Clinical Context"}
          </button>
          {saved && (
            <span className="text-sm text-success-700 flex items-center">
              <CheckCircleIcon className="h-5 w-5 inline mr-1" />
              Clinical context saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
