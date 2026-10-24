import "server-only";
import { parseSeen, type Seen } from "./fridge";

// Gemini's free tier (key from aistudio.google.com) is plenty for a few scans a day.
const MODEL = process.env.FRIDGE_MODEL ?? "gemini-2.5-flash";

/**
 * Asks Gemini what's in a fridge photo. `known` are the names already in the
 * inventory, so the same product keeps the same name between scans.
 */
export async function seeFridge(image: Uint8Array, mediaType: string, known: string[], locale: "en" | "he"): Promise<Seen[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const language = locale === "he" ? "Hebrew" : "English";
  const prompt = [
    "This is a photo of a home fridge (or freezer / pantry shelf). List every food or drink product you can see.",
    `Name products in ${language}, short and generic ("Milk", "Eggs", "Cottage cheese"), not brands unless that is how people call it.`,
    known.length ? `Products we already track — reuse these exact names when it's the same product: ${known.join(", ")}.` : "",
    'For each product give "level": "full", "half" or "low" (how much is left), "qty" when you can count units, and one fitting "emoji".',
    'Answer with only a JSON array, e.g. [{"name":"Milk","level":"half","qty":1,"emoji":"🥛"}]. If it is not a fridge photo, answer [].',
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: Buffer.from(image).toString("base64") } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return parseSeen((data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("\n"));
}
