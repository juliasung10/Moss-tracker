import { SetupRequired } from "@/components/setup-required.tsx";
import { ConnectionFailed } from "@/components/setup-required.tsx";
import { databaseProblem, getDb } from "./db.ts";

/**
 * Called at the top of every page. Returns a screen to render instead of the page
 * when the database is unusable, or null when all is well.
 *
 * Both failure modes — nothing configured, and configured but unreachable — would
 * otherwise surface as a server-side exception, which a host reduces to a digest
 * number that tells you nothing about the cause or the fix.
 */
export async function requireDatabase(): Promise<React.ReactElement | null> {
  const problem = databaseProblem();
  if (problem) return <SetupRequired problem={problem} />;

  try {
    const db = await getDb();
    await db.query("SELECT 1");
    return null;
  } catch (error) {
    return <ConnectionFailed detail={describe(error)} />;
  }
}

/** The driver's message is the useful part; the stack is not, and may be noisy. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 400 ? `${message.slice(0, 400)}…` : message;
  }
  return String(error);
}
