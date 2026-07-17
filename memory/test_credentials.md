# Test Credentials – Diet Planner AI

## Admin
- Email: `admin@dietai.com`
- Password: `admin123`
- Role: `admin`

## Test User (create via /api/auth/register)
- Email: `testuser@dietai.com`
- Password: `Test@1234`

## Auth Endpoints
- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/auth/me`

## Token Storage
- httpOnly cookies: `access_token`, `refresh_token`
- Also returns `token` in response body (for Bearer auth fallback)
