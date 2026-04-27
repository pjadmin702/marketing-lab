import { NextResponse } from "next/server";
import { getErrorMessage } from "./format-utils";

/** Read a JSON body, returning a NextResponse error on parse failure. */
export async function parseJsonBody<T>(req: Request): Promise<{ body: T } | { error: NextResponse }> {
  try {
    const body = (await req.json()) as T;
    return { body };
  } catch {
    return { error: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
}

/** Wrap a route handler so thrown errors become a 500 JSON envelope. */
export async function withRouteError<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
