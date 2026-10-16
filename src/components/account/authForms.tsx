"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import {
  deleteAccount,
  logIn,
  requestPasswordReset,
  signUp,
  updatePassword,
  type FormState,
} from "@/lib/actions/auth";
import { PASSWORD_MIN } from "@/lib/auth/validate";

/*
 * The account forms. Plain <form action> + useActionState, so they submit
 * without JavaScript and show server-side validation either way. The inputs
 * carry HTML constraints (required, type=email, minlength) only for instant
 * feedback; the server actions re-check everything.
 */

const initial: FormState = {};

function FormError({ children }: { children?: string }) {
  // role=alert is announced when it appears, so the message isn't missed by screen readers.
  return (
    <div role="alert" className={children ? "mb-4" : undefined}>
      {children && (
        <p className="rounded-lg border border-paprika/40 bg-paprika/5 px-3.5 py-2.5 text-[0.875rem] leading-snug text-paprika-deep">
          {children}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  name?: string;
  error?: string;
  hint?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, describedBy: error || hint ? noteId : undefined, invalid: !!error })}
      {(error || hint) && (
        <FieldHint id={noteId} error={!!error}>
          {error ?? hint}
        </FieldHint>
      )}
    </div>
  );
}

function PasswordInput({
  id,
  name,
  autoComplete,
  describedBy,
  invalid,
  minLength,
}: {
  id: string;
  name?: string;
  autoComplete: "current-password" | "new-password";
  describedBy?: string;
  invalid: boolean;
  minLength?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label="Show password"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-field text-ink-muted hover:text-herb"
      >
        {shown ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
      </button>
    </div>
  );
}

function EmailInput({
  id,
  defaultValue,
  describedBy,
  invalid,
}: {
  id: string;
  defaultValue?: string;
  describedBy?: string;
  invalid: boolean;
}) {
  return (
    <Input
      id={id}
      name="email"
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      required
      defaultValue={defaultValue}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    />
  );
}

function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: string; pendingLabel: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function DonePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-line bg-surface px-5 py-6 text-center">
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(logIn, initial);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate={false} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email" error={fe.email}>
        {(a) => <EmailInput id={a.id} defaultValue={state.email} describedBy={a.describedBy} invalid={a.invalid} />}
      </Field>
      <Field label="Password" name="password" error={fe.password}>
        {(a) => (
          <PasswordInput
            id={a.id}
            name="password"
            autoComplete="current-password"
            describedBy={a.describedBy}
            invalid={a.invalid}
          />
        )}
      </Field>
      <Link
        replace
        href="/forgot-password"
        className="-mt-1 inline-flex min-h-11 items-center self-start text-[0.8125rem] text-ink-muted underline underline-offset-4 hover:text-herb"
      >
        Forgot password?
      </Link>
      <SubmitButton pending={pending} pendingLabel="Logging in…">
        Log in
      </SubmitButton>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  const fe = state.fieldErrors ?? {};

  if (state.done) {
    return (
      <DonePanel title="Almost there">
        <p>{state.done}</p>
        <p className="mt-2">It can take a minute. Check spam if it doesn&apos;t show up.</p>
      </DonePanel>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email" error={fe.email}>
        {(a) => <EmailInput id={a.id} defaultValue={state.email} describedBy={a.describedBy} invalid={a.invalid} />}
      </Field>
      <Field
        label="Password"
        name="password"
        error={fe.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
      >
        {(a) => (
          <PasswordInput
            id={a.id}
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            describedBy={a.describedBy}
            invalid={a.invalid}
          />
        )}
      </Field>
      <div>
        <label className="flex min-h-11 items-start gap-3 text-[0.875rem] leading-snug text-ink-muted">
          <input
            type="checkbox"
            name="agree"
            required
            aria-invalid={!!fe.agree}
            aria-describedby={fe.agree ? "agree-err" : undefined}
            className="mt-0.5 size-5 shrink-0 accent-herb"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-herb">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-herb">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {fe.agree && (
          <p id="agree-err" className="mt-1 text-[0.8125rem] text-paprika-deep">
            {fe.agree}
          </p>
        )}
      </div>
      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  const fe = state.fieldErrors ?? {};

  if (state.done) {
    return (
      <DonePanel title="Check your email">
        <p>{state.done}</p>
        <p className="mt-2">The link works once and expires in an hour.</p>
      </DonePanel>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>
      <Field label="Email" name="email" error={fe.email}>
        {(a) => <EmailInput id={a.id} defaultValue={state.email} describedBy={a.describedBy} invalid={a.invalid} />}
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError>{state.error}</FormError>
      {state.error && (
        <Link
          href="/forgot-password"
          className="-mt-2 inline-flex min-h-11 items-center self-start text-[0.8125rem] underline underline-offset-4 hover:text-herb"
        >
          Request a new link
        </Link>
      )}
      <Field label="New password" name="password" error={fe.password} hint={`At least ${PASSWORD_MIN} characters.`}>
        {(a) => (
          <PasswordInput
            id={a.id}
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            describedBy={a.describedBy}
            invalid={a.invalid}
          />
        )}
      </Field>
      <Field label="Confirm new password" name="confirm" error={fe.confirm}>
        {(a) => (
          <PasswordInput
            id={a.id}
            name="confirm"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            describedBy={a.describedBy}
            invalid={a.invalid}
          />
        )}
      </Field>
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}

/** Two steps so a stray tap can't delete anything: reveal, then type DELETE. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const fe = state.fieldErrors ?? {};
  const ready = typed.trim() === "DELETE";

  if (!open) {
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
    );
  }
  return (
    <form action={action} className="max-w-md rounded-xl border border-paprika/40 bg-paprika/5 p-4">
      <h3 className="text-lg">Are you sure?</h3>
      <div className="mt-3">
        <FormError>{state.error}</FormError>
        <Field label="Type DELETE to confirm" name="confirm" error={fe.confirm}>
          {(a) => (
            <Input
              id={a.id}
              name="confirm"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={a.invalid || undefined}
              aria-describedby={a.describedBy}
            />
          )}
        </Field>
        {!ready && typed.length > 0 && (
          <p className="mt-1.5 text-[0.8125rem] text-ink-muted">Type DELETE in capital letters to enable the button.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" variant="danger" disabled={pending || !ready} aria-disabled={pending || !ready}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => {
            setOpen(false);
            setTyped("");
          }}>
          Keep my account
        </Button>
      </div>
    </form>
  );
}
