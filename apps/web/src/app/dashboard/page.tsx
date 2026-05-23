"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  LogOut,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";
import {
  clearToken,
  createSession,
  getJob,
  getSession,
  getToken,
  startComparison,
  uploadPolicies,
  uploadReference,
  retryReferenceExtract,
  type JobDetails,
  type Mismatch,
} from "@/lib/api";
import { SlipVsPolicyCard } from "@/components/SlipVsPolicyCard";

export default function DashboardPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const [referenceVersion, setReferenceVersion] = useState<number | null>(null);
  const [referenceExtracted, setReferenceExtracted] = useState(false);
  const [documents, setDocuments] = useState<
    Array<{ id: string; fileName: string; status: string }>
  >([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, failed: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const refreshSession = useCallback(async (id: string) => {
    const data = await getSession(id);
    setReferenceName(data.reference?.fileName ?? null);
    setReferenceVersion(data.reference?.version ?? null);
    setReferenceExtracted(data.reference?.extracted ?? false);
    setDocuments(data.documents);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    (async () => {
      try {
        const stored = sessionStorage.getItem("underai_session_id");
        if (stored) {
          setSessionId(stored);
          await refreshSession(stored);
          return;
        }
        const { session } = await createSession("Policy audit");
        sessionStorage.setItem("underai_session_id", session.id);
        setSessionId(session.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to init session");
      }
    })();
  }, [router, refreshSession]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function connectSSE(id: string) {
    eventSourceRef.current?.close();
    const token = getToken();
    if (!token) return;

    const es = new EventSource(
      `/api/jobs/${id}/events?token=${encodeURIComponent(token)}`
    );
    eventSourceRef.current = es;

    es.addEventListener("job.started", () => {
      setStatusMessage("Job started…");
    });

    es.addEventListener("job.progress", (e) => {
      const data = JSON.parse(e.data);
      if (data.progress) setProgress(data.progress);
      setStatusMessage(
        `Processing ${data.progress?.completed ?? 0} of ${data.progress?.total ?? 0}…`
      );
    });

    es.addEventListener("item.progress", (e) => {
      const data = JSON.parse(e.data);
      setStatusMessage(`${data.fileName}: ${data.status}…`);
    });

    es.addEventListener("item.completed", async () => {
      const details = await getJob(id);
      setJobDetails(details);
      if (details.job.progress) setProgress(details.job.progress);
    });

    es.addEventListener("job.completed", async (e) => {
      const data = JSON.parse(e.data);
      setStatusMessage(`Audit complete (${data.status})`);
      const details = await getJob(id);
      setJobDetails(details);
      if (details.job.progress) setProgress(details.job.progress);
      es.close();
    });

    es.onerror = () => {
      setStatusMessage("Connection lost — polling results…");
      es.close();
    };
  }

  async function handleReferenceUpload(file: File) {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    setStatusMessage("Uploading and extracting placement slip…");
    try {
      await uploadReference(sessionId, file);
      await refreshSession(sessionId);
      setStatusMessage("Placement slip extracted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryExtract() {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    setStatusMessage("Re-running AI extraction…");
    try {
      await retryReferenceExtract(sessionId);
      await refreshSession(sessionId);
      setStatusMessage("Placement slip extracted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  }

  async function handlePolicyUpload(files: FileList | null) {
    if (!sessionId || !files?.length) return;
    setLoading(true);
    setError("");
    try {
      await uploadPolicies(sessionId, Array.from(files));
      await refreshSession(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    if (!sessionId || documents.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const ids = documents.map((d) => d.id);
      const key = `compare-${ids.sort().join("-")}`;
      const { jobId: newJobId } = await startComparison(sessionId, ids, key);
      setJobId(newJobId);
      setProgress({ total: ids.length, completed: 0, failed: 0 });
      setStatusMessage("Starting policy audit…");
      connectSSE(newJobId);
      const details = await getJob(newJobId);
      setJobDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    sessionStorage.removeItem("underai_session_id");
    router.push("/login");
  }

  const docNameMap = new Map(
    jobDetails?.documents.map((d) => [d.id, d.fileName]) ?? []
  );

  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <header className="sticky top-0 z-40 bg-[#F5F5F0]/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-gray-900">UnderAI</span>
            <span className="text-gray-400 mx-2">·</span>
            <span className="text-sm text-indigo-600 font-medium">
              Policy Audit
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-semibold text-gray-900 tracking-tight">
            Compare placement slip to{" "}
            <span className="text-indigo-600">issued policies</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload documents, run an AI audit, and see mismatches in real time.
          </p>
        </div>

        {error && (
          <p className="text-center text-sm text-rose-600 bg-rose-50 rounded-xl py-3 px-4 border border-rose-100">
            {error}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <UploadCard
            title="Placement slip"
            description="Reference terms (PDF)"
            icon={<FileText className="w-5 h-5 text-indigo-400" />}
            accept=".pdf"
            onFile={(f) => handleReferenceUpload(f)}
            uploaded={referenceName}
            meta={
              referenceVersion
                ? `Version ${referenceVersion}${referenceExtracted ? " · Extracted" : " · Extraction pending"}`
                : undefined
            }
            warning={
              referenceName && !referenceExtracted
                ? "AI extraction failed or incomplete. Re-upload the slip or click Retry extraction below."
                : undefined
            }
          />
          <UploadCard
            title="Issued policies"
            description="One or more policy PDFs"
            icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
            accept=".pdf"
            multiple
            onFiles={handlePolicyUpload}
            uploaded={
              documents.length
                ? `${documents.length} file(s) uploaded`
                : null
            }
          />
        </div>

        {referenceName && !referenceExtracted && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleRetryExtract}
              disabled={loading}
              className="px-6 py-3 border border-indigo-300 text-indigo-700 font-semibold rounded-xl hover:bg-indigo-50 disabled:opacity-50"
            >
              Retry extraction
            </button>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleCompare}
            disabled={
              loading ||
              !referenceName ||
              !referenceExtracted ||
              documents.length === 0
            }
            className="px-8 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Run policy audit
          </button>
        </div>

        {(jobId || statusMessage) && (
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {jobId && progress.completed < progress.total && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                )}
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              <span className="text-sm font-medium text-indigo-600">
                {statusMessage || "Waiting…"}
              </span>
            </div>
            {progress.total > 0 && (
              <>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Progress</span>
                  <span>
                    {progress.completed + progress.failed} / {progress.total}
                    {progress.failed > 0 && ` (${progress.failed} failed)`}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${((progress.completed + progress.failed) / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
            {jobDetails?.job && (
              <div className="text-xs text-gray-500 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <span>Job: {jobDetails.job.id.slice(0, 8)}…</span>
                <span>Status: {jobDetails.job.status}</span>
                <span>
                  Started:{" "}
                  {jobDetails.job.startedAt
                    ? new Date(jobDetails.job.startedAt).toLocaleString()
                    : "—"}
                </span>
                <span>
                  Completed:{" "}
                  {jobDetails.job.completedAt
                    ? new Date(jobDetails.job.completedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
            )}
          </div>
        )}

        {jobDetails?.items && jobDetails.items.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-gray-900">Results</h2>
            {jobDetails.items.map((item) => {
              const fileName =
                docNameMap.get(item.documentId) ?? "Policy document";
              const mismatches =
                (item.mismatches?.mismatches as Mismatch[] | undefined) ?? [];
              const material = mismatches.filter(
                (m) => m.severity === "critical" || m.severity === "warning"
              );
              const notes = mismatches.filter((m) => m.severity === "info");
              const matchScore = item.mismatches?.matchScore;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {fileName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {item.mismatches?.summary ?? item.errorMessage ?? item.status}
                        {matchScore != null && (
                          <span className="text-indigo-600 font-medium">
                            {" "}
                            · {matchScore}% match
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  {item.status === "completed" && material.length === 0 && (
                    <p className="text-emerald-600 text-sm font-medium">
                      {notes.length > 0
                        ? "No material mismatches — policy aligns with the placement slip."
                        : "No mismatches — policy aligns with placement slip."}
                    </p>
                  )}

                  {material.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-gray-700">
                        Material mismatches ({material.length})
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {material.map((m, i) => (
                          <SlipVsPolicyCard
                            key={`${m.field}-${i}`}
                            mismatch={m}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {notes.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-gray-500">
                        Minor differences ({notes.length}) — review optional
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        {notes.map((m, i) => (
                          <SlipVsPolicyCard
                            key={`note-${m.field}-${i}`}
                            mismatch={m}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {item.status === "failed" && (
                    <p className="text-rose-600 text-sm">{item.errorMessage}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function UploadCard({
  title,
  description,
  icon,
  accept,
  multiple,
  onFile,
  onFiles,
  uploaded,
  meta,
  warning,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  accept: string;
  multiple?: boolean;
  onFile?: (f: File) => void;
  onFiles?: (files: FileList | null) => void;
  uploaded: string | null;
  meta?: string;
  warning?: string;
}) {
  return (
    <label className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer block">
      <div className="h-40 mb-6 bg-gray-50 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 hover:border-indigo-300 transition-colors">
        <Upload className="w-8 h-8 text-gray-300" />
        <span className="text-sm text-gray-500">Drop PDF or click to upload</span>
      </div>
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <p className="text-gray-600 text-sm mt-1">{description}</p>
          {uploaded && (
            <p className="text-indigo-600 text-sm mt-2 font-medium">{uploaded}</p>
          )}
          {meta && <p className="text-xs text-gray-400 mt-1">{meta}</p>}
          {warning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">
              {warning}
            </p>
          )}
        </div>
      </div>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          if (multiple) onFiles?.(e.target.files);
          else if (e.target.files?.[0]) onFile?.(e.target.files[0]);
        }}
      />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
    pending: "bg-gray-100 text-gray-600",
    extracting: "bg-indigo-100 text-indigo-700",
    comparing: "bg-cyan-100 text-cyan-700",
  };
  return (
    <span
      className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  );
}
