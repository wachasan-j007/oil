// ============================================================
// OR Dashboard connection config for Docker/PostgreSQL
// Browser calls Nginx -> /api -> FastAPI -> PostgreSQL.
// No database password or Supabase key is stored in the browser.
// ============================================================
window.OR_APP_CONFIG = {
  apiBase: '/api'
};
