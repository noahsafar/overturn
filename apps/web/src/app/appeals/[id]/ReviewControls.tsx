"use client";

import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";

// Shared state for the appeal-review UI. The editor (textarea + AI edit
// prompt) sits in the Draft letter section; the action buttons (Approve /
// Reject) sit at the bottom of the page. Both reach into the same provider
// so an Approve click can read the latest textarea contents.

type ReviewCtx = {
  text: string;
  setText: (s: string) => void;
  isDirty: boolean;
  showAiPrompt: boolean;
  setShowAiPrompt: (v: boolean | ((p: boolean) => boolean)) => void;
  editPrompt: string;
  setEditPrompt: (s: string) => void;
  err: string | null;
  pending: boolean;
  mode: "review" | "submitted";
  handleAiEdit: () => void;
  handleApprove: () => void;
  handleReject: () => void;
};

const Ctx = createContext<ReviewCtx | null>(null);

function useReview(): ReviewCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("Review components must be inside <ReviewProvider>");
  return c;
}

export function ReviewProvider({
  appealId,
  initialLetter,
  children,
}: {
  appealId: string;
  initialLetter: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialLetter);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"review" | "submitted">("review");

  const isDirty = text !== initialLetter;

  const handleAiEdit = () => {
    startTransition(async () => {
      setErr(null);
      const res = await fetch(`/api/appeals/${appealId}/ai-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ letter: text, prompt: editPrompt }),
      });
      if (!res.ok) {
        setErr(await res.text());
      } else {
        const data = await res.json();
        setText(data.letter);
        setEditPrompt("");
      }
    });
  };

  const handleApprove = () => {
    startTransition(async () => {
      setErr(null);
      // If the textarea was edited, save those edits along with approval
      // via /edit; otherwise just /approve.
      const path = isDirty ? "edit" : "approve";
      const body = isDirty ? { letter: text } : undefined;
      const res = await fetch(`/api/appeals/${appealId}/${path}`, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        setErr(await res.text());
      } else {
        setMode("submitted");
        router.refresh();
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      setErr(null);
      const res = await fetch(`/api/appeals/${appealId}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        setErr(await res.text());
      } else {
        router.refresh();
      }
    });
  };

  return (
    <Ctx.Provider
      value={{
        text,
        setText,
        isDirty,
        showAiPrompt,
        setShowAiPrompt,
        editPrompt,
        setEditPrompt,
        err,
        pending,
        mode,
        handleAiEdit,
        handleApprove,
        handleReject,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function ReviewEditor() {
  const r = useReview();

  if (r.mode === "submitted") {
    return (
      <div className="card flex items-center gap-3 border-success-200 bg-success-50 p-4">
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-success-600" />
        <div>
          <p className="text-sm font-medium text-success-700">
            Appeal submitted successfully
          </p>
          <p className="text-xs text-success-600">
            The appeal has been sent to the payer for review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={r.text}
        onChange={(e) => r.setText(e.target.value)}
        className="card min-h-[420px] w-full p-4 font-mono text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
        spellCheck
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={r.pending}
          onClick={() => r.setShowAiPrompt((v) => !v)}
          className="btn-secondary disabled:opacity-50"
        >
          <SparklesIcon className="h-4 w-4" />
          {r.showAiPrompt ? "Hide AI edit" : "Edit with AI"}
        </button>
        {r.isDirty && (
          <span className="ml-1 text-xs text-gray-500">
            unsaved edits — will be saved on approve
          </span>
        )}
      </div>

      {r.showAiPrompt && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Describe the change you want the AI to make
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={r.editPrompt}
              onChange={(e) => r.setEditPrompt(e.target.value)}
              placeholder="e.g. Tighten the opening paragraph and remove redundancy"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            <button
              type="button"
              disabled={r.pending || !r.editPrompt.trim()}
              onClick={r.handleAiEdit}
              className="btn-primary whitespace-nowrap disabled:opacity-50"
            >
              {r.pending ? "Applying…" : "Apply"}
            </button>
            <button
              type="button"
              disabled={r.pending}
              onClick={() => {
                r.setShowAiPrompt(false);
                r.setEditPrompt("");
              }}
              className="btn-secondary disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewActions() {
  const r = useReview();
  if (r.mode === "submitted") return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={r.pending}
          onClick={r.handleApprove}
          className="btn-primary disabled:opacity-50"
        >
          <CheckCircleIcon className="h-4 w-4" />
          {r.pending ? "Submitting…" : "Approve & submit"}
        </button>
        <button
          type="button"
          disabled={r.pending}
          onClick={r.handleReject}
          className="btn-secondary disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {r.err && <p className="text-sm text-error-700">{r.err}</p>}
    </div>
  );
}
