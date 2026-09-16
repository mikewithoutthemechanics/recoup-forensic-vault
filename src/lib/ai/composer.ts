import { zar } from "@/lib/format";

export type ComposeInput = {
  orgName: string;
  contactName: string;
  customerName: string;
  invoiceNumber: string;
  category: string;
  balanceCents: number;
  daysOverdue: number;
  channel: string;
  strategy: string;
  goal: string;
  tone: string;
  language: string;
  signature: string;
  payLink?: string | null;
  payReference?: string | null;
  arrangement?: { instalments: number; instalmentCents: number; depositCents: number; cadence: string } | null;
  failureReason?: string | null;
};

export type ComposedMessage = {
  subject: string | null;
  body: string;
  tone: string;
  goal: string;
  channel: string;
};

const GREETING: Record<string, (name: string) => string> = {
  en: (n) => `Hi ${n},`,
  af: (n) => `Hallo ${n},`,
  zu: (n) => `Sawubona ${n},`,
};

const THANKS: Record<string, string> = {
  en: "Thank you",
  af: "Dankie",
  zu: "Ngiyabonga",
};

const OPT_OUT: Record<string, string> = {
  en: "Reply STOP to opt out.",
  af: "Antwoord STOP om te onttrek.",
  zu: "Phendula ngo-STOP ukuyeka.",
};

function firstName(contactName: string) {
  return contactName.split(" ")[0] ?? contactName;
}

function payLine(input: ComposeInput, lang: string) {
  if (!input.payLink) return null;
  const amount = zar(input.balanceCents);
  if (lang === "af") return `Betaal ${amount} in 20 sekondes met PayShap: ${input.payLink} (Verw ${input.payReference})`;
  if (lang === "zu") return `Khokha ${amount} ngo-PayShap ngemizuzwana engu-20: ${input.payLink} (Inkomba ${input.payReference})`;
  return `Pay ${amount} in 20 seconds with PayShap or card: ${input.payLink} (Ref ${input.payReference})`;
}

function bodyFor(input: ComposeInput): { subject: string | null; body: string } {
  const lang = ["en", "af", "zu"].includes(input.language) ? input.language : "en";
  const name = firstName(input.contactName);
  const hi = GREETING[lang](name);
  const amount = zar(input.balanceCents);
  const pay = payLine(input, lang);
  const short = input.channel === "sms" || input.channel === "whatsapp";
  const optOut = short ? OPT_OUT[lang] : "";

  const lines: string[] = [];
  let subject: string | null = null;

  switch (input.strategy) {
    case "gentle_nudge": {
      subject = `Quick reminder: invoice ${input.invoiceNumber} (${amount})`;
      if (lang === "af") {
        lines.push(hi, `Net 'n vriendelike herinnering dat faktuur ${input.invoiceNumber} van ${amount} ${input.daysOverdue} dae agterstallig is.`);
      } else if (lang === "zu") {
        lines.push(hi, `Sikukhumbuza kahle nje ngekhasi lenkokhelo ${input.invoiceNumber} elingu-${amount}, eselidlule izinsuku ezingu-${input.daysOverdue}.`);
      } else {
        lines.push(
          hi,
          input.daysOverdue <= 0
            ? `A friendly heads-up that invoice ${input.invoiceNumber} for ${amount} is due shortly.`
            : `Just a friendly reminder that invoice ${input.invoiceNumber} for ${amount} is ${input.daysOverdue} days past due.`,
        );
        lines.push("If it has already gone off, please ignore this message — otherwise here is the quickest way to settle:");
      }
      break;
    }
    case "payment_request": {
      subject = `Payment request: ${amount} outstanding on ${input.invoiceNumber}`;
      if (lang === "af") {
        lines.push(hi, `Faktuur ${input.invoiceNumber} van ${amount} is nou ${input.daysOverdue} dae agterstallig. Kan ons dit vandag afhandel?`);
      } else if (lang === "zu") {
        lines.push(hi, `I-invoyisi ${input.invoiceNumber} engu-${amount} isidlulelwe yizinsuku ezingu-${input.daysOverdue}. Singaqeda namuhla?`);
      } else {
        lines.push(
          hi,
          `Invoice ${input.invoiceNumber} for ${amount} is now ${input.daysOverdue} days overdue.`,
          "We would like to close this off today — it takes under a minute:",
        );
      }
      break;
    }
    case "arrangement_offer": {
      subject = `A flexible way to settle ${input.invoiceNumber}`;
      const arr = input.arrangement;
      lines.push(hi, `We understand cash flow can be tight. Invoice ${input.invoiceNumber} sits at ${amount} (${input.daysOverdue} days overdue).`);
      if (arr) {
        lines.push(
          `We can split it into ${arr.instalments} ${arr.cadence} payments of ${zar(arr.instalmentCents)}${
            arr.depositCents > 0 ? `, starting with ${zar(arr.depositCents)} today` : ""
          }. No interest, no fees.`,
          "Reply YES to lock that in, or tell us what you can manage and we will work with it.",
        );
      } else {
        lines.push("Tell us what you can manage this month and we will set up an arrangement that works.");
      }
      break;
    }
    case "arrangement_followup": {
      subject = `Your payment arrangement on ${input.invoiceNumber}`;
      const plan = input.arrangement;
      lines.push(
        hi,
        plan
          ? `Thank you for sticking to the arrangement on ${input.invoiceNumber}. Your next instalment of ${zar(plan.instalmentCents)} is due shortly — ${amount} remains on the account.`
          : `Checking in on the arrangement for ${input.invoiceNumber}. ${amount} remains on the account.`,
        "If anything has changed on your side, reply here and we will adjust the plan with you rather than escalate.",
      );
      break;
    }
    case "subscription_dunning": {
      subject = `Your payment didn't go through — quick fix`;
      lines.push(
        hi,
        `Your ${input.customerName} subscription payment of ${amount} was declined${
          input.failureReason ? ` (${input.failureReason})` : ""
        }.`,
        "Your account is still active — updating the card takes about 30 seconds and nothing else changes.",
      );
      break;
    }
    case "checkout_recovery": {
      subject = `You left ${amount} in your basket`;
      lines.push(
        hi,
        `You were one step away from checking out (${amount}). We have kept your basket open.`,
        "Pay with PayShap straight from your phone — no card details needed.",
      );
      break;
    }
    case "reactivation": {
      subject = `We have missed you at ${input.customerName}`;
      lines.push(
        hi,
        `It has been a while since your last order with ${input.orgName}.`,
        "We would love to have you back — reply and we will set up your next order with priority delivery.",
      );
      break;
    }
    case "quote_followup": {
      subject = `Still keen on quote ${input.invoiceNumber}?`;
      lines.push(
        hi,
        `Checking in on quote ${input.invoiceNumber} (${amount}) that we sent ${input.daysOverdue} days ago.`,
        "Happy to adjust scope or timing if that helps — just reply with what you need.",
      );
      break;
    }
    case "high_value_human":
    case "pre_legal_review": {
      subject = `Regarding account ${input.invoiceNumber}`;
      lines.push(
        hi,
        `${input.invoiceNumber} has an outstanding balance of ${amount}, now ${input.daysOverdue} days overdue.`,
        "One of our team would like to speak with you personally to agree a way forward before this goes any further. When is a good time to call?",
      );
      break;
    }
    default: {
      subject = `Outstanding balance on ${input.invoiceNumber}`;
      lines.push(hi, `Invoice ${input.invoiceNumber} has ${amount} outstanding.`);
    }
  }

  if (pay && input.strategy !== "reactivation" && input.strategy !== "quote_followup") {
    lines.push(pay);
  }
  if (input.strategy === "quote_followup" || input.strategy === "reactivation") {
    lines.push("Reply to this message and a human will come back to you.");
  }

  if (input.channel === "email") {
    lines.push(
      "",
      `If any part of this invoice is incorrect, reply to this email and we will place the account on hold while we investigate.`,
      "",
      `${THANKS[lang]},`,
      input.signature,
      input.orgName,
      "",
      "You are receiving this because you hold an account with us. Reply UNSUBSCRIBE to stop billing reminders by email.",
    );
  } else if (input.channel === "voice") {
    return {
      subject: `Voice call script — ${input.invoiceNumber}`,
      body: [
        `[AI voice agent — outbound call to ${input.contactName} at ${input.customerName}]`,
        "",
        `"Good day, may I speak to ${name}? This is an automated courtesy call from ${input.orgName} about account ${input.invoiceNumber}, which has ${amount} outstanding for ${input.daysOverdue} days."`,
        "",
        `"I can send you a PayShap payment request by WhatsApp right now, or arrange for a consultant to call you back. Press 1 for the payment link, press 2 to speak to a person, press 9 to stop these calls."`,
        "",
        "[If the customer disputes the amount or sounds distressed: stop the script, log a dispute and route to a human consultant.]",
        "[Call recorded and retained for 12 months. Caller ID displays the registered business number.]",
      ].join("\n"),
    };
  } else {
    lines.push("", `${THANKS[lang]}, ${input.signature} · ${input.orgName}`, optOut);
  }

  return { subject, body: lines.filter((l) => l !== undefined).join("\n").trim() };
}

export function composeMessage(input: ComposeInput): ComposedMessage {
  const { subject, body } = bodyFor(input);
  return {
    subject: input.channel === "email" ? subject : null,
    body,
    tone: input.tone,
    goal: input.goal,
    channel: input.channel,
  };
}
