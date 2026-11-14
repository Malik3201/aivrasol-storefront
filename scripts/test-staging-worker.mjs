import crypto from "node:crypto";

const secret = "aivrasol-storefront-dev-admin-secret-2026";
const workerUrl = "https://aivrasol-storefront-staging.aivrasol-storefront.workers.dev";

const payload = {
  t: "super_admin",
  id: "super_admin_test",
  em: "admin@aivrasol.com",
  ph: null,
  exp: Math.floor(Date.now() / 1000) + 300,
};

const bodyB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
const sig = crypto.createHmac("sha256", secret).update(bodyB64).digest("hex");
const token = `sfm1.${bodyB64}.${sig}`;

console.log("Testing GET /api/v1/manage/central-library/overview...");
const res = await fetch(`${workerUrl}/api/v1/manage/central-library/overview`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

console.log("HTTP Status:", res.status);
const data = await res.json();
console.log("Response:", JSON.stringify(data, null, 2));

