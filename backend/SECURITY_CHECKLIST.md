# Security Environment Checklist

Use this before deploying the backend to staging/production.

- Set a strong `JWT_SECRET` (long random value, never commit real value).
- Set `JWT_EXPIRES_IN` to an intentional duration (e.g. `7d`, `12h`).
- Configure SMTP credentials:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `EMAIL_FROM`
- Configure strict CORS origins:
  - `CORS_ALLOWED_ORIGINS` as a comma-separated allowlist
  - `CORS_ALLOW_CREDENTIALS` only if you truly need cookies/credentials
- Review and tune rate-limit values:
  - `RATE_LIMIT_AUTH_*`
  - `RATE_LIMIT_PASSWORD_RESET_*`
  - `RATE_LIMIT_BOOKING_PUBLIC_*`
  - `RATE_LIMIT_BOOKING_ACCOUNT_*`
  - `RATE_LIMIT_SUBSCRIPTION_*`
- Ensure `MONGO_URI` points to a secured database instance.
- Keep `.env` out of version control and rotate secrets when leaked.
