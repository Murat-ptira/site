"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PASSWORD_MIN_LENGTH } from "@/config/limits";
import { ApiError, api, hardNavigate } from "@/lib/api";

export function SignupForm({ inviteRequired }: { inviteRequired: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  // Invite links look like /signup?invite=AVIO-XXXX-XXXX-XXXX. The code is
  // only known in the browser, so it is filled in when the input mounts.
  function prefillInvite(input: HTMLInputElement | null) {
    if (!input || input.value) return;
    input.value = new URLSearchParams(window.location.search).get("invite") ?? "";
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          ...(inviteRequired ? { inviteCode: form.get("inviteCode") } : {}),
        },
      });
      hardNavigate("/chat");
    } catch (caught) {
      const failure = caught instanceof ApiError ? caught : null;
      setFields(failure?.fields ?? {});
      setError(failure?.message ?? "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" name="name" autoComplete="name" autoFocus required error={fields.name} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fields.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fields.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
      />
      {inviteRequired ? (
        <Field
          label="Invite code"
          name="inviteCode"
          ref={prefillInvite}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="AVIO-XXXX-XXXX-XXXX"
          className="font-mono tracking-wide"
          required
          error={fields.inviteCode}
        />
      ) : null}
      {error && Object.keys(fields).length === 0 ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
