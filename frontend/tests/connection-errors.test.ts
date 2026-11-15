import test from "node:test";
import assert from "node:assert/strict";
import { connectionErrorMessage } from "../src/domains/accounts/connection-errors.ts";

test("Instagram failure explains the requirement when the provider has no message", () => {
  const message = connectionErrorMessage(new URLSearchParams({error: "personal_account_not_supported"}));
  assert.match(message, /Business or Creator/);
});

test("provider failure retains its explanation and support reference", () => {
  const message = connectionErrorMessage(new URLSearchParams({error: "oauth_denied", error_message: "Permission was declined.", request_id: "req-42", stage: "authorize"}));
  assert.match(message, /Permission was declined/);
  assert.match(message, /req-42/);
  assert.match(message, /authorize/);
});

test("unknown errors remain actionable rather than blank", () => {
  assert.match(connectionErrorMessage(new URLSearchParams({error: "new_provider_error", error_message: " "})), /Retry/);
});
