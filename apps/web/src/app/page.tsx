import Link from "next/link";
import {
  SparklesIcon,
  DocumentMagnifyingGlassIcon,
  CheckBadgeIcon,
  PaperAirplaneIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

const steps = [
  {
    title: "Ingest denials",
    body: "Drop an ERA file or sync your clearinghouse. We parse every denial code.",
    icon: DocumentMagnifyingGlassIcon,
  },
  {
    title: "Draft with citations",
    body: "Agents write a payer-specific appeal letter grounded in their published medical policies.",
    icon: SparklesIcon,
  },
  {
    title: "Human review",
    body: "A reviewer signs off in seconds before anything leaves the building.",
    icon: CheckBadgeIcon,
  },
  {
    title: "Submit & track",
    body: "We submit through the payer portal and follow up until the claim is paid.",
    icon: PaperAirplaneIcon,
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-ai-500" />
          Phase 1 MVP · synthetic data
        </div>
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900">
          Fire your billing company.
        </h1>
        <p className="max-w-2xl text-lg text-gray-600">
          Our agents draft payer-specific appeal letters with verified citations,
          run them past a human reviewer, and submit them via the payer's portal.
          You pay nothing unless we recover money.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/dashboard" className="btn-primary">
            Open dashboard <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link href="/denials" className="btn-secondary">
            See pending denials
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-900">How it works</h2>
        <p className="mt-1 text-sm text-gray-500">
          Four steps. The agents do the boring parts; you sign off on the rest.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {steps.map((s, i) => (
            <div key={s.title} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono text-gray-400">0{i + 1}</span>
                    <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
