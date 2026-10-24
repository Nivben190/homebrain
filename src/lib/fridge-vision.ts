import "server-only";
import { parseSeen, type Seen } from "./fridge";

// Gemini's free tier (key from aistudio.google.com) is plenty for a few scans a day.
// When the main model is rate-limited (or unavailable), the lighter one takes over.
const MODELS = [process.env.FRIDGE_MODEL ?? "gemini-3.8-flash", process.env.FRIDGE_FALLBACK_MODEL ?? "gemini-3.5-flash-lite"];
const RETRY_ON = new Set([404, 429, 500, 503]);

/**
 * Asks Gemini what's in a fridge photo. `known` are the names already in the
 * inventory, so the same product keeps the same name between scans.
 */
export async function seeFridge(images: { data: Uint8Array; mediaType: string }[], known: string[], locale: "en" | "he"): Promise<Seen[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const language = locale === "he" ? "Hebrew" : "English";
  const prompt = [
    "These are photos of one home fridge (shelves, door, drawers — maybe freezer). List every food or drink product you can see, once, even if it shows in several photos.",
    `Name products in ${language}, short but specific: "Milk", "Eggs", "Hummus", "Chocolate spread", "Strawberry jam". Read the labels.`,
    `Never answer with a vague category like "spread", "sauce", "food", "container", "bottle" or "drink" on its own (in Hebrew: "ממרח", "רוטב", "אוכל", "קופסה", "בקבוק"). Say which one ("Tahini", "Soy sauce"). If you truly can't tell, describe it so a person can find it: "Jar with red spread", "Container of leftover rice".`,
    "Each product appears once in the list; several eggs are one item with a qty.",
    known.length ? `Products we already track — reuse these exact names when it's the same product: ${known.join(", ")}.` : "",
    'For each product give "level": "full", "half" or "low" (how much is left), "qty" when you can count units, and one fitting "emoji".',
    'Answer with only a JSON array, e.g. [{"name":"Milk","level":"half","qty":1,"emoji":"🥛"}]. If it is not a fridge photo, answer [].',
  ]
    .filter(Boolean)
    .join("\n");

  const body = JSON.stringify({
    contents: [{ parts: [...images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: Buffer.from(i.data).toString("base64") } })), { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });
  let error = "";
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body,
    });
    if (res.ok) {
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return parseSeen((data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("\n"));
    }
    error = `vision ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (!RETRY_ON.has(res.status)) break;
  }
  throw new Error(error);
}
