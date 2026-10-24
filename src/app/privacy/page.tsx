import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Home Brain" };

// Public (no sign-in): Google's consent screen links here. Kept in both
// languages on one page, since visitors may not have a locale yet.
export default function PrivacyPage() {
  return (
    <main className="safe-top mx-auto max-w-2xl px-6 pb-16 pt-8 leading-relaxed">
      <h1 className="text-3xl font-extrabold tracking-tight">Home Brain — Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted">Last updated: October 23, 2026</p>

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
        <p>Delete any item or space in the app at any time. To delete your whole account and its data, contact the app owner.</p>
      </section>

      <section className="mt-10 space-y-3 border-t border-card-border pt-8" dir="rtl" lang="he">
        <h2 className="text-2xl font-extrabold">מדיניות פרטיות</h2>
        <p>Home Brain היא אפליקציה פרטית לבית — תזכורות, רשימות ופתקים משותפים. נשמרים רק האימייל, ההגדרות והתוכן שאתם יוצרים. לא מוכרים מידע ואין פרסומות.</p>
        <p>
          חיבור Gmail הוא אופציונלי ובקריאה בלבד: האפליקציה מחפשת קבלות כדי להציג את המנויים שלכם (שם, מחיר, תדירות, תאריך חידוש, ונושא ותאריך הקבלות). היא לא יכולה לשלוח, למחוק או לשנות מיילים, ולא שומרת את תוכן המיילים. הגישה
          נשמרת מוצפנת, ואפשר לנתק אותה בכל רגע בהגדרות. השימוש במידע מ-Google עומד במדיניות Google API Services User Data Policy, כולל דרישות ה-Limited Use.
        </p>
      </section>
    </main>
  );
}
