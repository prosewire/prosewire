import { deliverMedia } from "@/server/media-delivery-entrypoint";

async function handle(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  return deliverMedia(request, key.join("/"));
}

export { handle as GET };
