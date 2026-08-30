import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const ALLOWED_FILES = new Set(["icon.webp", "full.webp"]);
const ITEM_ID = /^[a-z0-9_]+$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string; file: string }> },
): Promise<NextResponse> {
  const { itemId, file } = await context.params;
  if (!ITEM_ID.test(itemId) || !ALLOWED_FILES.has(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = path.join(process.cwd(), "assets", "items", itemId, file);
  try {
    const body = await readFile(filePath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
