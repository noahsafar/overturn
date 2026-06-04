"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowPathIcon,
  ChevronDownIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface StructuredClinicalContextProps {
  denialId: string;
  initialContext?: string;
  onContextChange: (context: string) => void;
}

const commonScenarios = [
  "Chronic pain affecting daily activities",
  "Post-surgical rehabilitation",
  "Work-related injury recovery",
  "Neurological condition affecting mobility",
  "Developmental delay affecting function",
  "Sports injury rehabilitation",
];

const commonFunctionalLimitations = [
  "Limited range of motion in affected area",
  "Pain interfering with normal activities",
  "Weakness affecting functional mobility",
  "Balance and coordination deficits",
  "Inability to perform work duties",
  "Difficulty with activities of daily living",
];

const treatmentPlanOptions = [
  "Therapeutic exercise program",
  "Manual therapy techniques",
  "Neuromuscular re-education",
  "Gait training and mobility exercises",
  "Balance and coordination training",
  "Functional activities and task practice",
  "Patient education and home program",
];

export function StructuredClinicalContext({
  denialId,
  initialContext = "",
  onContextChange,
}: StructuredClinicalContextProps) {
  const [context, setContext] = useState(initialContext);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedLimitations, setSelectedLimitations] = useState<string[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);

  // State for dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = {
    scenarios: useRef<HTMLDivElement>(null),
    limitations: useRef<HTMLDivElement>(null),
    treatment: useRef<HTMLDivElement>(null),
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const ref = dropdownRefs[openDropdown as keyof typeof dropdownRefs];
        if (ref && ref.current && !ref.current.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  const toggleItem = (item: string, current: string[], setter: (items: string[]) => void) => {
    if (current.includes(item)) {
      setter(current.filter((i) => i !== item));
    } else {
      setter([...current, item]);
    }
  };

  const handleDocumentUpload = async (file: File) => {
    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.append("document", file);

      const res = await fetch("/api/clinical-context/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to extract from document");

      const data = await res.json();

      if (data.success && data.extracted) {
        setContext(data.extracted);
        onContextChange(data.extracted);
      }
    } catch (error) {
      console.error("Document extraction failed:", error);
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

      {/* Dropdowns for structured selection */}
      <div className="space-y-3">
        {/* Common Scenarios */}
        <div ref={dropdownRefs.scenarios}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Clinical Scenarios
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === "scenarios" ? null : "scenarios")}
              className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md p-2 text-sm text-left flex items-center justify-between transition-colors"
            >
              <span className="text-gray-600">
                {selectedScenarios.length > 0
                  ? `${selectedScenarios.length} selected`
                  : "Select scenarios..."}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>
            {openDropdown === "scenarios" && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {commonScenarios.map((scenario) => (
                  <label
                    key={scenario}
                    className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario)}
                      onChange={() => toggleItem(scenario, selectedScenarios, setSelectedScenarios)}
                      className="mr-2"
                    />
                    <span className="text-sm">{scenario}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedScenarios.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedScenarios.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => toggleItem(item, selectedScenarios, setSelectedScenarios)}
                    className="hover:text-gray-900"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Functional Limitations */}
        <div ref={dropdownRefs.limitations}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Functional Limitations
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === "limitations" ? null : "limitations")}
              className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md p-2 text-sm text-left flex items-center justify-between transition-colors"
            >
              <span className="text-gray-600">
                {selectedLimitations.length > 0
                  ? `${selectedLimitations.length} selected`
                  : "Select limitations..."}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>
            {openDropdown === "limitations" && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {commonFunctionalLimitations.map((limitation) => (
                  <label
                    key={limitation}
                    className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLimitations.includes(limitation)}
                      onChange={() =>
                        toggleItem(limitation, selectedLimitations, setSelectedLimitations)
                      }
                      className="mr-2"
                    />
                    <span className="text-sm">{limitation}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedLimitations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedLimitations.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => toggleItem(item, selectedLimitations, setSelectedLimitations)}
                    className="hover:text-gray-900"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Treatment Plan */}
        <div ref={dropdownRefs.treatment}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Treatment Plan
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === "treatment" ? null : "treatment")}
              className="w-full bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md p-2 text-sm text-left flex items-center justify-between transition-colors"
            >
              <span className="text-gray-600">
                {selectedTreatments.length > 0
                  ? `${selectedTreatments.length} selected`
                  : "Select treatments..."}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>
            {openDropdown === "treatment" && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {treatmentPlanOptions.map((option) => (
                  <label
                    key={option}
                    className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTreatments.includes(option)}
                      onChange={() => toggleItem(option, selectedTreatments, setSelectedTreatments)}
                      className="mr-2"
                    />
                    <span className="text-sm">{option}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedTreatments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedTreatments.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => toggleItem(item, selectedTreatments, setSelectedTreatments)}
                    className="hover:text-gray-900"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

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
          rows={12}
          className="w-full border border-gray-300 rounded-md p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-700"
          placeholder="Paste clinical documentation from your EHR, upload a file above, or use the dropdowns to add common clinical phrases."
        />
        <p className="mt-2 text-xs text-gray-500">
          The AI will cite verbatim from this text when generating the appeal letter. Include specific measurements, assessments, and progress notes.
        </p>
      </div>
    </div>
  );
}
