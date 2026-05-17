import { getRiskOverview, getRiskEvents } from "@/lib/db";
import { RiskClient } from "./RiskClient";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export default function RiskPage() {
  const overview = getRiskOverview();
  const events = getRiskEvents(20);

  return (
    <RiskClient overview={overview} events={events} />
  );
}
