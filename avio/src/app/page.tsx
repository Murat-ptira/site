import {
  ArrowRight,
  Check,
  Columns2,
  Gauge,
  History,
  Layers,
  MessagesSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { WorkspacePreview } from "@/components/marketing/workspace-preview";
import { buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ProviderDot } from "@/components/ui/provider-dot";
import { MODELS, PROVIDERS, PROVIDER_IDS, type ModelTier } from "@/config/catalog";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#models", label: "Models" },
  { href: "#pricing", label: "Pricing" },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessagesSquare,
    title: "One conversation, any model",
    body: "Choose a model for each message. The thread stays intact when you switch, so you never start over.",
  },
  {
    icon: Columns2,
    title: "Compare side by side",
    body: "Send one prompt to two models and read both answers next to each other as they stream in.",
  },
  {
    icon: History,
    title: "History in one place",
    body: "Every conversation is saved to your account. Rename, revisit or delete them whenever you like.",
  },
  {
    icon: Gauge,
    title: "Usage you can see",
    body: "Each reply shows what it cost. A running balance and a full transaction history keep credits predictable.",
  },
  {
    icon: ShieldCheck,
    title: "Keys stay on the server",
    body: "Requests to model providers are made by AVIO's backend. API keys never reach your browser.",
  },
  {
    icon: Layers,
    title: "Built to extend",
    body: "Providers plug in through small adapters, so new models arrive without changing how you work.",
  },
];

const TIER_LABEL: Record<ModelTier, string> = {
  flagship: "Flagship",
  balanced: "Balanced",
  fast: "Fast",
};

const PLANS = [
  {
    name: "Preview",
    price: "Free",
    note: "during the invite-only preview",
    features: [
      "Starter credits on sign-up",
      "Every connected model",
      "Compare mode",
      "Full conversation history",
    ],
    cta: true,
  },
  {
    name: "Pro",
    price: "Coming soon",
    note: "for individuals who rely on AVIO daily",
    features: [
      "Monthly credit allowance",
      "Top-ups when you need them",
      "Higher rate limits",
      "Usage export",
    ],
    cta: false,
  },
  {
    name: "Team",
    price: "Coming soon",
    note: "for groups that share a budget",
    features: [
      "Shared workspaces",
      "Central billing",
      "Roles and usage controls",
      "Single sign-on",
    ],
    cta: false,
  },
];

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs tracking-[0.18em] text-subtle uppercase">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-[2.5rem] sm:leading-[1.1]">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-base leading-relaxed text-muted">{children}</p>
      ) : null}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="AVIO home" className="rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-[0.8125rem] text-muted transition-colors hover:text-fg"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <Link href="/login" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/signup" className={buttonClass({ size: "sm" })}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28">
          <div className="animate-rise max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-ok" />
              Invite-only preview
            </p>
            <h1 className="mt-7 text-[clamp(2.75rem,8vw,5.25rem)] leading-[0.98] font-medium tracking-[-0.045em]">
              One platform.
              <br />
              Every AI.
              <br />
              <span className="text-subtle">Your choice.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              AVIO puts the leading AI models in one calm workspace. Ask any of
              them, switch mid-conversation, and compare answers side by side.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={buttonClass({ size: "lg" })}>
                Get Started
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/login" className={buttonClass({ variant: "secondary", size: "lg" })}>
                Sign in
              </Link>
            </div>
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-subtle">
              {PROVIDER_IDS.map((id) => (
                <li key={id} className="inline-flex items-center gap-2">
                  <ProviderDot provider={id} />
                  {PROVIDERS[id].name}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-rise mt-16 [animation-delay:120ms] sm:mt-20">
            <WorkspacePreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <SectionHeading eyebrow="Features" title="Everything you ask, in one workspace.">
              No more juggling tabs, logins and subscriptions to find out which
              model answers best.
            </SectionHeading>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <article key={title} className="bg-bg p-7">
                  <Icon className="size-5 text-muted" strokeWidth={1.6} aria-hidden="true" />
                  <h3 className="mt-5 text-[0.9375rem] font-medium tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Models */}
        <section id="models" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <SectionHeading eyebrow="Models" title="The models you already trust.">
              AVIO speaks to each provider through its own adapter. These are
              the models it supports today.
            </SectionHeading>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {PROVIDER_IDS.map((id) => (
                <div key={id} className="rounded-2xl border border-line p-6">
                  <h3 className="flex items-center gap-2.5 text-[0.9375rem] font-medium">
                    <ProviderDot provider={id} className="size-2.5" />
                    {PROVIDERS[id].name}
                  </h3>
                  <ul className="mt-5 flex flex-col">
                    {MODELS.filter((model) => model.provider === id).map((model) => (
                      <li
                        key={model.id}
                        className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
                      >
                        <span>
                          <span className="block text-sm text-fg">{model.label}</span>
                          <span className="mt-0.5 block text-[0.8125rem] text-subtle">
                            {model.description}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[0.6875rem] tracking-wide text-subtle uppercase">
                          {TIER_LABEL[model.tier]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[0.8125rem] text-subtle">
              A model appears in your workspace once its provider is connected
              to your AVIO deployment.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <SectionHeading eyebrow="Pricing" title="Pay for what you use, in credits.">
              One balance covers every model. These plans are placeholders for
              the preview; payments are not enabled yet.
            </SectionHeading>
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    "flex flex-col rounded-2xl border p-6",
                    plan.cta ? "border-line-strong bg-panel" : "border-line",
                  )}
                >
                  <h3 className="text-sm font-medium text-muted">{plan.name}</h3>
                  <p className="mt-4 text-3xl font-medium tracking-[-0.03em]">{plan.price}</p>
                  <p className="mt-1.5 text-[0.8125rem] text-subtle">{plan.note}</p>
                  <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-muted">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {plan.cta ? (
                    <Link href="/signup" className={buttonClass({ className: "mt-8 w-full" })}>
                      Get Started
                    </Link>
                  ) : (
                    <span
                      className={buttonClass({
                        variant: "secondary",
                        className: "mt-8 w-full cursor-default opacity-50 hover:bg-raised",
                      })}
                    >
                      Coming soon
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-5 py-24 sm:px-8 sm:py-28 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-xl text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl sm:leading-[1.05]">
              Stop switching tabs.
              <span className="text-subtle"> Ask once, choose the best answer.</span>
            </h2>
            <Link href="/signup" className={buttonClass({ size: "lg" })}>
              Get Started
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <Logo />
            <p className="mt-2 text-[0.8125rem] text-subtle">
              One platform. Every AI. Your choice.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-muted">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="transition-colors hover:text-fg">
                {item.label}
              </a>
            ))}
            <Link href="/login" className="transition-colors hover:text-fg">
              Sign in
            </Link>
          </nav>
          <p className="text-[0.8125rem] text-subtle">© 2026 AVIO AI</p>
        </div>
      </footer>
    </div>
  );
}
