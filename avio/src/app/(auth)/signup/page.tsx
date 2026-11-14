import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";
import { SignupForm } from "@/components/auth/signup-form";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Create your account" };

/**
 * The registration mode is deployment configuration, so it is read per
 * request rather than baked into the prerendered page.
 */
async function SignupGate() {
  await connection();
  const mode = env().REGISTRATION_MODE;

  if (mode === "closed") {
    return (
      <p className="rounded-xl border border-line bg-panel p-4 text-sm leading-relaxed text-muted">
        Registration is currently closed. If you already have an account, you
        can still sign in.
      </p>
    );
  }
  return (
    <>
      {mode === "invite" ? (
        <p className="mb-6 rounded-xl border border-line bg-panel px-4 py-3 text-[0.8125rem] leading-relaxed text-muted">
          AVIO is invite-only for now. You&apos;ll need an invite code to
          create an account.
        </p>
      ) : null}
      <SignupForm inviteRequired={mode === "invite"} />
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-1.5">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-10 w-full" />
        </div>
      ))}
      <div className="skeleton mt-1 h-11 w-full" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Create your account</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted">One workspace for every AI model you use.</p>
      <Suspense fallback={<FormSkeleton />}>
        <SignupGate />
      </Suspense>
      <p className="mt-6 text-center text-[0.8125rem] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
          Sign in
        </Link>
      </p>
    </>
  );
}
