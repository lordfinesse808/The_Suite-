// Placeholder listing photo (SVG) used until real photos are uploaded.
const TONES = ["#cfdcd3", "#e6dfcf", "#d9dee3", "#dfe1dc", "#e5ded3", "#d4dad6"];

export async function GET(_: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const tone = TONES[Number(ref.replace(/\D/g, "")) % TONES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="${tone}"/><g fill="none" stroke="#1f5b45" stroke-opacity=".35" stroke-width="10"><path d="M250 300l150-120 150 120"/><path d="M285 280v120h230V280"/></g><text x="40" y="460" font-family="monospace" font-size="26" fill="#3a403b" fill-opacity=".7" letter-spacing="4">PHOTO · ${ref.replace(/[^\w-]/g, "")}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
