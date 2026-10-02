"use client";
import { useActionState, useState } from "react";
import { createListing, importCsvAction, parseListingAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/client";
import { IconLink } from "@/components/icons";
import type { ParsedListing } from "@/lib/listings";

const LABEL: Record<string, string> = { purpose: "Purpose", property_type: "Type", price_amount: "Price", area: "Area", service_charge: "Service charge" };

function Field({ name, label, value, need, type = "text", children }: { name: string; label: string; value?: string | number; need?: boolean; type?: string; children?: React.ReactNode }) {
  return (
    <label className={`block rounded-xl border px-4 py-3 ${need ? "border-amber/50 bg-amber-soft/40" : "border-line bg-white"}`}>
      <span className={`block text-sm ${need ? "text-amber" : "text-ink-2"}`}>{label}{need ? " · not in post" : ""}</span>
      {children ?? <input name={name} type={type} defaultValue={value ?? ""} className="w-full bg-transparent pt-1 text-[16px] outline-none" />}
    </label>
  );
}

export function ListingFields({ p }: { p?: Partial<ParsedListing> }) {
  const need = (k: string) => !!p?.missing?.includes(k);
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Field name="title" label="Title" value={p?.title} />
      <Field name="purpose" label="Purpose" need={need("purpose")}>
        <select name="purpose" defaultValue={p?.purpose || "rent"} className="w-full bg-transparent pt-1 text-[16px] outline-none">
          <option value="rent">Rent</option><option value="sale">Sale</option><option value="shortlet">Short-let</option>
        </select>
      </Field>
      <Field name="property_type" label="Type" value={p?.property_type || ""} need={need("property_type")} />
      <Field name="bedrooms" label="Bedrooms" type="number" value={p?.bedrooms ?? ""} />
      <Field name="area" label="Area" value={p?.area} need={need("area")} />
      <Field name="price_amount" label="Price (₦)" type="number" value={p?.price_amount ?? ""} need={need("price_amount")} />
      <Field name="price_period" label="Per">
        <select name="price_period" defaultValue={p?.price_period || "year"} className="w-full bg-transparent pt-1 text-[16px] outline-none">
          <option value="year">year</option><option value="month">month</option><option value="night">night</option><option value="total">total (sale)</option>
        </select>
      </Field>
      <Field name="service_charge" label="Service charge (₦ / yr)" type="number" value={p?.service_charge ?? ""} need={need("service_charge")} />
      <Field name="city" label="City">
        <select name="city" defaultValue={p?.city || "Lagos"} className="w-full bg-transparent pt-1 text-[16px] outline-none"><option>Lagos</option><option>Abuja</option></select>
      </Field>
      <Field name="features" label="Features (comma separated)" value={p?.features} />
      <div className="md:col-span-2"><Field name="address" label="Address (shared after booking)" /></div>
      <div className="md:col-span-3"><Field name="description" label="Description" value={p?.description} /></div>
      <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm"><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple className="text-sm" /></label>
      <label className="flex items-center gap-2 rounded-xl border border-amber/50 bg-amber-soft/40 px-4 py-3 text-sm text-amber"><input type="checkbox" name="verified" /> Title documents checked (only you see these)</label>
    </div>
  );
}

export function PasteReader() {
  const [parsed, parse] = useActionState(parseListingAction, null as ParsedListing | null);
  const [created, create] = useActionState(createListing, null);
  const [key, setKey] = useState(0);
  return (
    <div className="card mb-8 overflow-hidden">
      <form action={parse} className="flex gap-3 border-b border-line p-4">
        <div className="relative flex-1">
          <IconLink className="absolute left-4 top-4 text-ink-2" />
          <textarea name="text" rows={1} placeholder="Paste an Instagram caption, a broadcast message or a post link…" className="input !rounded-xl !bg-soft !py-3.5 !pl-11 min-h-[52px]" defaultValue="FOR RENT: Newly built 3 bedroom flat in Ikate, Lekki. BQ, fitted kitchen, 24hrs power. 5.5m per annum. instagram.com/p/adaezehomes-ikate-3bed" />
        </div>
        <Submit className="btn btn-green !px-6" pendingText="Reading…">Read it</Submit>
      </form>
      {parsed && (
        <form key={key} action={async (fd) => { await create(fd); setKey((k) => k + 1); }} className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Read from the post. Check before it goes to the Matchmaker.</h3>
            <span className="label-mono">{parsed.missing.length} field{parsed.missing.length === 1 ? "" : "s"} need you</span>
          </div>
          <ListingFields p={parsed} />
          <div className="mt-4 flex justify-end gap-2">
            <Submit className="btn btn-dark">Publish</Submit>
          </div>
        </form>
      )}
      {created && <div className="px-5 pb-4"><FormMessage state={created} /></div>}
      {parsed && parsed.missing.length > 0 && <p className="px-5 pb-4 text-sm text-ink-2">Missing: {parsed.missing.map((m) => LABEL[m] ?? m).join(", ")}. The AI never quotes a value that is not filled in here.</p>}
    </div>
  );
}

export function AddByForm() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createListing, null);
  return (
    <>
      <button className="btn btn-dark !py-3" onClick={() => setOpen(!open)}>{open ? "Close form" : "Add by form"}</button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16" onClick={() => setOpen(false)}>
          <form action={action} className="card w-full max-w-5xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-xl font-semibold">New listing</h3>
            <ListingFields />
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn btn-line" onClick={() => setOpen(false)}>Cancel</button><Submit className="btn btn-dark">Publish</Submit></div>
            <FormMessage state={state} />
          </form>
        </div>
      )}
    </>
  );
}

export function CsvUpload() {
  const [state, action] = useActionState(importCsvAction, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="btn btn-line !py-3 cursor-pointer">
        Upload CSV
        <input type="file" name="csv" accept=".csv,text/csv" className="hidden" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </label>
      {state && <span className="max-w-xs text-sm"><FormMessage state={state} /></span>}
    </form>
  );
}
