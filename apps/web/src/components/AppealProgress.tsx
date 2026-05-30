"use client";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "PENDING", label: "Starting", description: "Initializing workflow" },
  { key: "LOADING_CONTEXT", label: "Loading Context", description: "Retrieving claim details" },
  { key: "RETRIEVING_POLICIES", label: "Finding Policies", description: "Searching payer policies" },
  { key: "STRATEGIZING", label: "Analyzing", description: "AI analyzing denial" },
  { key: "DRAFTING", label: "Drafting", description: "Writing appeal letter" },
  { key: "VERIFYING_CITATIONS", label: "Verifying", description: "Checking citations" },
  { key: "REWRITING", label: "Refining", description: "Fixing citation issues" },
  { key: "READY", label: "Complete", description: "Appeal ready for review" },
  { key: "FAILED", label: "Failed", description: "Workflow encountered an error" },
  { key: "SKIPPED", label: "Skipped", description: "Low win probability" },
] as const;

type AppealStatus = typeof STEPS[number]["key"];

interface AppealProgressProps {
  currentStatus: AppealStatus;
}

function getStepIndex(status: AppealStatus): number {
  const index = STEPS.findIndex((s) => s.key === status);
  if (index === -1) return 0;
  return index;
}

function isStepComplete(currentStepIndex: number, checkStepIndex: number): boolean {
  // FAILED and SKIPPED are terminal states that don't follow the normal flow
  if (checkStepIndex === STEPS.findIndex((s) => s.key === "FAILED")) return false;
  if (checkStepIndex === STEPS.findIndex((s) => s.key === "SKIPPED")) return false;
  return checkStepIndex < currentStepIndex;
}

function isStepCurrent(currentStepIndex: number, checkStepIndex: number): boolean {
  return checkStepIndex === currentStepIndex;
}

export function AppealProgress({ currentStatus }: AppealProgressProps) {
  const currentIndex = getStepIndex(currentStatus);
  const isComplete = currentStatus === "READY" || currentStatus === "SKIPPED";
  const isFailed = currentStatus === "FAILED";

  // Filter out terminal states from the progress flow
  const flowSteps = STEPS.filter(
    (s) => s.key !== "FAILED" && s.key !== "SKIPPED"
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Appeal Progress</h3>
        {!isComplete && !isFailed && (
          <span className="text-xs text-gray-500">Processing...</span>
        )}
        {isComplete && (
          <span className="text-xs text-green-600 font-medium">Complete</span>
        )}
        {isFailed && (
          <span className="text-xs text-red-600 font-medium">Failed</span>
        )}
      </div>

      <div className="relative">
        {/* Progress bar background */}
        <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200 -z-10" />

        {/* Active progress bar */}
        {!isFailed && (
          <div
            className={cn(
              "absolute top-3 left-0 h-0.5 bg-blue-500 transition-all duration-500 -z-10",
              isComplete && "bg-green-500"
            )}
            style={{
              width: isComplete
                ? "100%"
                : `${(currentIndex / (flowSteps.length - 1)) * 100}%`,
            }}
          />
        )}

        {/* Steps */}
        <div className="flex justify-between">
          {flowSteps.map((step, idx) => {
            const stepComplete = isStepComplete(currentIndex, idx);
            const stepCurrent = isStepCurrent(currentIndex, idx);

            return (
              <div key={step.key} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                    stepComplete && "bg-green-500 text-white",
                    stepCurrent && !isComplete && "bg-blue-500 text-white animate-pulse",
                    !stepComplete && !stepCurrent && "bg-gray-200 text-gray-500",
                    isFailed && "bg-gray-200 text-gray-500"
                  )}
                >
                  {stepComplete ? "✓" : idx + 1}
                </div>
                <div className="text-[10px] text-gray-600 text-center max-w-[60px] leading-tight">
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current step description */}
      {!isComplete && !isFailed && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          {flowSteps[currentIndex]?.description || "Processing..."}
        </p>
      )}
      {isFailed && (
        <p className="text-xs text-red-500 mt-2 text-center">
          The appeal workflow encountered an error. Please try again.
        </p>
      )}
    </div>
  );
}

export function AppealProgressInline({ currentStatus }: AppealProgressProps) {
  const currentStep = STEPS.find((s) => s.key === currentStatus);

  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          currentStatus === "READY" && "bg-green-500",
          currentStatus === "FAILED" && "bg-red-500",
          currentStatus === "SKIPPED" && "bg-yellow-500",
          !["READY", "FAILED", "SKIPPED"].includes(currentStatus) && "bg-blue-500 animate-pulse"
        )}
      />
      <span className="text-gray-700">
        {currentStep?.label || "Unknown"}
      </span>
      {currentStatus !== "READY" && currentStatus !== "FAILED" && currentStatus !== "SKIPPED" && (
        <span className="text-gray-400">•</span>
      )}
      {currentStatus !== "READY" && currentStatus !== "FAILED" && currentStatus !== "SKIPPED" && (
        <span className="text-gray-500 text-xs">
          {currentStep?.description}
        </span>
      )}
    </div>
  );
}
