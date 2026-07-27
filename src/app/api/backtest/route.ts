import { BacktestRequestSchema } from "@/lib/contracts";
import { MarketWindowError, runBacktestSuite } from "@/lib/engine";
import { MarketDataError } from "@/lib/market/yahoo";

export const runtime = "nodejs";
/** Every run depends on live upstream data, so nothing here may be prerendered. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = BacktestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await runBacktestSuite(parsed.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof MarketDataError || error instanceof MarketWindowError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("backtest failed", error);
    return Response.json({ error: "Backtest failed" }, { status: 500 });
  }
}
