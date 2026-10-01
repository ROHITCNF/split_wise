-- 0002: email verification removed for the MVP (REQUIREMENTS v1.3, FR-AUTH-01/03).
-- Accounts are verified at signup, so verification tokens are no longer stored.
DROP TABLE email_verification_tokens;
