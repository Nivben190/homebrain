// Reminder wording that fits the space: a dog space talks about the dog, a
// workout space cheers you on, a "kind words" space is warm. The theme comes
// from the space's template, icon and title (and the item's title), in Hebrew
// or English; the lines themselves live in the dictionaries (t.voice).

export const THEMES = ["dog", "workout", "love", "health", "home", "plants", "morning", "learn", "mind", "money"] as const;
export type Theme = (typeof THEMES)[number] | "general";

/** Checked in order: the first theme with a hit wins, so "dog training" is about the dog, not a workout. */
const RULES: { theme: Theme; templates: string[]; icons: string[]; words: RegExp }[] = [
  {
    theme: "dog",
    templates: ["dog-care", "dog-vet", "dog-training", "dog-health", "dog-supplies"],
    icons: ["🐶", "🐕", "🦮", "🐩", "🦴", "🐾"],
    words: /\b(dog|dogs|puppy|pup|doggy|kennel)\b|כלב|כלבה|גור |גורה|אילוף|טיול עם/i,
  },
  {
    theme: "workout",
    templates: ["fitness"],
    icons: ["🏋️", "🏋", "💪", "🏃", "🏃‍♀️", "🏃‍♂️", "🚴", "🏊", "🤸", "⚽", "🥊", "🤾", "⛹️"],
    words: /\b(gym|workout|work out|fitness|exercise|a run|running|pilates|crossfit|swim|cardio|push-?ups|squats|training)\b|כושר|אימון|אימונ|ריצה|חדר כושר|פילאטיס|שחייה|כפיפות|סקוואט/i,
  },
  {
    theme: "love",
    templates: ["us", "date-ideas", "gifts"],
    icons: ["❤️", "❤", "💑", "💕", "💖", "💌", "💞", "🌹", "😘", "🥰", "💏", "💗"],
    words: /\b(love|partner|date night|wife|husband|girlfriend|boyfriend|relationship|romance|compliment|kind words)\b|זוגיות|אהבה|דייט|אשתי|בעלי|מחמאה|מילים טובות|רומנטי/i,
  },
  {
    theme: "health",
    templates: ["meds", "checkups", "appointments"],
    icons: ["💊", "🩺", "🦷", "🩹", "💉", "🏥"],
    words: /\b(meds|medicine|pill|pills|vitamin|vitamins|doctor|dentist|checkup|drops)\b|תרופ|כדור|ויטמין|רופא|שיניים|טיפות|בדיקה/i,
  },
  {
    theme: "plants",
    templates: ["plants"],
    icons: ["🪴", "🌱", "🌿", "🌻", "🌷", "🌵", "🌳"],
    words: /\b(plant|plants|garden|water the)\b|צמח|צמחי|השקיה|השקיית|להשקות|גינה|עציץ/i,
  },
  {
    theme: "home",
    templates: ["cleaning", "maintenance", "projects"],
    icons: ["🧹", "🧺", "🧽", "🗑️", "🛠️", "🔧", "🏠", "🧼", "🪣"],
    words: /\b(clean|cleaning|laundry|trash|dishes|vacuum|tidy|chores)\b|ניקיון|לנקות|כביסה|זבל|כלים|שאיבה|ספונג|סידור/i,
  },
  {
    theme: "morning",
    templates: [],
    icons: ["☀️", "🌅", "🌄", "⏰", "☕"],
    words: /\b(morning|wake up|sunrise)\b|בוקר|השכמה/i,
  },
  {
    theme: "mind",
    templates: [],
    icons: ["🧘", "🧘‍♀️", "🧘‍♂️", "🙏", "📿", "🕯️", "📝"],
    words: /\b(meditat\w*|mindful\w*|gratitude|journal\w*|breath\w*)\b|מדיטציה|הכרת תודה|יומן|נשימות|מיינדפולנס/i,
  },
  {
    theme: "learn",
    templates: [],
    icons: ["📚", "📖", "🎓", "✍️", "🧠", "🎹", "🎸"],
    words: /\b(read|reading|study|learn|course|homework|practice|piano|guitar|language)\b|קריאה|לקרוא|ללמוד|לימוד|קורס|שיעורי|אנגלית|נגינה/i,
  },
  {
    theme: "money",
    templates: ["bills", "receipts", "savings", "renewals", "subscriptions", "spending"],
    icons: ["💰", "💳", "🧾", "💵", "🏦", "🪙"],
    words: /\b(budget|savings|save money|bill|bills|invoice|tax)\b|תקציב|חיסכון|חשבון|חשבונית|מס /i,
  },
];

export interface ThemeSource {
  title: string;
  icon?: string | null;
  template?: string | null;
}

/** Which voice a reminder about `item` in `space` should use. */
export function themeOf(space: ThemeSource, itemTitle = ""): Theme {
  for (const r of RULES) if (space.template && r.templates.includes(space.template)) return r.theme;
  const icon = (space.icon ?? "").replace(/️/g, "");
  for (const r of RULES) if (icon && r.icons.some((i) => i.replace(/️/g, "") === icon)) return r.theme;
  for (const r of RULES) if (r.words.test(space.title)) return r.theme;
  for (const r of RULES) if (itemTitle && r.words.test(itemTitle)) return r.theme;
  return "general";
}

/** Lines a reminder can say, per moment. Every theme has at least one of each. */
export interface VoiceLines {
  /** Time for it, no streak yet. */
  start: string[];
  /** Time for it, {streak} days running. */
  streak: string[];
  /** Evening: still not done today. */
  nudge: string[];
  /** Short tag added to a due-date or renewal alert. */
  due: string[];
}

/** Same line all day for the same item, a different one tomorrow. */
export function pickLine(lines: string[], seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return lines[Math.abs(h) % lines.length];
}
