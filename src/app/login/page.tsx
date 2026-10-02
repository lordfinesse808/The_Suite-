import Link from "next/link";
import { Logo } from "@/components/icons";
import { LoginForm } from "../auth-forms";
import { env } from "@/lib/env";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const demo = env().MOCK_WHATSAPP;
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 md:px-20">
        <Logo />
        <h1 className="mt-10 text-4xl font-bold">Every enquiry answered, at 2 a.m. too.</h1>
        <p className="mt-3 max-w-md text-lg text-ink-2">Four AI agents qualify your WhatsApp leads, shortlist your listings and book viewings. You approve anything sent in your name.</p>
        <div className="card mt-8 max-w-md p-6">
          <LoginForm demo={demo} />
          {demo && <p className="mt-4 text-sm text-muted">Demo login is pre-filled: <span className="font-mono">adaeze@demo.ile / demo1234</span></p>}
          <p className="mt-4 text-sm">New agency? <Link href="/signup" className="font-semibold text-green underline">Create an account</Link></p>
        </div>
      </div>
      <div className="hidden items-center justify-center bg-ink p-12 md:flex">
        <div className="w-full max-w-sm space-y-3">
          {[
            ["lead", "Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?"],
            ["ai", "Good evening. Yes, it is. Is this to rent or to buy?"],
            ["lead", "Rent. Around 6m a year, Lekki Phase 1 or Ikate. Moving by December."],
            ["ai", "Here are 3 homes that fit. The Ikate 3-bed is ₦5,500,000 / yr, 8 minutes from Lekki Phase 1."],
          ].map(([who, t], i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] ${who === "lead" ? "ml-auto bg-green-soft" : "bg-white"}`}>{t}</div>
          ))}
          <p className="pt-4 text-center text-sm text-white/60">Qualifier · Matchmaker · Follow-up writer · Scheduler</p>
        </div>
      </div>
    </div>
  );
}
