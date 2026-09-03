import { serializePostsCsv } from "@/lib/csv.ts";
import { listPostsForExport } from "@/lib/queries.ts";

export const dynamic = "force-dynamic";

/**
 * Every post and every snapshot as CSV — the full contents of the database in a
 * form you can open in a spreadsheet and read straight back in.
 */
export async function GET() {
  const csv = serializePostsCsv(await listPostsForExport());
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="moss-posts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
