"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

type Mode = "review" | "editing" | "submitted";

export function ReviewControls({ appealId, initialLetter }: { appealId: string; initialLetter: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("review");
  const [text, setText] = useState(initialLetter);
  const [editPrompt, setEditPrompt] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const post = (path: string, body?: object) =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        setErr(null);
        const res = await fetch(`/api/appeals/${appealId}/${path}`, {
          method: "POST",
          headers: body ? { "content-type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          setErr(await res.text());
        } else {
          router.refresh();
        }
        resolve();
      });
    });

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
      }
    });
  };

  const handleApprove = () => {
    startTransition(async () => {
      setErr(null);
      const res = await fetch(`/api/appeals/${appealId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        setErr(await res.text());
      } else {
        setMode("submitted");
        router.refresh();
      }
    });
  };

  if (mode === "submitted") {
    return (
      <section className="bg-green-50 border border-green-200 rounded p-4 flex items-center gap-3">
        <CheckCircleIcon className="h-5 w-5 text-green-600" />
        <div>
          <p className="text-sm font-medium text-green-900">Appeal submitted successfully</p>
          <p className="text-xs text-green-700">The appeal has been sent to the payer for review.</p>
        </div>
      </section>
    );
  }

  if (mode === "editing") {
    return (
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-brand-900">Edit draft</h2>
          <button
            disabled={pending}
            onClick={() => { setText(initialLetter); setMode("review"); }}
            className="text-gray-600 text-sm hover:underline"
          >
            Cancel
          </button>
        </div>

        {/* Manual editing area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Letter</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-64 border border-gray-300 rounded p-3 font-mono text-sm"
          />
        </div>

        {/* AI editing area */}
        <div className="border border-gray-200 rounded p-3 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-1">✨ AI Edit — Describe changes to revise with AI</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="E.g., 'Make tone more authoritative'..."
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
            <button
              disabled={pending || !editPrompt.trim()}
              onClick={handleAiEdit}
              className="bg-brand-700 text-white px-3 py-1.5 rounded text-sm hover:bg-brand-900 disabled:opacity-50 whitespace-nowrap"
            >
              {pending ? "✨ Editing..." : "✨ Apply"}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={() => post("edit", { letter: text })}
            className="bg-green-700 text-white px-3 py-1.5 rounded hover:bg-green-800 disabled:opacity-50"
          >
            Save & approve
          </button>
          <button
            disabled={pending}
            onClick={() => { setText(initialLetter); setMode("review"); }}
            className="border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded p-4 space-y-2">
      <h2 className="font-semibold text-brand-900">Human review required</h2>
      <p className="text-sm text-gray-600">
        Approve to submit, edit to revise before submission, or reject if the draft is unusable.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={handleApprove}
          className="bg-green-700 text-white px-2 py-1 rounded text-sm hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Submitting..." : "Approve & submit"}
        </button>
        <button
          disabled={pending}
          onClick={() => setMode("editing")}
          className="bg-brand-700 text-white px-2 py-1 rounded text-sm hover:bg-brand-900 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          disabled={pending}
          onClick={() => post("reject")}
          className="border border-red-300 text-red-700 px-2 py-1 rounded text-sm hover:bg-red-50"
        >
          Reject
        </button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  );
}
