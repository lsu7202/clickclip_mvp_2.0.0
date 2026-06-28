// 인메모리 job map(§2.4). 프로세스 재시작 시 소실(MVP 허용).
import { v4 as uuid } from "uuid";

const jobs = new Map();

export function createJob(type) {
  const jobId = `vj_${uuid().slice(0, 8)}`;
  const job = { jobId, type, status: "pending", result: null, error: null };
  jobs.set(jobId, job);
  return job;
}

export function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch);
}

export function getJob(jobId) {
  return jobs.get(jobId) || null;
}
