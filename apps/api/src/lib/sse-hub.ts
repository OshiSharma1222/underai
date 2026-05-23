import { Response } from "express";

type Client = { res: Response; lastEventId: number };

const jobClients = new Map<string, Set<Client>>();
let eventCounter = 0;

export function subscribeToJob(jobId: string, res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client: Client = { res, lastEventId: 0 };
  if (!jobClients.has(jobId)) {
    jobClients.set(jobId, new Set());
  }
  jobClients.get(jobId)!.add(client);

  res.write(`: connected\n\n`);

  return () => {
    jobClients.get(jobId)?.delete(client);
    if (jobClients.get(jobId)?.size === 0) {
      jobClients.delete(jobId);
    }
  };
}

export function publishJobEvent(
  jobId: string,
  eventType: string,
  data: Record<string, unknown>
) {
  const clients = jobClients.get(jobId);
  if (!clients?.size) return;

  eventCounter += 1;
  const id = eventCounter;
  const payload = `id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    client.res.write(payload);
    client.lastEventId = id;
  }
}
