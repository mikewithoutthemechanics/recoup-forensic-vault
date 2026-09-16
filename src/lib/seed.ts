import { sql } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  activities,
  arrangements,
  consents,
  customers,
  invoices,
  messages,
  organizations,
  paymentRequests,
  payments,
  playbooks,
  policies,
  recoveryCases,
} from "@/db/schema";
import { scoreAccount } from "@/lib/ai/scoring";

const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

type ConsentSpec = Partial<Record<"whatsapp" | "sms" | "email" | "voice", "granted" | "denied" | "revoked">>;

type Spec = {
  name: string;
  contact: string;
  email: string;
  mobile: string;
  lang?: string;
  type?: "b2b" | "b2c";
  vertical: string;
  rel: number;
  onTime: number;
  late: number;
  broken?: number;
  ltv: number;
  pref?: string;
  notes?: string;
  consent: ConsentSpec;
  inv: {
    number: string;
    desc: string;
    category: string;
    amount: number;
    balance?: number;
    dueDaysAgo: number;
    status?: string;
    failureReason?: string;
  };
  caseSpec: {
    status: string;
    touches: number;
    replies?: { body: string; intent: string; sentiment: string; daysAgo: number }[];
    assignedTo?: string;
    holdReason?: string;
    promisedIn?: number;
    arrangement?: { instalments: number; deposit: number; cadence: "weekly" | "monthly"; status: string };
  };
};

const R = (rands: number) => Math.round(rands * 100);

const SPECS: Spec[] = [
  {
    name: "Thabo Molefe (Brightside Academy)",
    contact: "Thabo Molefe",
    email: "thabo.molefe@gmail.com",
    mobile: "+27 82 445 1120",
    type: "b2c",
    vertical: "school",
    rel: 34,
    onTime: 9,
    late: 3,
    ltv: R(148_000),
    pref: "whatsapp",
    notes: "Grade 6 parent. Usually pays within a week of the reminder.",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "SCH-2291", desc: "Term 3 school fees — Grade 6", category: "school_fee", amount: R(12_450), dueDaysAgo: 38 },
    caseSpec: {
      status: "engaging",
      touches: 2,
      replies: [{ body: "Hi, sorry — salary comes in on the 25th, I'll settle then.", intent: "promise_to_pay", sentiment: "positive", daysAgo: 3 }],
    },
  },
  {
    name: "Naledi Khumalo",
    contact: "Naledi Khumalo",
    email: "n.khumalo@outlook.com",
    mobile: "+27 71 903 8842",
    type: "b2c",
    vertical: "clinic",
    rel: 18,
    onTime: 4,
    late: 2,
    ltv: R(31_400),
    pref: "sms",
    notes: "Medical aid short-paid consultation; patient liable for co-payment.",
    consent: { whatsapp: "granted", sms: "granted", email: "denied", voice: "granted" },
    inv: { number: "CLN-8842", desc: "Consultation co-payment (medical aid shortfall)", category: "clinic", amount: R(2_340), dueDaysAgo: 52 },
    caseSpec: { status: "engaging", touches: 3 },
  },
  {
    name: "Sipho Ndlovu — Unit 14B, Mkhize Court",
    contact: "Sipho Ndlovu",
    email: "sipho.ndlovu@webmail.co.za",
    mobile: "+27 83 221 7764",
    type: "b2c",
    vertical: "rental",
    rel: 27,
    onTime: 22,
    late: 5,
    ltv: R(229_500),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: { number: "RNT-1408", desc: "October rental arrears — Unit 14B", category: "rental", amount: R(8_500), dueDaysAgo: 25 },
    caseSpec: { status: "promise_to_pay", touches: 2, promisedIn: 4 },
  },
  {
    name: "Vuyo's Auto Spares CC",
    contact: "Vuyo Ngcobo",
    email: "accounts@vuyosauto.co.za",
    mobile: "+27 84 660 2231",
    vertical: "services",
    rel: 41,
    onTime: 26,
    late: 11,
    broken: 1,
    ltv: R(1_240_000),
    pref: "email",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "INV-10231", desc: "Parts supply — September statement", category: "invoice", amount: R(47_800), dueDaysAgo: 71 },
    caseSpec: {
      status: "arrangement",
      touches: 4,
      replies: [{ body: "Can we do a payment plan over 3 months? Cash flow is tight after the strike.", intent: "negotiate", sentiment: "neutral", daysAgo: 5 }],
      arrangement: { instalments: 3, deposit: 20, cadence: "monthly", status: "active" },
    },
  },
  {
    name: "Bellview Dental Studio",
    contact: "Dr Amina Patel",
    email: "billing@bellviewdental.co.za",
    mobile: "+27 82 118 9043",
    vertical: "subscription",
    rel: 14,
    onTime: 13,
    late: 1,
    ltv: R(18_186),
    pref: "email",
    consent: { whatsapp: "granted", sms: "denied", email: "granted", voice: "denied" },
    inv: {
      number: "SUB-4471",
      desc: "Practice software — monthly subscription",
      category: "subscription",
      amount: R(1_299),
      dueDaysAgo: 4,
      failureReason: "card declined: insufficient funds",
    },
    caseSpec: { status: "engaging", touches: 1 },
  },
  {
    name: "Lindiwe Dlamini",
    contact: "Lindiwe Dlamini",
    email: "lindiwe.d@gmail.com",
    mobile: "+27 76 550 3318",
    type: "b2c",
    vertical: "retail",
    rel: 2,
    onTime: 1,
    late: 0,
    ltv: R(1_290),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: { number: "CHK-77120", desc: "Abandoned basket — 3 items", category: "checkout", amount: R(680), dueDaysAgo: 2 },
    caseSpec: { status: "queued", touches: 0 },
  },
  {
    name: "Coastal Freight (Pty) Ltd",
    contact: "Marius Steyn",
    email: "marius@coastalfreight.co.za",
    mobile: "+27 82 774 9901",
    vertical: "services",
    rel: 62,
    onTime: 44,
    late: 19,
    broken: 2,
    ltv: R(4_850_000),
    pref: "voice",
    notes: "Largest exposure in the book. Group CFO must be involved before any escalation.",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "INV-09884", desc: "Cross-dock warehousing — Q2", category: "invoice", amount: R(124_500), dueDaysAgo: 96 },
    caseSpec: { status: "escalated", touches: 5, assignedTo: "Thandi M. (Collections lead)", holdReason: "Balance over R25 000 and 96 days overdue" },
  },
  {
    name: "Anika van Wyk (Hoërskool Waterkloof)",
    contact: "Anika van Wyk",
    email: "anika.vw@telkomsa.net",
    mobile: "+27 79 220 6654",
    type: "b2c",
    lang: "af",
    vertical: "school",
    rel: 51,
    onTime: 18,
    late: 2,
    ltv: R(196_000),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: { number: "SCH-2318", desc: "Skoolgeld Kwartaal 3 — Graad 9", category: "school_fee", amount: R(6_200), dueDaysAgo: 12 },
    caseSpec: { status: "engaging", touches: 1 },
  },
  {
    name: "Ntombi Sithole",
    contact: "Ntombi Sithole",
    email: "ntombi.sithole@gmail.com",
    mobile: "+27 73 884 2201",
    type: "b2c",
    lang: "zu",
    vertical: "clinic",
    rel: 9,
    onTime: 2,
    late: 1,
    ltv: R(6_400),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "denied", voice: "denied" },
    inv: { number: "CLN-9014", desc: "Physio session — private patient", category: "clinic", amount: R(980), dueDaysAgo: 19 },
    caseSpec: { status: "engaging", touches: 2 },
  },
  {
    name: "Highveld Plumbing Solutions",
    contact: "Pieter Erasmus",
    email: "pieter@highveldplumbing.co.za",
    mobile: "+27 82 337 1198",
    vertical: "services",
    rel: 6,
    onTime: 2,
    late: 0,
    ltv: R(88_000),
    pref: "email",
    consent: { whatsapp: "granted", sms: "denied", email: "granted", voice: "granted" },
    inv: { number: "QTE-3392", desc: "Quote — warehouse pipe replacement", category: "quote", amount: R(32_000), dueDaysAgo: 9 },
    caseSpec: { status: "queued", touches: 0 },
  },
  {
    name: "Café Mazuri",
    contact: "Grace Okonkwo",
    email: "grace@cafemazuri.co.za",
    mobile: "+27 81 449 7720",
    vertical: "subscription",
    rel: 22,
    onTime: 19,
    late: 3,
    ltv: R(21_576),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: {
      number: "SUB-4488",
      desc: "POS + loyalty subscription",
      category: "subscription",
      amount: R(899),
      dueDaysAgo: 9,
      failureReason: "debit order unpaid: R/D",
    },
    caseSpec: { status: "engaging", touches: 2 },
  },
  {
    name: "Johan Pretorius — Riverside Estate 22",
    contact: "Johan Pretorius",
    email: "jpretorius@mweb.co.za",
    mobile: "+27 83 992 4471",
    type: "b2c",
    lang: "af",
    vertical: "rental",
    rel: 44,
    onTime: 31,
    late: 12,
    broken: 1,
    ltv: R(612_000),
    pref: "sms",
    consent: { whatsapp: "denied", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "RNT-2202", desc: "Rental arrears + utilities — Erf 22", category: "rental", amount: R(14_200), dueDaysAgo: 61 },
    caseSpec: { status: "engaging", touches: 4 },
  },
  {
    name: "Zanele Mabaso",
    contact: "Zanele Mabaso",
    email: "zanele.mabaso@icloud.com",
    mobile: "+27 78 220 9911",
    type: "b2c",
    vertical: "retail",
    rel: 29,
    onTime: 14,
    late: 1,
    ltv: R(46_700),
    pref: "whatsapp",
    notes: "No orders in 7 months. High historic spend — reactivation candidate.",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: { number: "RCT-0031", desc: "Dormant account — average basket R3 500", category: "dormant", amount: R(3_500), dueDaysAgo: 210 },
    caseSpec: { status: "queued", touches: 0 },
  },
  {
    name: "TechNova Solutions",
    contact: "Refilwe Sekhukhune",
    email: "ap@technova.africa",
    mobile: "+27 74 118 3320",
    vertical: "services",
    rel: 16,
    onTime: 6,
    late: 4,
    ltv: R(310_000),
    pref: "email",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "INV-10402", desc: "Managed IT support — August", category: "invoice", amount: R(18_750), dueDaysAgo: 33, status: "disputed" },
    caseSpec: {
      status: "disputed",
      touches: 3,
      assignedTo: "Sipho D. (Billing specialist)",
      holdReason: "Dispute raised by customer",
      replies: [
        {
          body: "This invoice is incorrect — we cancelled the second support block in July and never received those hours.",
          intent: "dispute",
          sentiment: "negative",
          daysAgo: 2,
        },
      ],
    },
  },
  {
    name: "Grace Mthembu (Sunridge Prep)",
    contact: "Grace Mthembu",
    email: "grace.mthembu@gmail.com",
    mobile: "+27 72 665 0098",
    type: "b2c",
    vertical: "school",
    rel: 25,
    onTime: 11,
    late: 1,
    ltv: R(92_000),
    pref: "email",
    consent: { whatsapp: "granted", sms: "revoked", email: "granted", voice: "denied" },
    inv: { number: "SCH-2340", desc: "Aftercare + transport levy", category: "school_fee", amount: R(4_100), dueDaysAgo: 5 },
    caseSpec: { status: "queued", touches: 0 },
  },
  {
    name: "Bongani Zulu",
    contact: "Bongani Zulu",
    email: "bongani.zulu@gmail.com",
    mobile: "+27 60 771 4432",
    type: "b2c",
    vertical: "clinic",
    rel: 11,
    onTime: 1,
    late: 3,
    broken: 1,
    ltv: R(4_900),
    pref: "sms",
    consent: { whatsapp: "revoked", sms: "revoked", email: "revoked", voice: "revoked" },
    inv: { number: "CLN-9102", desc: "Radiology account — patient portion", category: "clinic", amount: R(1_760), dueDaysAgo: 44 },
    caseSpec: {
      status: "paused",
      touches: 3,
      holdReason: "Customer opted out of all channels",
      replies: [{ body: "STOP", intent: "opt_out", sentiment: "negative", daysAgo: 6 }],
    },
  },
  {
    name: "Kalahari Kitchens",
    contact: "Dineo Mahlangu",
    email: "dineo@kalaharikitchens.co.za",
    mobile: "+27 82 009 5512",
    vertical: "services",
    rel: 19,
    onTime: 15,
    late: 2,
    ltv: R(420_000),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "INV-10455", desc: "Cabinetry installation — final 30%", category: "invoice", amount: R(9_300), dueDaysAgo: 15 },
    caseSpec: { status: "engaging", touches: 1 },
  },
  {
    name: "Mbeki & Partners Attorneys",
    contact: "Lerato Mbeki",
    email: "finance@mbekipartners.co.za",
    mobile: "+27 83 447 2210",
    vertical: "services",
    rel: 38,
    onTime: 33,
    late: 2,
    ltv: R(1_980_000),
    pref: "email",
    consent: { whatsapp: "denied", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "INV-10488", desc: "Office fit-out — phase 2", category: "invoice", amount: R(63_200), dueDaysAgo: 8 },
    caseSpec: { status: "queued", touches: 0 },
  },
  {
    name: "Fatima Patel (Sunridge Prep)",
    contact: "Fatima Patel",
    email: "fatima.patel@yahoo.com",
    mobile: "+27 82 556 1147",
    type: "b2c",
    vertical: "school",
    rel: 48,
    onTime: 16,
    late: 8,
    broken: 2,
    ltv: R(238_000),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "granted" },
    inv: { number: "SCH-2277", desc: "Outstanding Term 2 + Term 3 fees", category: "school_fee", amount: R(22_400), dueDaysAgo: 70 },
    caseSpec: {
      status: "arrangement",
      touches: 5,
      arrangement: { instalments: 4, deposit: 20, cadence: "monthly", status: "active" },
      replies: [{ body: "I was retrenched in June. I can do R4 000 a month, nothing more.", intent: "hardship", sentiment: "negative", daysAgo: 9 }],
    },
  },
  {
    name: "Chloe Adams — Ocean View 7",
    contact: "Chloe Adams",
    email: "chloe.adams@gmail.com",
    mobile: "+27 84 220 7781",
    type: "b2c",
    vertical: "rental",
    rel: 8,
    onTime: 7,
    late: 0,
    ltv: R(47_200),
    pref: "whatsapp",
    consent: { whatsapp: "granted", sms: "granted", email: "granted", voice: "denied" },
    inv: { number: "RNT-2251", desc: "Rental — November", category: "rental", amount: R(5_900), dueDaysAgo: 3 },
    caseSpec: { status: "queued", touches: 0 },
  },
];

/** Already-recovered work so the reporting views have real history. */
const RECOVERED = [
  { customerIdx: 0, number: "SCH-2201", desc: "Term 2 school fees", category: "school_fee", amount: R(11_900), daysAgo: 6, channel: "whatsapp", playbook: "gentle_nudge", method: "payshap" },
  { customerIdx: 3, number: "INV-10122", desc: "Parts supply — July", category: "invoice", amount: R(28_400), daysAgo: 9, channel: "email", playbook: "payment_request", method: "eft" },
  { customerIdx: 10, number: "SUB-4402", desc: "POS subscription retry", category: "subscription", amount: R(899), daysAgo: 11, channel: "whatsapp", playbook: "subscription_dunning", method: "card_link" },
  { customerIdx: 1, number: "CLN-8790", desc: "Consultation co-payment", category: "clinic", amount: R(1_450), daysAgo: 14, channel: "sms", playbook: "payment_request", method: "payshap" },
  { customerIdx: 16, number: "INV-10380", desc: "Cabinetry deposit", category: "invoice", amount: R(21_700), daysAgo: 17, channel: "whatsapp", playbook: "payment_request", method: "payshap" },
  { customerIdx: 2, number: "RNT-1390", desc: "September rental", category: "rental", amount: R(8_500), daysAgo: 21, channel: "whatsapp", playbook: "arrangement_offer", method: "payshap" },
  { customerIdx: 5, number: "CHK-76044", desc: "Recovered basket", category: "checkout", amount: R(1_290), daysAgo: 24, channel: "whatsapp", playbook: "checkout_recovery", method: "payshap" },
  { customerIdx: 7, number: "SCH-2244", desc: "Skoolgeld Kwartaal 2", category: "school_fee", amount: R(6_050), daysAgo: 28, channel: "whatsapp", playbook: "gentle_nudge", method: "payshap" },
  { customerIdx: 17, number: "INV-10301", desc: "Office fit-out phase 1", category: "invoice", amount: R(58_400), daysAgo: 33, channel: "email", playbook: "payment_request", method: "eft" },
  { customerIdx: 8, number: "CLN-8944", desc: "Physio block booking", category: "clinic", amount: R(1_240), daysAgo: 38, channel: "whatsapp", playbook: "gentle_nudge", method: "payshap" },
  { customerIdx: 11, number: "RNT-2180", desc: "Rental arrears settled", category: "rental", amount: R(12_800), daysAgo: 44, channel: "sms", playbook: "arrangement_offer", method: "eft" },
  { customerIdx: 4, number: "SUB-4390", desc: "Practice software retry", category: "subscription", amount: R(1_299), daysAgo: 49, channel: "email", playbook: "subscription_dunning", method: "card_link" },
];

const PLAYBOOKS = [
  {
    key: "gentle_nudge",
    name: "Friendly nudge",
    description: "High-propensity, recently due accounts. Warm tone, one-tap PayShap request, no pressure.",
    category: "invoice",
    steps: [
      { dayOffset: -2, channel: "whatsapp", goal: "Pre-due courtesy reminder", tone: "warm" },
      { dayOffset: 3, channel: "whatsapp", goal: "Friendly nudge + payment link", tone: "warm" },
      { dayOffset: 8, channel: "email", goal: "Statement + link", tone: "professional" },
    ],
  },
  {
    key: "payment_request",
    name: "Direct payment request",
    description: "Responsive accounts in the 15–45 day band. Clear ask, PayShap request, deadline framing.",
    category: "invoice",
    steps: [
      { dayOffset: 0, channel: "whatsapp", goal: "Direct request with link", tone: "firm-friendly" },
      { dayOffset: 3, channel: "sms", goal: "Short reminder", tone: "firm-friendly" },
      { dayOffset: 7, channel: "email", goal: "Formal statement", tone: "professional" },
      { dayOffset: 12, channel: "voice", goal: "AI voice call", tone: "professional" },
    ],
  },
  {
    key: "arrangement_offer",
    name: "Payment arrangement",
    description: "Willing but strained payers. Offers instalments inside policy limits, no interest or fees.",
    category: "invoice",
    steps: [
      { dayOffset: 0, channel: "whatsapp", goal: "Offer instalment plan", tone: "empathetic" },
      { dayOffset: 4, channel: "email", goal: "Written terms for signature", tone: "professional" },
      { dayOffset: 10, channel: "whatsapp", goal: "Confirm first instalment", tone: "empathetic" },
    ],
  },
  {
    key: "subscription_dunning",
    name: "Subscription recovery",
    description: "Failed card and debit-order recovery with retry windows timed to SA payday cycles.",
    category: "subscription",
    steps: [
      { dayOffset: 0, channel: "email", goal: "Notify + update card", tone: "neutral" },
      { dayOffset: 2, channel: "whatsapp", goal: "One-tap card update", tone: "warm" },
      { dayOffset: 5, channel: "sms", goal: "Final retry before pause", tone: "firm-friendly" },
    ],
  },
  {
    key: "checkout_recovery",
    name: "Abandoned checkout",
    description: "Recovers baskets within 72 hours using low-friction PayShap requests.",
    category: "checkout",
    steps: [
      { dayOffset: 0, channel: "whatsapp", goal: "Basket still open", tone: "warm" },
      { dayOffset: 1, channel: "email", goal: "Reminder + incentive", tone: "warm" },
    ],
  },
  {
    key: "reactivation",
    name: "Dormant reactivation",
    description: "Win-back sequence for customers with no activity in 90+ days. Never mentions debt.",
    category: "dormant",
    steps: [
      { dayOffset: 0, channel: "whatsapp", goal: "We miss you", tone: "warm" },
      { dayOffset: 7, channel: "email", goal: "Personalised offer", tone: "warm" },
    ],
  },
  {
    key: "quote_followup",
    name: "Quote follow-up",
    description: "Converts open quotes into signed work before they go stale.",
    category: "quote",
    steps: [
      { dayOffset: 2, channel: "email", goal: "Any questions?", tone: "professional" },
      { dayOffset: 6, channel: "whatsapp", goal: "Offer to adjust scope", tone: "warm" },
    ],
  },
  {
    key: "high_value_human",
    name: "High-value human handoff",
    description: "Large or aged balances are packaged for a human caller with full context. Never automated.",
    category: "invoice",
    steps: [{ dayOffset: 0, channel: "voice", goal: "Brief a human caller", tone: "professional" }],
  },
  {
    key: "pre_legal_review",
    name: "Pre-legal review",
    description: "Assembles the file for legal review. Requires a human signature — the AI never threatens action.",
    category: "invoice",
    steps: [{ dayOffset: 0, channel: "email", goal: "Final courtesy notice (human approved)", tone: "formal" }],
  },
];

export async function isSeeded(): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(organizations);
  return (row?.n ?? 0) > 0;
}

let seedingPromise: Promise<void> | null = null;

/** Safe to call from anywhere — uses a Postgres advisory lock so parallel
 *  renders (layout + page) can never double-seed the demo portfolio. */
export async function ensureSeeded(): Promise<void> {
  if (await isSeeded()) return;
  if (!seedingPromise) {
    seedingPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query("select pg_advisory_lock($1)", [918_273_645]);
        if (!(await isSeeded())) await seedDatabase();
      } finally {
        await client.query("select pg_advisory_unlock($1)", [918_273_645]).catch(() => undefined);
        client.release();
      }
    })();
    void seedingPromise.finally(() => {
      seedingPromise = null;
    });
  }
  await seedingPromise;
}

export async function seedDatabase(): Promise<void> {
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Kopano Group",
      industry: "Multi-entity: trade, schools, clinics, rentals, SaaS",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
    })
    .returning();

  await db.insert(policies).values({ orgId: org.id, signature: "Lerato from Accounts" });

  await db.insert(playbooks).values(
    PLAYBOOKS.map((p) => ({
      orgId: org.id,
      key: p.key,
      name: p.name,
      description: p.description,
      category: p.category,
      steps: p.steps,
      active: true,
      touches: 0,
      recoveredCents: 0,
    })),
  );

  const customerIds: number[] = [];

  for (const spec of SPECS) {
    const [cust] = await db
      .insert(customers)
      .values({
        orgId: org.id,
        name: spec.name,
        contactName: spec.contact,
        email: spec.email,
        mobile: spec.mobile,
        language: spec.lang ?? "en",
        customerType: spec.type ?? "b2b",
        vertical: spec.vertical,
        relationshipMonths: spec.rel,
        onTimePayments: spec.onTime,
        latePayments: spec.late,
        brokenPromises: spec.broken ?? 0,
        lifetimeValueCents: spec.ltv,
        preferredChannel: spec.pref ?? "whatsapp",
        notes: spec.notes,
        createdAt: ago(spec.rel * 30),
      })
      .returning();
    customerIds.push(cust.id);

    for (const channel of ["whatsapp", "sms", "email", "voice"] as const) {
      const status = spec.consent[channel] ?? "denied";
      await db.insert(consents).values({
        customerId: cust.id,
        channel,
        status,
        source: status === "granted" ? "signed application form" : status === "revoked" ? "customer opt-out" : "not provided",
        capturedAt: ago(spec.rel * 30 - 1),
        revokedAt: status === "revoked" ? ago(6) : null,
        note: status === "revoked" ? "Customer replied STOP — suppressed" : null,
      });
    }

    const dueAt = ago(spec.inv.dueDaysAgo);
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId: org.id,
        customerId: cust.id,
        number: spec.inv.number,
        description: spec.inv.desc,
        category: spec.inv.category,
        amountCents: spec.inv.amount,
        balanceCents: spec.inv.balance ?? spec.inv.amount,
        issuedAt: ago(spec.inv.dueDaysAgo + 30),
        dueAt,
        status: spec.inv.status ?? (spec.inv.dueDaysAgo > 0 ? "overdue" : "open"),
        failureReason: spec.inv.failureReason,
        createdAt: ago(spec.inv.dueDaysAgo + 30),
      })
      .returning();

    const grantedChannels = Object.values(spec.consent).filter((s) => s === "granted").length;
    const replies = spec.caseSpec.replies ?? [];
    const score = scoreAccount({
      amountCents: inv.amountCents,
      balanceCents: inv.balanceCents,
      dueAt,
      category: inv.category,
      customerType: cust.customerType,
      relationshipMonths: cust.relationshipMonths,
      onTimePayments: cust.onTimePayments,
      latePayments: cust.latePayments,
      brokenPromises: cust.brokenPromises,
      lifetimeValueCents: cust.lifetimeValueCents,
      inboundReplies: replies.length,
      outboundTouches: spec.caseSpec.touches,
      hasDispute: spec.caseSpec.status === "disputed",
      hasActiveArrangement: Boolean(spec.caseSpec.arrangement),
      hasPartialPayment: false,
      consentedChannels: grantedChannels,
    });

    const lastContact = spec.caseSpec.touches > 0 ? ago(1 + (spec.inv.dueDaysAgo % 3)) : null;
    const [kase] = await db
      .insert(recoveryCases)
      .values({
        orgId: org.id,
        customerId: cust.id,
        invoiceId: inv.id,
        playbookKey: score.strategy,
        status: spec.caseSpec.status,
        stepIndex: spec.caseSpec.touches,
        propensity: score.propensity,
        priority: score.priority,
        riskTier: score.riskTier,
        segment: score.segment,
        nextAction:
          spec.caseSpec.status === "paused"
            ? "Suppressed — no consented channel"
            : spec.caseSpec.status === "disputed"
              ? "Billing specialist to respond within 1 business day"
              : `${score.segment} — next touch queued`,
        nextChannel: spec.pref ?? "whatsapp",
        nextActionAt: spec.caseSpec.status === "paused" ? null : ago(-(Math.random() * 0.6)),
        lastContactAt: lastContact,
        contactsThisWeek: Math.min(2, spec.caseSpec.touches),
        promisedAmountCents: spec.caseSpec.promisedIn ? inv.balanceCents : null,
        promisedAt: spec.caseSpec.promisedIn ? ahead(spec.caseSpec.promisedIn) : null,
        aiSummary: `${score.segment}. Propensity ${score.propensity}/100 · expected recovery ${Math.round(score.expectedRecoveryCents / 100)} ZAR.`,
        aiRationale: score.rationale,
        holdReason: spec.caseSpec.holdReason,
        assignedTo: spec.caseSpec.assignedTo,
        openedAt: ago(spec.inv.dueDaysAgo),
      })
      .returning();

    // Historic outbound touches.
    const channels = ["whatsapp", "email", "sms", "voice"];
    for (let t = 0; t < spec.caseSpec.touches; t += 1) {
      const ch = spec.consent[(spec.pref ?? "whatsapp") as keyof ConsentSpec] === "granted" ? (spec.pref ?? "whatsapp") : channels[t % 3];
      await db.insert(messages).values({
        caseId: kase.id,
        customerId: cust.id,
        direction: "outbound",
        channel: ch,
        subject: ch === "email" ? `Outstanding balance on ${inv.number}` : null,
        body:
          t === 0
            ? `Hi ${spec.contact.split(" ")[0]}, a friendly reminder that ${inv.number} for R${(inv.balanceCents / 100).toLocaleString("en-ZA")} is due. You can settle it in seconds with PayShap: https://pay.recoup.africa/r/${inv.number.slice(-4)}${t}`
            : `Hi ${spec.contact.split(" ")[0]}, following up on ${inv.number} (R${(inv.balanceCents / 100).toLocaleString("en-ZA")} outstanding). Happy to arrange a payment plan if that helps — just reply here.`,
        status: "delivered",
        tone: "warm-professional",
        generatedBy: "ai",
        costCents: ch === "voice" ? 120 : ch === "sms" ? 25 : ch === "whatsapp" ? 12 : 2,
        createdAt: ago(spec.inv.dueDaysAgo - t * 5 > 0 ? Math.max(1, spec.inv.dueDaysAgo - t * 6) : 2 + t),
      });
    }

    for (const reply of replies) {
      await db.insert(messages).values({
        caseId: kase.id,
        customerId: cust.id,
        direction: "inbound",
        channel: spec.pref ?? "whatsapp",
        body: reply.body,
        status: "delivered",
        intent: reply.intent,
        sentiment: reply.sentiment,
        generatedBy: "customer",
        createdAt: ago(reply.daysAgo),
      });
      await db.insert(activities).values({
        orgId: org.id,
        caseId: kase.id,
        type: reply.intent === "dispute" ? "dispute" : "message",
        title: `Inbound ${reply.intent.replace("_", " ")} — ${cust.name}`,
        detail: reply.body.slice(0, 140),
        actor: "customer",
        createdAt: ago(reply.daysAgo),
      });
    }

    if (spec.caseSpec.arrangement) {
      const a = spec.caseSpec.arrangement;
      const deposit = Math.round((inv.balanceCents * a.deposit) / 100);
      await db.insert(arrangements).values({
        caseId: kase.id,
        invoiceId: inv.id,
        totalCents: inv.balanceCents,
        depositCents: deposit,
        instalments: a.instalments,
        instalmentCents: Math.ceil((inv.balanceCents - deposit) / a.instalments / 100) * 100,
        cadence: a.cadence,
        firstDueAt: ahead(7),
        status: a.status,
        approvedBy: "ai",
        createdAt: ago(4),
      });
    }

    if (["engaging", "promise_to_pay", "arrangement"].includes(spec.caseSpec.status)) {
      await db.insert(paymentRequests).values({
        caseId: kase.id,
        invoiceId: inv.id,
        amountCents: inv.balanceCents,
        method: inv.balanceCents <= 1_500_000 ? "payshap" : "card_link",
        reference: `${inv.number}-${kase.id}A`,
        token: `${inv.number.slice(-4)}${kase.id}`,
        status: "pending",
        expiresAt: ahead(5),
        createdAt: lastContact ?? ago(2),
      });
    }
  }

  // Recovered history for reporting.
  for (const r of RECOVERED) {
    const customerId = customerIds[r.customerIdx];
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId: org.id,
        customerId,
        number: r.number,
        description: r.desc,
        category: r.category,
        amountCents: r.amount,
        balanceCents: 0,
        issuedAt: ago(r.daysAgo + 45),
        dueAt: ago(r.daysAgo + 15),
        status: "paid",
        createdAt: ago(r.daysAgo + 45),
      })
      .returning();

    const [kase] = await db
      .insert(recoveryCases)
      .values({
        orgId: org.id,
        customerId,
        invoiceId: inv.id,
        playbookKey: r.playbook,
        status: "recovered",
        stepIndex: 2,
        propensity: 78,
        priority: 40,
        riskTier: "low",
        segment: "Recovered",
        recoveredCents: r.amount,
        aiSummary: `Recovered ${r.amount / 100} ZAR via ${r.channel} using the ${r.playbook.replace("_", " ")} playbook.`,
        openedAt: ago(r.daysAgo + 15),
        closedAt: ago(r.daysAgo),
        lastContactAt: ago(r.daysAgo + 1),
        nextActionAt: null,
      })
      .returning();

    await db.insert(messages).values({
      caseId: kase.id,
      customerId,
      direction: "outbound",
      channel: r.channel,
      body: `Reminder for ${inv.number}. Pay in seconds with PayShap.`,
      status: "delivered",
      generatedBy: "ai",
      createdAt: ago(r.daysAgo + 1),
      costCents: r.channel === "sms" ? 25 : r.channel === "whatsapp" ? 12 : 2,
    });

    await db.insert(payments).values({
      orgId: org.id,
      caseId: kase.id,
      invoiceId: inv.id,
      amountCents: r.amount,
      method: r.method,
      reference: `${inv.number}-PD`,
      attributedTo: "ai",
      paidAt: ago(r.daysAgo),
    });

    await db.insert(activities).values({
      orgId: org.id,
      caseId: kase.id,
      type: "payment",
      title: `Recovered R${(r.amount / 100).toLocaleString("en-ZA")}`,
      detail: `${r.method} · ${inv.number} · ${r.playbook.replace("_", " ")} playbook`,
      actor: "ai",
      amountCents: r.amount,
      createdAt: ago(r.daysAgo),
    });

    await db
      .update(playbooks)
      .set({
        recoveredCents: sql`${playbooks.recoveredCents} + ${r.amount}`,
        touches: sql`${playbooks.touches} + 2`,
      })
      .where(sql`${playbooks.orgId} = ${org.id} and ${playbooks.key} = ${r.playbook}`);
  }

  await db.insert(activities).values({
    orgId: org.id,
    caseId: null,
    type: "system",
    title: "Recoup AI connected to the accounting ledger",
    detail: "Imported 32 invoices, 20 customers and consent records. Agent armed with the org communication policy.",
    actor: "system",
    createdAt: ago(60),
  });
}

export async function resetDatabase(): Promise<void> {
  await db.execute(sql`truncate table
    ${activities}, ${arrangements}, ${consents}, ${customers}, ${invoices}, ${messages},
    ${organizations}, ${paymentRequests}, ${payments}, ${playbooks}, ${policies}, ${recoveryCases}
    restart identity cascade`);
  await seedDatabase();
}
