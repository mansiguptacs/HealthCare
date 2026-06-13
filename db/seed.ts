import { db } from "./client";
import {
  calls,
  clinics,
  ngos,
  patientNotes,
  recommendations,
  auditEvents,
  campRequests,
  waitlistEntries,
} from "./schema";

/**
 * Seed demo data: partner NGOs, a couple of existing clinics, and a set of
 * calls + waitlist entries clustered in under-served areas so the dashboard
 * has meaningful demand and clear camp targets.
 */
async function seed() {
  console.log("Clearing existing data...");
  await db.delete(recommendations);
  await db.delete(waitlistEntries);
  await db.delete(patientNotes);
  await db.delete(auditEvents);
  await db.delete(campRequests);
  await db.delete(calls);
  await db.delete(clinics);
  await db.delete(ngos);

  console.log("Inserting NGOs...");
  const ngoRows = await db
    .insert(ngos)
    .values([
      {
        name: "Asha Reproductive Health Trust",
        coverageRegions: ["Rampur District"],
        contactEmail: "ops@asha-trust.org",
      },
      {
        name: "Sehat Mobile Clinics",
        coverageRegions: ["Rampur District", "Kanha Block"],
        contactEmail: "deploy@sehat-mobile.org",
      },
    ])
    .returning();

  console.log("Inserting clinics...");
  await db.insert(clinics).values([
    {
      name: "Rampur District Hospital",
      type: "fixed",
      lat: 26.5,
      lng: 80.5,
      region: "Rampur Town",
      services: ["maternal_care", "general", "infection"],
      availability: "Open Mon-Sat, 9am-5pm",
      active: true,
    },
    {
      name: "Kanha Primary Health Centre",
      type: "fixed",
      lat: 26.62,
      lng: 80.42,
      region: "Kanha Block",
      services: ["general"],
      availability: "Open weekdays",
      active: true,
    },
  ]);

  console.log("Inserting demand (calls + waitlist) in under-served areas...");
  // Cluster A: north-east, high demand, far from clinics (uncovered).
  const clusterA = { lat: 26.88, lng: 80.97, region: "Bansa Village" };
  // Cluster B: south-west, medium demand (uncovered).
  const clusterB = { lat: 26.18, lng: 80.08, region: "Dhola Village" };

  const demand: Array<{
    cluster: { lat: number; lng: number; region: string };
    severity: string;
    category: string;
    complaint: string;
  }> = [
    { cluster: clusterA, severity: "high", category: "pregnancy", complaint: "pregnancy complications, swelling" },
    { cluster: clusterA, severity: "emergency", category: "pregnancy", complaint: "heavy bleeding" },
    { cluster: clusterA, severity: "medium", category: "reproductive_health", complaint: "persistent pain" },
    { cluster: clusterA, severity: "high", category: "infection", complaint: "fever and infection signs" },
    { cluster: clusterB, severity: "medium", category: "reproductive_health", complaint: "irregular cycles" },
    { cluster: clusterB, severity: "low", category: "general", complaint: "general weakness" },
  ];

  for (let i = 0; i < demand.length; i++) {
    const d = demand[i];
    const jitterLat = d.cluster.lat + (Math.random() - 0.5) * 0.04;
    const jitterLng = d.cluster.lng + (Math.random() - 0.5) * 0.04;
    const [call] = await db
      .insert(calls)
      .values({
        phonePartial: `*****${1000 + i}`,
        language: i % 2 === 0 ? "hi" : "bho",
        region: d.cluster.region,
        lat: jitterLat,
        lng: jitterLng,
        channel: "voice",
        status: "processed",
      })
      .returning();
    await db.insert(patientNotes).values({
      callId: call.id,
      problemCategory: d.category,
      summary: `Caller reported ${d.complaint}.`,
      severity: d.severity,
      structuredSymptoms: { main_complaint: d.complaint },
    });
    await db.insert(waitlistEntries).values({
      callId: call.id,
      region: d.cluster.region,
      lat: jitterLat,
      lng: jitterLng,
      problemCategory: d.category,
      severity: d.severity,
      phonePartial: `*****${1000 + i}`,
      consent: true,
      status: "waiting",
    });
  }

  console.log("Seed complete.");
  console.log(`NGOs: ${ngoRows.length}, demand entries: ${demand.length}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
