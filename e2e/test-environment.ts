// Browser setup, teardown and the API process must target the same local fixture
// database. Never inherit DATABASE_URL from the caller for destructive resets.
export const E2E_DATABASE_URL =
  "postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=e2e_test";

export const E2E_UPLOAD_DIR = "uploads_e2e";
