import Link from "next/link";
import { Logo } from "@/components/icons";
import { SignupForm } from "../auth-forms";

export const metadata = { title: "Create your agency" };

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">Create your agency</h1>
      <p className="mt-2 text-ink-2">One organisation per signup. You can add agents later.</p>
      <div className="card mt-6 p-6"><SignupForm /></div>
      <p className="mt-4 text-sm">Already have an account? <Link href="/login" className="font-semibold text-green underline">Sign in</Link></p>
    </div>
  );
}
