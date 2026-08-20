import { health } from "@/server/api-entrypoints";

export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(await health(request));
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
