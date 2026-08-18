import { NextResponse } from "next/server";
import { z } from "zod";
import { schema } from "@prosewire/db";
import { db } from "@/lib/db";

const event = z.object({ postId: z.uuid(), referrer: z.string().max(1000).optional() });

export async function POST(request: Request) {
  const parsed = event.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  await db().insert(schema.postView).values({ postId: parsed.data.postId, referrer: parsed.data.referrer ?? null });
  return new Response(null, { status: 204 });
}
