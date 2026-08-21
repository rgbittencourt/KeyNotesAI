import { accessError, getRawDb, requireAdmin } from "../../../server-access";
import { trashDriveFolders } from "../../../google-drive";

export const runtime = "edge";

export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { meetingId?: number | string };
    const meetingId = String(body.meetingId || "").trim();
    if (!meetingId)
      return Response.json({ error: "Reunião não informada." }, { status: 400 });

    const db = await getRawDb();
    const rows = await db
      .prepare(
        "SELECT DISTINCT folder_id FROM drive_exports WHERE email=? AND local_meeting_id=?",
      )
      .bind(admin.email, meetingId)
      .all<{ folder_id: string }>();
    const folderIds = (rows.results || []).map((row) => row.folder_id);

    if (folderIds.length) await trashDriveFolders(folderIds);
    await db
      .prepare("DELETE FROM drive_exports WHERE email=? AND local_meeting_id=?")
      .bind(admin.email, meetingId)
      .run();

    return Response.json({ deleted: true, trashedFolders: folderIds.length });
  } catch (error) {
    if (error instanceof Response) return accessError(error);
    console.error("Meeting deletion failed", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível excluir a reunião por completo.",
      },
      { status: 502 },
    );
  }
}
