import { Logo } from "@/components/icons";
import { env } from "@/lib/env";

export const metadata = { title: "Privacy notice" };

export default function Privacy() {
  const app = env().APP_NAME;
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 leading-relaxed">
      <Logo />
      <div className="my-6 rounded-xl border border-amber/50 bg-amber-soft/50 p-4 text-sm text-amber">Template only. A Nigerian data-protection lawyer must review this before launch.</div>
      <h1 className="mb-4 text-3xl font-bold">Privacy notice</h1>
      <p className="mb-4">{app} helps estate agencies answer property enquiries on WhatsApp. When you message an agency that uses {app}, the agency is the data controller and {app} processes your data on its behalf, in line with the Nigeria Data Protection Act 2023.</p>
      <h2 className="mb-2 mt-6 text-xl font-semibold">What we collect</h2>
      <p className="mb-4">Your WhatsApp number and profile name, the messages you send, and what you tell us about the home you want (budget, areas, timing). We do not collect payment details.</p>
      <h2 className="mb-2 mt-6 text-xl font-semibold">Why</h2>
      <p className="mb-4">To answer your enquiry, suggest suitable homes, book viewings and send reminders. The lawful basis is your consent, given when you continue the chat after the first message tells you your details will be saved.</p>
      <h2 className="mb-2 mt-6 text-xl font-semibold">Your rights</h2>
      <p className="mb-4">Reply STOP at any time and no further messages will be sent. You can ask the agency for a copy of your data or for it to be deleted; agencies can do both from the dashboard. Inactive leads are deleted after 24 months.</p>
      <h2 className="mb-2 mt-6 text-xl font-semibold">AI</h2>
      <p className="mb-4">Replies are drafted by an AI assistant and checked against the agency&apos;s listing data. A person can take over at any time. Follow-up messages are approved by the agency before they are sent.</p>
    </div>
  );
}
