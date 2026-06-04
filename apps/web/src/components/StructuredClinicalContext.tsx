"use client";

import { useState } from "react";
import {
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface StructuredClinicalContextProps {
  denialId: string;
  initialContext?: string;
  onContextChange: (context: string) => void;
}

export function StructuredClinicalContext({
  denialId,
  initialContext = "",
  onContextChange,
}: StructuredClinicalContextProps) {
  const [context, setContext] = useState(initialContext);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const handleDocumentUpload = async (file: File) => {
    setExtractError(null);
    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.append("document", file);

      const res = await fetch("/api/clinical-context/extract", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to extract from document");
      }

      if (data.extracted) {
        setContext(data.extracted);
        onContextChange(data.extracted);
      }
    } catch (error) {
      console.error("Document extraction failed:", error);
      setExtractError(error instanceof Error ? error.message : "Failed to extract from document");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <label className="btn-secondary text-sm cursor-pointer relative">
          <ArrowPathIcon className="h-4 w-4 inline mr-1" />
          {isExtracting ? "Extracting..." : "Upload Document"}
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            className="hidden"
            disabled={isExtracting}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleDocumentUpload(file);
            }}
          />
        </label>
      </div>

      {extractError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {extractError}
        </div>
      )}

      {/* Main Clinical Context Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Clinical Context
        </label>
        <textarea
          value={context}
          onChange={(e) => {
            setContext(e.target.value);
            onContextChange(e.target.value);
          }}
          rows={6}
          className="w-full border border-gray-300 rounded-md p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-700"
          placeholder="Paste clinical documentation from your EHR, upload a file above, or use the dropdowns to add common clinical phrases."
        />
      </div>
    </div>
  );
}
