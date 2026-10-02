// Message templates to submit to Meta (WhatsApp Manager → Message templates).
// Used outside the 24-hour customer-service window. Category: UTILITY.
import type { TemplateName } from "./types";

export const TEMPLATES: Record<TemplateName, { category: "UTILITY"; body: string; example: string[]; description: string }> = {
  follow_up_checkin: {
    category: "UTILITY",
    description: "Check-in after a lead has gone quiet, or first contact after a website form.",
    body: "Hello {{1}}, this is {{2}}. Following up on your property search: {{3}} Reply here to continue, or reply STOP to opt out.",
    example: ["Femi", "Adaeze Homes", "the Sangotedo terrace you asked about is still available."],
  },
  viewing_reminder: {
    category: "UTILITY",
    description: "Reminder 24 hours and 2 hours before a booked viewing.",
    body: "Hello {{1}}, a reminder of your viewing of {{2}} on {{3}} with {{4}}. Reply 1 to confirm or 2 to reschedule. Reply STOP to opt out.",
    example: ["Chiamaka", "3-bed flat, Ikate", "Sat 10 Oct, 11:30", "Tunde"],
  },
};

export function renderTemplate(name: TemplateName, vars: string[]): string {
  return TEMPLATES[name].body.replace(/\{\{(\d+)\}\}/g, (_, i) => vars[Number(i) - 1] ?? "");
}
