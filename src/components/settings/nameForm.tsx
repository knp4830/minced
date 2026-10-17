"use client";

import { useId, useState } from "react";

import { ACCOUNT_CHANGED_EVENT } from "@/components/account/accountProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfileName } from "@/lib/actions/settings";
import { StatusLine, useSaveStatus } from "./saveStatus";

/**
 * Display name. Unlike the radios and chips this one has an explicit Save button: saving on every keystroke
 * would be hostile. Enter submits. Emptying it falls back to the part of the email before the @.
 */
export function NameForm({ initial, fallback }: { initial: string; fallback: string }) {
  const id = useId();
  const [name, setName] = useState(initial);
  const { status, run } = useSaveStatus();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => saveProfileName(name));
    setBusy(false);
    if (r.ok) {
      setName(r.name ?? "");
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT)); // the header shows the new name now
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Label htmlFor={id}>Display name</Label>
      <p id={`${id}-hint`} className="mb-2 text-[0.875rem] leading-snug text-ink-muted">
        What Minced calls you. Only you see it.
      </p>
      <div className="flex max-w-md flex-wrap gap-3">
        <Input
          id={id}
          name="display_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={fallback}
          maxLength={60}
          autoComplete="nickname"
          aria-describedby={`${id}-hint`}
          className="min-w-0 flex-1 basis-56"
        />
        <Button type="submit" variant="secondary" disabled={busy} aria-disabled={busy}>
          Save name
        </Button>
      </div>
      <StatusLine status={status} />
    </form>
  );
}
