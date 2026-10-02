import { CSV_TEMPLATE } from "@/lib/listings";

export async function GET() {
  return new Response(CSV_TEMPLATE, { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="ile-listings-template.csv"' } });
}
