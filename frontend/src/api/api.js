/**
 * api.js — DuplexDash API Client
 * Falls back to realistic mock data when the backend is not reachable.
 */

// Empty string → requests go to Vite dev server (localhost:5173),
// which proxies /api/* to localhost:3000 server-side — no CORS.
const BASE_URL = '';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_JOBS_SEED = [
  {
    id: 1,
    filename: 'Invoice_March_2024.pdf',
    filepath: '/uploads/invoice.pdf',
    original_pages: 12,
    printed_pages: 12,
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: 2,
    filename: 'Thesis_Chapter3.pdf',
    filepath: '/uploads/thesis.pdf',
    original_pages: 48,
    printed_pages: 48,
    status: 'waiting_for_flip',
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 3,
    filename: 'Menu_Restaurant.pdf',
    filepath: '/uploads/menu.pdf',
    original_pages: 6,
    printed_pages: 6,
    status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
  },
];

const MOCK_STATS_SEED = {
  totalRevenueLKR: 14850,
  totalPagesPrinted: 1485,
  paperInventory: 312,
  inkLevel: 67.4,
  pricePerPageBWLKR: 10,
  pricePerPageColorLKR: 25,
};

// Mutable local state so mock actions are reflected immediately
let mockJobs = JSON.parse(JSON.stringify(MOCK_JOBS_SEED));
let mockStats = { ...MOCK_STATS_SEED };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tryFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─── Queue API ────────────────────────────────────────────────────────────────

export async function getQueue() {
  const data = await tryFetch(`${BASE_URL}/api/queue`);
  if (data) return data;
  return { success: true, jobs: mockJobs, _mock: true };
}

export async function triggerPrint(jobId) {
  const data = await tryFetch(`${BASE_URL}/api/print/${jobId}`, { method: 'POST' });
  if (data) return data;
  // Apply mock side effects
  const job = mockJobs.find((j) => j.id === jobId);
  if (job) {
    job.status = 'printed';
    mockStats.totalPagesPrinted += job.printed_pages;
    const price = job.color_mode === 'Color' ? mockStats.pricePerPageColorLKR : mockStats.pricePerPageBWLKR;
    mockStats.totalRevenueLKR += job.printed_pages * price;
    const sheetsUsed = Math.ceil(job.printed_pages / 2);
    mockStats.paperInventory = Math.max(0, mockStats.paperInventory - sheetsUsed);
    mockStats.inkLevel = Math.max(0, mockStats.inkLevel - job.printed_pages * 0.5);
  }
  return { success: true, message: `Job ${jobId} printed (mock).`, _mock: true };
}

// ─── Stats API ────────────────────────────────────────────────────────────────

export async function getStats() {
  const data = await tryFetch(`${BASE_URL}/api/stats`);
  if (data) return data;
  return { success: true, stats: mockStats, _mock: true };
}

// ─── Settings API ─────────────────────────────────────────────────────────────

export async function updateSettings(payload) {
  const data = await tryFetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data) return data;
  if (payload.paper_inventory !== undefined) mockStats.paperInventory = payload.paper_inventory;
  if (payload.ink_level !== undefined) mockStats.inkLevel = payload.ink_level;
  if (payload.lkr_price_per_page_bw !== undefined) mockStats.pricePerPageBWLKR = payload.lkr_price_per_page_bw;
  if (payload.lkr_price_per_page_color !== undefined) mockStats.pricePerPageColorLKR = payload.lkr_price_per_page_color;
  return { success: true, message: 'Settings updated (mock).', _mock: true };
}
