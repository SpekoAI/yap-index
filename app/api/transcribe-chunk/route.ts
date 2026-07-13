import { handleTranscribeChunk } from "./handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleTranscribeChunk(request);
}
