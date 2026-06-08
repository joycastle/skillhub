ALTER TABLE user_account
    ADD COLUMN system_account BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE user_account
SET system_account = TRUE
WHERE id = 'builtin-skill-publisher'
  AND display_name = 'Built-in Skill Publisher'
  AND email IS NULL
  AND avatar_url IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM local_credential
      WHERE local_credential.user_id = user_account.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM identity_binding
      WHERE identity_binding.user_id = user_account.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM api_token
      WHERE api_token.user_id = user_account.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM user_role_binding
      WHERE user_role_binding.user_id = user_account.id
  )
  AND NOT EXISTS (
      SELECT 1
      FROM namespace_member
      WHERE namespace_member.user_id = user_account.id
  );
