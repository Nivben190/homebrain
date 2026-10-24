import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n";
import type { AutomationDef } from "@/lib/engine/types";
import type { PropertyDef } from "@/lib/registry/properties";
import { nextRunAt } from "@/lib/engine/schedule";
import { nextReminder, todayKey } from "@/lib/engine/habits";
import { instantiateTemplate, SECTION_TEMPLATES } from "@/lib/registry/templates";

/** Shared spaces the home creator starts with (keys in the template library). */
const STARTER_SHARED = ["groceries", "dog-care", "projects"];

const phrases: Record<Locale, string[]> = {
  en: [
    "Good morning, beautiful ☀️ I'm so lucky to wake up next to you.",
    "You're going to crush it today. I believe in you and your business 💪",
    "Just thinking about you makes my morning better ❤️",
    "Have the best day, my love. Can't wait to see you tonight 😘",
    "Reminder: you're amazing, smart and the love of my life 💌",
    "Proud of you every single day. Go get them! 🚀",
    "Coffee's better when I think of you ☕️❤️",
    "Whatever today brings, we've got this together 🤝",
    "You + me + the dog = my favorite team 🐶❤️",
    "Sending you a big hug for the day ahead 🤗",
    "You make our home feel like home 🏠💕",
    "Good morning to the most beautiful entrepreneur I know ✨",
  ],
  he: [
    "בוקר טוב יפה שלי ☀️ איזה מזל יש לי להתעורר לידך.",
    "את הולכת לכבוש היום. מאמין בך ובעסק שלך 💪",
    "רק לחשוב עלייך עושה לי את הבוקר ❤️",
    "שיהיה לך יום מושלם אהובה. מחכה לראות אותך בערב 😘",
    "תזכורת: את מדהימה, חכמה ואהבת חיי 💌",
    "גאה בך כל יום מחדש. קדימה! 🚀",
    "הקפה טעים יותר כשאני חושב עלייך ☕️❤️",
    "מה שלא יביא היום, ביחד אנחנו נצליח 🤝",
    "את + אני + הכלב = הצוות האהוב עליי 🐶❤️",
    "שולח לך חיבוק ענק ליום הזה 🤗",
    "את הופכת את הבית שלנו לבית 🏠💕",
    "בוקר טוב ליזמית הכי יפה שאני מכיר ✨",
  ],
};

/** Used for the partner who joins an existing home. Hebrew is gendered, so this set addresses him. */
const phrasesToHim: Record<Locale, string[]> = {
  en: [
    "Good morning, handsome ☀️ Have an amazing day.",
    "You're the best partner I could ask for ❤️",
    "Proud of you and everything you build 💻🚀",
    "Can't wait to see you tonight 😘",
    "Thanks for always making me smile 💌",
    "You + me + the dog = my favorite team 🐶❤️",
    "Go crush it today, my love 💪",
    "Sending you a big hug for the day ahead 🤗",
  ],
  he: [
    "בוקר טוב חתיך שלי ☀️ שיהיה לך יום מדהים.",
    "אתה בן הזוג הכי טוב שיכולתי לבקש ❤️",
    "גאה בך ובכל מה שאתה בונה 💻🚀",
    "מחכה לראות אותך בערב 😘",
    "תודה שאתה תמיד גורם לי לחייך 💌",
    "אתה + אני + הכלב = הצוות האהוב עליי 🐶❤️",
    "לך תכבוש היום, אהוב שלי 💪",
    "שולחת לך חיבוק ענק ליום הזה 🤗",
  ],
};

const copy = {
  en: {
    goodWords: "Good words",
    routine: "Morning routine",
    routineItems: ["Stretch 5 minutes 🧘", "Glass of water 💧", "Send good words 💌", "Make the bed 🛏️"],
    morningLove: "Morning love",
    morningTitle: "Good morning ☀️",
    morningBody: "Send {{partner}} a few good words",
    sent: "Sent ❤️",
    stretch: "Stretch",
    stretchTitle: "Stretch time 🧘",
    stretchBody: "5 minutes. Your back will thank you.",
    stretched: "Stretched ✔",
    openRoutine: "Open morning routine",
    workout: "Workout",
    workoutTitle: "Workout time 💪",
    workoutBody: "Get moving — even 20 minutes counts.",
    workedOut: "Worked out 💪",
  },
  he: {
    goodWords: "מילים טובות",
    routine: "שגרת בוקר",
    routineItems: ["מתיחות 5 דקות 🧘", "כוס מים 💧", "לשלוח מילים טובות 💌", "לסדר את המיטה 🛏️"],
    morningLove: "אהבה של בוקר",
    morningTitle: "בוקר טוב ☀️",
    morningBody: "לשלוח ל{{partner}} כמה מילים טובות 💌",
    sent: "נשלח ❤️",
    stretch: "מתיחות",
    stretchTitle: "זמן מתיחות 🧘",
    stretchBody: "5 דקות. הגב יודה לך.",
    stretched: "התמתחתי ✔",
    openRoutine: "לשגרת הבוקר",
    workout: "אימון",
    workoutTitle: "זמן אימון 💪",
    workoutBody: "קדימה לזוז — גם 20 דקות נחשבות.",
    workedOut: "התאמנתי 💪",
  },
};

/**
 * Creates the starter spaces and automations for a newly set-up user.
 * `shared` is true for whoever creates the home: they also get the shared house lists.
 */
export async function seedStarterBrain(db: SupabaseClient, opts: { userId: string; householdId: string; locale: Locale; timezone: string; shared: boolean }) {
  const c = copy[opts.locale];
  const today = todayKey(opts.timezone);
  // Shared house spaces come from the template library so they match "New space".
  const shared = opts.shared ? STARTER_SHARED.map((key) => SECTION_TEMPLATES.find((t) => t.key === key)!).map((t) => ({ t, ...instantiateTemplate(t, opts.locale, today) })) : [];
  const sectionRows = [
    { slug: `good-words-${opts.userId.slice(0, 8)}`, title: c.goodWords, icon: "💌", color: "pink", view: "list", owner_id: opts.userId, schema: [] as PropertyDef[] },
    { slug: `routine-${opts.userId.slice(0, 8)}`, title: c.routine, icon: "☀️", color: "amber", view: "checklist", owner_id: opts.userId, schema: [] as PropertyDef[] },
    ...shared.map(({ t, schema }) => ({ slug: t.key, template: t.key, title: t.title[opts.locale], icon: t.icon, color: t.color, view: t.view, owner_id: null, schema })),
  ].map((s, i) => ({ ...s, household_id: opts.householdId, position: i }));

  const { data: sections, error } = await db.from("sections").insert(sectionRows).select("id,slug");
  if (error) throw error;
  const id = (prefix: string) => sections!.find((s) => s.slug?.startsWith(prefix))!.id;
  const goodWords = id("good-words");
  const routine = id("routine");

  const items = [
    ...(opts.shared ? phrases : phrasesToHim)[opts.locale].map((title, i) => ({ section_id: goodWords, title, position: i })),
    ...c.routineItems.map((title, i) => ({ section_id: routine, title, position: i })),
    ...shared.flatMap(({ t, items }) =>
      items.map(({ habit, ...it }) => ({
        ...it,
        section_id: id(t.key),
        remind_at: habit ? (nextReminder(habit, new Date(), opts.timezone, () => false)?.at.toISOString() ?? null) : null,
      })),
    ),
  ];
  await db.from("items").insert(items);

  const defs: AutomationDef[] = [
    {
      name: c.morningLove,
      icon: "💌",
      enabled: true,
      trigger: { type: "event", event: "wake", delayMinutes: 0 },
      conditions: [{ type: "once_per_day" }, { type: "time_window", from: "04:00", to: "12:00" }],
      actions: [
        { type: "push", title: c.morningTitle, body: c.morningBody },
        { type: "whatsapp", to: "partner", text: `{{random:${goodWords}}}` },
        { type: "checkoff", label: c.sent },
      ],
    },
    {
      name: c.stretch,
      icon: "🧘",
      enabled: true,
      trigger: { type: "event", event: "wake", delayMinutes: 5 },
      conditions: [{ type: "once_per_day" }],
      actions: [
        { type: "push", title: c.stretchTitle, body: c.stretchBody },
        { type: "open_section", sectionId: routine, label: c.openRoutine },
        { type: "checkoff", label: c.stretched },
      ],
    },
    {
      name: c.workout,
      icon: "🏋️",
      enabled: true,
      trigger: { type: "schedule", days: [0, 2, 4], times: ["18:30"] },
      conditions: [],
      actions: [
        { type: "push", title: c.workoutTitle, body: c.workoutBody },
        { type: "checkoff", label: c.workedOut },
      ],
    },
  ];
  const now = new Date();
  await db.from("automations").insert(
    defs.map((d) => ({
      ...d,
      household_id: opts.householdId,
      owner_id: opts.userId,
      target_user_id: opts.userId,
      next_run_at: nextRunAt(d.trigger, now, opts.timezone)?.toISOString() ?? null,
    })),
  );
}
