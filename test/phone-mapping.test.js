import test from "node:test";
import assert from "node:assert/strict";
import { contactProperties, normalizeCandidate } from "../src/clients.js";

test("maps mobile to WhatsApp and excludes work HQ from contact phone", () => {
  const candidate = normalizeCandidate({
    first_name: "Patsy",
    last_name: "Miss",
    email: "patsy@example.com",
    email_status: "verified",
    phone_numbers: [
      { type: "mobile", status: "valid_number", sanitized_number: "+529996058140" },
      { type: "work_hq", status: "no_status", sanitized_number: "+525552686600" }
    ],
    organization: { name: "Example", primary_domain: "example.com" }
  });
  const properties = contactProperties(candidate);
  assert.equal(properties.hs_whatsapp_phone_number, "+529996058140");
  assert.equal(properties.phone, undefined);
});

test("maps a direct phone to contact phone", () => {
  const properties = contactProperties({
    firstName: "Ana", lastName: "Diaz", email: "ana@example.com", title: "",
    company: { name: "Example" }, validPhones: [
      { type: "work_direct", sanitized_number: "+525511112222" }
    ]
  });
  assert.equal(properties.phone, "+525511112222");
});
