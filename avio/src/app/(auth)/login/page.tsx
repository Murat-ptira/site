import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Welcome back</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted">Sign in to your AVIO workspace.</p>
      <LoginForm />
      <p className="mt-6 text-center text-[0.8125rem] text-muted">
        New to AVIO?{" "}
        <Link href="/signup" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
          Create an account
        </Link>
      </p>
    </>
  );
}
