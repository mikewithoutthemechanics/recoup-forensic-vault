import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Recoup AI — schema
 * All money is stored in ZAR cents (integers) to avoid float drift.
 */

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull().default("multi"),
  currency: text("currency").notNull().default("ZAR"),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Communication + escalation policy (compliance guardrails for the agent). */
export const policies = pgTable(
  "policies",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quietHoursStart: integer("quiet_hours_start").notNull().default(20), // 20:00
    quietHoursEnd: integer("quiet_hours_end").notNull().default(8), // 08:00
    contactSundays: boolean("contact_sundays").notNull().default(false),
    maxContactsPerWeek: integer("max_contacts_per_week").notNull().default(3),
    minHoursBetweenContacts: integer("min_hours_between_contacts").notNull().default(36),
    allowWhatsapp: boolean("allow_whatsapp").notNull().default(true),
    allowSms: boolean("allow_sms").notNull().default(true),
    allowEmail: boolean("allow_email").notNull().default(true),
    allowVoice: boolean("allow_voice").notNull().default(true),
    voiceMinBalanceCents: integer("voice_min_balance_cents").notNull().default(500000),
    escalateAboveCents: integer("escalate_above_cents").notNull().default(2500000),
    escalateAfterDays: integer("escalate_after_days").notNull().default(75),
    autoNegotiate: boolean("auto_negotiate").notNull().default(true),
    maxInstalments: integer("max_instalments").notNull().default(4),
    minDepositPct: integer("min_deposit_pct").notNull().default(20),
    maxDiscountPct: integer("max_discount_pct").notNull().default(0),
    legalActionRequiresHuman: boolean("legal_action_requires_human").notNull().default(true),
    tone: text("tone").notNull().default("warm-professional"),
    signature: text("signature").notNull().default("The Accounts Team"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("policies_org_uidx").on(table.orgId)],
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email"),
    mobile: text("mobile"),
    language: text("language").notNull().default("en"), // en | af | zu
    customerType: text("customer_type").notNull().default("b2b"), // b2b | b2c
    // school | clinic | rental | subscription | services | retail
    vertical: text("vertical").notNull().default("services"),
    relationshipMonths: integer("relationship_months").notNull().default(12),
    onTimePayments: integer("on_time_payments").notNull().default(0),
    latePayments: integer("late_payments").notNull().default(0),
    brokenPromises: integer("broken_promises").notNull().default(0),
    lifetimeValueCents: integer("lifetime_value_cents").notNull().default(0),
    preferredChannel: text("preferred_channel").notNull().default("whatsapp"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("customers_org_idx").on(table.orgId), index("customers_org_name_idx").on(table.orgId, table.name)],
);

/** Per-channel consent ledger (POPIA-style opt-in / opt-out record). */
export const consents = pgTable(
  "consents",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // whatsapp | sms | email | voice
    status: text("status").notNull().default("granted"), // granted | denied | revoked
    source: text("source").notNull().default("signup"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("consents_customer_channel_uidx").on(table.customerId, table.channel),
    index("consents_customer_status_idx").on(table.customerId, table.status),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    description: text("description").notNull(),
    // invoice | subscription | school_fee | rental | clinic | quote | checkout | dormant
    category: text("category").notNull().default("invoice"),
    amountCents: integer("amount_cents").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("open"), // open | overdue | partially_paid | paid | disputed | written_off
    failureReason: text("failure_reason"), // for subscription / checkout failures
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_org_number_uidx").on(table.orgId, table.number),
    index("invoices_org_status_due_idx").on(table.orgId, table.status, table.dueAt),
    index("invoices_customer_idx").on(table.customerId),
  ],
);

/** The unit of work the AI agent manages. */
export const recoveryCases = pgTable(
  "recovery_cases",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    playbookKey: text("playbook_key").notNull().default("standard_invoice"),
    // queued | engaging | promise_to_pay | arrangement | disputed | escalated | recovered | paused | closed
    status: text("status").notNull().default("queued"),
    stepIndex: integer("step_index").notNull().default(0),
    propensity: integer("propensity").notNull().default(50), // 0-100 likelihood to pay
    priority: integer("priority").notNull().default(50), // 0-100 work ranking
    riskTier: text("risk_tier").notNull().default("medium"), // low | medium | high | critical
    segment: text("segment").notNull().default("Early / standard"),
    nextAction: text("next_action"),
    nextChannel: text("next_channel"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    contactsThisWeek: integer("contacts_this_week").notNull().default(0),
    promisedAmountCents: integer("promised_amount_cents"),
    promisedAt: timestamp("promised_at", { withTimezone: true }),
    recoveredCents: integer("recovered_cents").notNull().default(0),
    aiSummary: text("ai_summary"),
    aiRationale: jsonb("ai_rationale").$type<string[]>(),
    holdReason: text("hold_reason"),
    assignedTo: text("assigned_to"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recovery_cases_invoice_uidx").on(table.invoiceId),
    index("recovery_cases_queue_idx").on(table.orgId, table.status, table.nextActionAt, table.priority),
    index("recovery_cases_customer_idx").on(table.customerId),
    index("recovery_cases_assignee_status_idx").on(table.assignedTo, table.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => recoveryCases.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    externalId: text("external_id"), // provider message id; unique when present
    direction: text("direction").notNull(), // outbound | inbound
    channel: text("channel").notNull(), // whatsapp | sms | email | voice
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status").notNull().default("sent"), // queued | sent | delivered | read | failed
    intent: text("intent"), // inbound classification
    sentiment: text("sentiment"),
    tone: text("tone"),
    generatedBy: text("generated_by").notNull().default("ai"), // ai | staff | customer | system
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_external_id_uidx").on(table.externalId),
    index("messages_case_created_idx").on(table.caseId, table.createdAt),
    index("messages_customer_direction_idx").on(table.customerId, table.direction),
    index("messages_direction_created_idx").on(table.direction, table.createdAt),
  ],
);

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => recoveryCases.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull().default("payshap"), // payshap | card_link | eft | debicheck
    reference: text("reference").notNull(),
    token: text("token").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | expired | cancelled
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_requests_token_uidx").on(table.token),
    index("payment_requests_case_status_idx").on(table.caseId, table.status),
    index("payment_requests_invoice_status_idx").on(table.invoiceId, table.status),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: integer("case_id").references(() => recoveryCases.id, { onDelete: "set null" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    providerEventId: text("provider_event_id"),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull().default("payshap"),
    reference: text("reference").notNull(),
    attributedTo: text("attributed_to").notNull().default("ai"), // ai | staff | organic
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payments_provider_event_uidx").on(table.providerEventId),
    index("payments_org_paid_idx").on(table.orgId, table.paidAt),
    index("payments_invoice_idx").on(table.invoiceId),
    index("payments_case_idx").on(table.caseId),
  ],
);

export const arrangements = pgTable(
  "arrangements",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => recoveryCases.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    totalCents: integer("total_cents").notNull(),
    depositCents: integer("deposit_cents").notNull().default(0),
    instalments: integer("instalments").notNull().default(3),
    instalmentCents: integer("instalment_cents").notNull(),
    cadence: text("cadence").notNull().default("monthly"), // weekly | biweekly | monthly
    firstDueAt: timestamp("first_due_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("proposed"), // proposed | active | completed | defaulted | declined
    approvedBy: text("approved_by").notNull().default("ai"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("arrangements_case_status_idx").on(table.caseId, table.status)],
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: integer("case_id").references(() => recoveryCases.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // score | message | payment | arrangement | dispute | escalation | consent | policy | system
    title: text("title").notNull(),
    detail: text("detail"),
    actor: text("actor").notNull().default("ai"), // ai | staff | customer | system
    amountCents: integer("amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activities_org_created_idx").on(table.orgId, table.createdAt), index("activities_case_created_idx").on(table.caseId, table.createdAt)],
);

export const playbooks = pgTable(
  "playbooks",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("invoice"),
    active: boolean("active").notNull().default(true),
    steps: jsonb("steps")
      .$type<
        {
          dayOffset: number;
          channel: string;
          goal: string;
          tone: string;
        }[]
      >()
      .notNull(),
    recoveredCents: integer("recovered_cents").notNull().default(0),
    touches: integer("touches").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("playbooks_org_key_uidx").on(table.orgId, table.key), index("playbooks_org_active_idx").on(table.orgId, table.active)],
);
