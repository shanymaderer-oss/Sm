// Security rules tests: run with `npm run test:rules` (needs the Firestore emulator, which GitHub Actions downloads).
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, deleteField } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-masa", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const trip = (owner, extra = {}) => ({ owner, members: [owner], names: { [owner]: "Owner" }, data: "{}", fam: {}, updatedAt: serverTimestamp(), v: 1, ...extra });
async function seedTrip(id = "T1", owner = "alice", members = [owner]) {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), "trips", id), { owner, members, names: Object.fromEntries(members.map(m => [m, m])), data: "{}", fam: {}, updatedAt: new Date(), v: 1 });
  });
}
async function seedInvite(code, tripId = "T1", owner = "alice") {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "invites", code), { tripId, owner, createdAt: new Date() }); });
}
const CODE = "abcdefghijklmnopqrstuvwx";

// ---------- profiles ----------
test("a profile is private to its owner", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "users", "alice"), { name: "Alice", updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db("alice"), "users", "alice")));
  await assertFails(getDoc(doc(db("bob"), "users", "alice")));
  await assertFails(setDoc(doc(db("bob"), "users", "alice"), { name: "Hacked", updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(db(null), "users", "alice")));
});
test("a profile keeps its shape", async () => {
  await assertFails(setDoc(doc(db("alice"), "users", "alice"), { name: "Alice", admin: true, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("alice"), "users", "alice"), { name: "x".repeat(81), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("alice"), "users", "alice"), { name: "Alice", prefs: "x".repeat(4001), updatedAt: serverTimestamp() }));
});
test("nobody can list profiles", async () => {
  await assertFails(getDocs(collection(db("alice"), "users")));
});

// ---------- trips ----------
test("create a trip only as its owner and only member", async () => {
  await assertSucceeds(setDoc(doc(db("alice"), "trips", "T1"), trip("alice")));
  await assertFails(setDoc(doc(db("alice"), "trips", "T2"), trip("bob")));
  await assertFails(setDoc(doc(db("alice"), "trips", "T3"), trip("alice", { members: ["alice", "bob"] })));
  await assertFails(setDoc(doc(db("alice"), "trips", "T4"), trip("alice", { secret: 1 })));
  await assertFails(setDoc(doc(db("alice"), "trips", "T5"), trip("alice", { data: "x".repeat(400001) })));
  await assertFails(setDoc(doc(db(null), "trips", "T6"), trip("alice")));
});
test("only members read a trip, and only their own trips can be listed", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  await seedTrip("T2", "carol");
  await assertSucceeds(getDoc(doc(db("bob"), "trips", "T1")));
  await assertFails(getDoc(doc(db("mallory"), "trips", "T1")));
  await assertSucceeds(getDocs(query(collection(db("bob"), "trips"), where("members", "array-contains", "bob"))));
  await assertFails(getDocs(collection(db("bob"), "trips")));
});
test("members edit the plan and their own notes only", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  const b = db("bob");
  await assertSucceeds(updateDoc(doc(b, "trips", "T1"), { data: "{\"x\":1}", "fam.bob": "{}", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b, "trips", "T1"), { "fam.alice": "{}", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b, "trips", "T1"), { "names.alice": "x", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b, "trips", "T1"), { owner: "bob", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b, "trips", "T1"), { members: arrayUnion("mallory"), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db("mallory"), "trips", "T1"), { data: "{}", updatedAt: serverTimestamp() }));
});
test("only the owner deletes a trip", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  await assertFails(deleteDoc(doc(db("bob"), "trips", "T1")));
  await assertSucceeds(deleteDoc(doc(db("alice"), "trips", "T1")));
});

// ---------- invites ----------
test("only the trip owner creates an invite", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  await assertSucceeds(setDoc(doc(db("alice"), "invites", CODE), { tripId: "T1", owner: "alice", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("bob"), "invites", CODE + "b"), { tripId: "T1", owner: "bob", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("alice"), "invites", "short"), { tripId: "T1", owner: "alice", createdAt: serverTimestamp() }));
});
test("an invite can be looked up by its code but not listed", async () => {
  await seedTrip(); await seedInvite(CODE);
  await assertSucceeds(getDoc(doc(db("bob"), "invites", CODE)));
  await assertFails(getDocs(collection(db("bob"), "invites")));
  await assertFails(getDoc(doc(db(null), "invites", CODE)));
});
test("join with a valid invite: add yourself and nothing else", async () => {
  await seedTrip(); await seedInvite(CODE);
  const b = db("bob");
  await assertSucceeds(updateDoc(doc(b, "trips", "T1"), { members: arrayUnion("bob"), "names.bob": "Bob", joinCode: CODE, updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(b, "trips", "T1")));
});
test("join fails without a real invite for this trip", async () => {
  await seedTrip("T1"); await seedTrip("T2", "carol"); await seedInvite(CODE, "T2", "carol");
  const m = db("mallory");
  await assertFails(updateDoc(doc(m, "trips", "T1"), { members: arrayUnion("mallory"), "names.mallory": "M", joinCode: "nonexistentcode123456789", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(m, "trips", "T1"), { members: arrayUnion("mallory"), "names.mallory": "M", joinCode: CODE, updatedAt: serverTimestamp() }));
});
test("a joiner cannot add others or change the plan while joining", async () => {
  await seedTrip(); await seedInvite(CODE);
  const b = db("bob");
  await assertFails(updateDoc(doc(b, "trips", "T1"), { members: arrayUnion("bob", "mallory"), "names.bob": "Bob", joinCode: CODE, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(b, "trips", "T1"), { members: arrayUnion("bob"), "names.bob": "Bob", joinCode: CODE, data: "{\"evil\":1}", updatedAt: serverTimestamp() }));
});

// ---------- leaving and removing ----------
test("a member leaves; the owner cannot leave (deletes instead)", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  await assertSucceeds(updateDoc(doc(db("bob"), "trips", "T1"), { members: arrayRemove("bob"), "names.bob": deleteField(), updatedAt: serverTimestamp() }));
  await seedTrip("T2", "alice", ["alice", "bob"]);
  await assertFails(updateDoc(doc(db("alice"), "trips", "T2"), { members: arrayRemove("alice"), updatedAt: serverTimestamp() }));
});
test("a member cannot remove someone else", async () => {
  await seedTrip("T1", "alice", ["alice", "bob", "carol"]);
  await assertFails(updateDoc(doc(db("bob"), "trips", "T1"), { members: arrayRemove("carol"), updatedAt: serverTimestamp() }));
});
test("the owner removes a member but never adds one", async () => {
  await seedTrip("T1", "alice", ["alice", "bob"]);
  await assertSucceeds(updateDoc(doc(db("alice"), "trips", "T1"), { members: arrayRemove("bob"), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db("alice"), "trips", "T1"), { members: arrayUnion("mallory"), updatedAt: serverTimestamp() }));
});

// ---------- feedback and anonymous counts ----------
test("anyone may send feedback, nobody may read or change it", async () => {
  await assertSucceeds(setDoc(doc(db(null), "feedback", "f1"), { text: "המפה לא נטענה", screen: "plan", city: "rome", at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db("alice"), "feedback", "f2"), { text: "תודה!", contact: "a@b.c", at: serverTimestamp() }));
  await assertFails(getDoc(doc(db("alice"), "feedback", "f1")));
  await assertFails(getDocs(collection(db("alice"), "feedback")));
  await assertFails(updateDoc(doc(db(null), "feedback", "f1"), { text: "changed" }));
  await assertFails(deleteDoc(doc(db("alice"), "feedback", "f1")));
  await assertFails(setDoc(doc(db(null), "feedback", "f3"), { text: "x".repeat(1501), at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(null), "feedback", "f4"), { text: "hi there", uid: "alice", at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(null), "feedback", "f5"), { text: "hi there", at: new Date(2020, 1, 1) }));
});
test("counts are anonymous, of known events only, and cannot be read", async () => {
  await assertSucceeds(setDoc(doc(db(null), "events", "e1"), { e: "build", city: "rome", n: 3, at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(null), "events", "e2"), { e: "build", city: "rome", uid: "alice", at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(null), "events", "e3"), { e: "anything", at: serverTimestamp() }));
  await assertFails(setDoc(doc(db(null), "events", "e4"), { e: "build", n: 9999, at: serverTimestamp() }));
  await assertFails(getDocs(collection(db("alice"), "events")));
});
test("feedback sent the way the site sends it (REST commit with a server time) is accepted", async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const body = id => JSON.stringify({ writes: [{ update: { name: `projects/demo-masa/databases/(default)/documents/feedback/${id}`, fields: { text: { stringValue: "בדיקה של שליחה" }, screen: { stringValue: "home" } } }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }] }] });
  const r = await fetch(`http://${host}/v1/projects/demo-masa/databases/(default)/documents:commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body("rest1") });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST feedback refused: ${r.status} ${t.slice(0, 300)}`);
});
