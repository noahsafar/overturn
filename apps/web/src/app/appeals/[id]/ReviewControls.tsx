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
      <div className="bg-green-50 border border-green-200 rounded p-4 flex items-center gap-3">
        <CheckCircleIcon className="h-5 w-5 text-green-600" />
        <div>
          <p className="text-sm font-medium text-green-900">
            Appeal submitted successfully
          </p>
          <p className="text-xs text-green-700">
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
        className="w-full min-h-[420px] bg-white border border-gray-200 rounded p-4 text-sm leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
        spellCheck
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={r.pending}
          onClick={() => r.setShowAiPrompt((v) => !v)}
          className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          {r.showAiPrompt ? "Hide AI edit" : "Edit with AI"}
        </button>
        {r.isDirty && (
          <span className="text-xs text-gray-500 ml-1">
            unsaved edits — will be saved on approve
          </span>
        )}
      </div>

      {r.showAiPrompt && (
        <div className="border border-gray-200 rounded p-3 bg-gray-50">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Describe the change you want the AI to make
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={r.editPrompt}
              onChange={(e) => r.setEditPrompt(e.target.value)}
              placeholder="e.g. Tighten the opening paragraph and remove redundancy"
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
            <button
              disabled={r.pending || !r.editPrompt.trim()}
              onClick={r.handleAiEdit}
              className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
            >
              {r.pending ? "Applying…" : "Apply"}
            </button>
            <button
              disabled={r.pending}
              onClick={() => {
                r.setShowAiPrompt(false);
                r.setEditPrompt("");
              }}
              className="bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
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
          disabled={r.pending}
          onClick={r.handleApprove}
          className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {r.pending ? "Submitting…" : "Approve & submit"}
        </button>
        <button
          disabled={r.pending}
          onClick={r.handleReject}
          className="bg-white border border-gray-300 text-gray-500 px-3 py-1.5 rounded text-sm hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {r.err && <p className="text-sm text-red-700">{r.err}</p>}
    </div>
  );
}
