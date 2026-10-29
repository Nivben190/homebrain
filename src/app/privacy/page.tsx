import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Home Brain" };

// Public (no sign-in): Google's consent screen links here. Kept in both
// languages on one page, since visitors may not have a locale yet.
export default function PrivacyPage() {
  return (
    <main className="safe-top mx-auto max-w-2xl px-6 pb-16 pt-8 leading-relaxed">
      <h1 className="text-3xl font-extrabold tracking-tight">Home Brain — Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted">Last updated: October 29, 2026</p>

      <section className="mt-6 space-y-3" dir="ltr">
        <p>Home Brain is a private household app for reminders, lists and shared notes. This page explains what it stores and how it uses Google data.</p>
        <h2 className="pt-2 text-xl font-bold">What we store</h2>
        <p>Your account email, the name and settings you enter, and the lists, reminders and notes you create. Data is stored with Supabase and the app runs on Vercel. We don&apos;t sell data or show ads.</p>
        <h2 className="pt-2 text-xl font-bold">Gmail (optional)</h2>
        <p>
          If you choose <b>Connect Gmail</b>, the app asks for read-only access (<code>gmail.readonly</code>). It searches your mail for receipts and renewal notices to list your paid subscriptions: the service name, price, billing
          cycle, renewal date, and the subject and date of the receipts it used. It can&apos;t send, delete or change email, and it doesn&apos;t store email bodies.
        </p>
        <p>
          Your Google access token is stored encrypted and used only for this scan, once when you connect, daily after that, and whenever you tap “Scan now”. Disconnecting Gmail in Settings revokes access and deletes the token;
          you can also remove access at <a className="text-accent underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        </p>
        <p>
          Home Brain&apos;s use of information received from Google APIs adheres to the{" "}
          <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. Google data is used only
          to show you your subscriptions. It isn&apos;t shared with anyone, used for ads, or used to train AI models.
        </p>
        <h2 className="pt-2 text-xl font-bold">Deleting your data</h2>
        <p>Delete any item or space in the app at any time. In <b>Me → Your data</b> you can download everything as a zip, or delete your account yourself. If you&apos;re the last person in the home, the whole home and its files go with it; otherwise shared spaces stay with the others and only your private spaces and files are removed. Connected Google accounts are revoked first.</p>
        <h2 className="pt-2 text-xl font-bold">Services we use</h2>
        <ul className="list-disc space-y-1 ps-5">
          <li><b>Supabase</b> — database, sign-in and file storage (Mumbai region).</li>
          <li><b>Vercel</b> — hosting (Mumbai region).</li>
          <li><b>Google Gmail and Calendar</b> — only if you connect them.</li>
          <li><b>Google Gemini</b> — reads fridge photos when you use the fridge scan. On Google&apos;s free tier, Google may use those photos to improve its products, so don&apos;t scan anything private.</li>
          <li><b>Resend</b> — sends sign-in and notice emails.</li>
          <li><b>Open-Meteo</b> and <b>Hebcal</b> — weather and Shabbat times for the place you set.</li>
          <li><b>Apple, Google and Mozilla push services</b> — deliver notifications to your devices.</li>
        </ul>
        <h2 className="pt-2 text-xl font-bold">How long we keep things</h2>
        <p>Your content stays until you delete it. Background job records are removed after 14 days, engine logs after 3 days and rate-limit counters after 2 days. Nightly encrypted backups are kept for a short rolling period.</p>
      </section>

      <section className="mt-10 space-y-3 border-t border-card-border pt-8" dir="rtl" lang="he">
        <h2 className="text-2xl font-extrabold">מדיניות פרטיות</h2>
        <p>Home Brain היא אפליקציה פרטית לבית — תזכורות, רשימות ופתקים משותפים. נשמרים רק האימייל, ההגדרות והתוכן שאתם יוצרים. לא מוכרים מידע ואין פרסומות.</p>
        <p>
          חיבור Gmail הוא אופציונלי ובקריאה בלבד: האפליקציה מחפשת קבלות כדי להציג את המנויים שלכם (שם, מחיר, תדירות, תאריך חידוש, ונושא ותאריך הקבלות). היא לא יכולה לשלוח, למחוק או לשנות מיילים, ולא שומרת את תוכן המיילים. הגישה
          נשמרת מוצפנת, ואפשר לנתק אותה בכל רגע בהגדרות. השימוש במידע מ-Google עומד במדיניות Google API Services User Data Policy, כולל דרישות ה-Limited Use.
        </p>
        <p>
          ב<b>אני ← המידע שלכם</b> אפשר להוריד הכל כקובץ zip או למחוק את החשבון בעצמכם. אם אתם האחרונים בבית, כל הבית נמחק; אחרת המרחבים המשותפים נשארים, ורק המרחבים והקבצים הפרטיים שלכם נמחקים.
        </p>
        <p>
          שירותים: Supabase ו-Vercel (אחסון ושרתים, מומבאי), Google Gmail ויומן (רק אם חיברתם), Google Gemini לסריקת המקרר (בשכבה החינמית Google עשויה להשתמש בתמונות), Resend למיילים, Open-Meteo ו-Hebcal למזג אוויר וזמני שבת, ושירותי
          ההתראות של Apple, Google ו-Mozilla. התוכן נשמר עד שתמחקו אותו; רישומי משימות נמחקים אחרי 14 יום, לוגים אחרי 3 ימים.
        </p>
      </section>
    </main>
  );
}
