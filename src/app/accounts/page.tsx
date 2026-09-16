import { AccountsTable } from "@/components/AccountsTable";
import { PageHeader, Stat } from "@/components/ui";
import { listCases } from "@/lib/data";
import { zar } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const rows = await listCases();
  const active = rows.filter((r) => !["recovered", "closed"].includes(r.status));
  const outstanding = active.reduce((s, r) => s + r.balanceCents, 0);
  const high = active.filter((r) => r.propensity >= 65).reduce((s, r) => s + r.balanceCents, 0);
  const aged = active.filter((r) => r.days > 60).reduce((s, r) => s + r.balanceCents, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Every account, scored and queued"
        description="Overdue accounts segmented by amount, age, likelihood of payment and history. Open one for the score breakdown, full conversation and the next actions."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open accounts" value={`${active.length}`} hint={`${rows.length - active.length} closed or recovered`} accent="sky" />
        <Stat label="Outstanding" value={zar(outstanding)} hint="Across all receivable types" accent="amber" />
        <Stat label="High propensity" value={zar(high)} hint="Score 65+ — self-cure likely" accent="emerald" />
        <Stat label="Aged 60+ days" value={zar(aged)} hint="Needs firmer treatment or a human" accent="rose" />
      </div>

      <AccountsTable rows={rows} />
    </div>
  );
}
