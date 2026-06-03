import { route } from "@/lib/api-route";
import { getSystemStats } from "@/lib/system-stats";

export const dynamic = "force-dynamic";

export const GET = route(async () => getSystemStats());
