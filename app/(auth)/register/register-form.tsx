"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormEvent } from "react";

import { registerAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema } from "@/lib/shared/schemas/auth";

interface FieldErrors {
  email?: string;
  password?: string;
}

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, { error: null });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      event.preventDefault();
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flattened.email?.[0], password: flattened.password?.[0] });
      return;
    }

    setFieldErrors({});
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {fieldErrors.email && <p className="text-destructive text-sm">{fieldErrors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        {fieldErrors.password && <p className="text-destructive text-sm">{fieldErrors.password}</p>}
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
