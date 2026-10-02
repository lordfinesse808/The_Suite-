# Website integration (zero cost)

Two ways for an agency website to send leads into ilé. Both start the conversation on WhatsApp, where the Qualifier takes over.

## 1. "Chat on WhatsApp" links (no code)

Settings → Website lists a link per listing:

```
https://wa.me/2348035550142?text=Hi%2C%20I'm%20interested%20in%20LST-1042
```

The Qualifier detects `LST-1042`, attaches the listing to the lead, confirms whether it is still available and pre-fills purpose, area and bedrooms. Copy the HTML button from the same screen and paste it next to each listing on your site, Instagram bio link or flyers (as a QR code).

## 2. Lead form endpoint

`POST /api/public/leads` — JSON or form-encoded.

| Field | Required | Notes |
| --- | --- | --- |
| `key` (or header `x-ile-key`) | yes | The agency's public key from Settings → Website |
| `phone` | yes | Any Nigerian format; stored as E.164 |
| `name`, `email`, `message` | no | |
| `listing_ref` | no | e.g. `LST-1042` |
| `consent` | yes for WhatsApp | `true` / `on`. Without consent the lead is saved but not messaged |
| `source[page]`, `source[utm_source]` … | no | stored on the lead |

Security: the key must match an organisation, the request `Origin` must be in Settings → Website origins (if any are set), and each IP is limited to 10 requests a minute.

If `consent` is given, ilé sends the approved `follow_up_checkin` template on WhatsApp so the lead can continue in chat.

### Plain HTML

```html
<form action="https://YOUR-APP.vercel.app/api/public/leads" method="post">
  <input type="hidden" name="key" value="pk_your_public_key">
  <input type="hidden" name="listing_ref" value="LST-1042">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="WhatsApp number" required>
  <textarea name="message" placeholder="What are you looking for?"></textarea>
  <label><input type="checkbox" name="consent" value="true" required>
    I agree that the agency may save my details and contact me on WhatsApp. I can reply STOP at any time.</label>
  <button type="submit">Chat on WhatsApp</button>
</form>
```

### JavaScript (stay on the page)

```js
await fetch("https://YOUR-APP.vercel.app/api/public/leads", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ile-key": "pk_your_public_key" },
  body: JSON.stringify({ name, phone, message, listing_ref: "LST-1042", consent: true, source: { page: location.pathname } }),
});
```

### WordPress

- **Contact Form 7**: install "CF7 to Webhook" (or similar), set the webhook URL to `/api/public/leads?key=pk_your_public_key`, map fields `name`, `phone`, `message`, `consent`. Add the site origin (e.g. `https://youragency.com`) in Settings → Website.
- **WPForms / Gravity Forms**: use their Webhooks add-on with the same URL and field names, request format JSON.
- **Elementor forms**: Actions after submit → Webhook → same URL.

Responses: `201 {ok, lead_id, created: true, whatsapp: "sent" | "skipped" | "blocked"}`; `401` unknown key; `403` origin not allowed; `429` rate limited.
