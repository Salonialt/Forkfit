# Diet Planner AI — PRD

## Original problem statement
AI-powered diet planner that creates personalized meal plans based on health profile, goals, dietary preferences. Features: profile, goals, AI food image recognition, BMR/TDEE calc, meal plan, nutrient tracking, AI chatbot coach, grocery list, weekly progress, smart recommendations.

## User choices (locked-in)
- LLM: **Claude Sonnet 4.5** via Emergent Universal Key
- Vision: **GPT-4o** via Emergent Universal Key
- Auth: **JWT-based email/password** (httpOnly cookies + Bearer fallback)
- Region: Global with regional options (Global, India, USA, Europe, East Asia, Middle East, Latin America)

## Architecture
- Backend: FastAPI + Motor/MongoDB, `/api` prefix
- Frontend: React 19 + react-router 7 + Tailwind + Shadcn primitives
- LLM: `emergentintegrations` with `LlmChat` for both Claude (text) and GPT-4o (vision)

## What's implemented (Feb 2026 – initial build)
- JWT auth: register / login / logout / me, bcrypt hashes, httpOnly cookies, admin seeded
- 4-step onboarding (age/gender/region → metrics/activity → diet/conditions/allergies/budget → goal)
- BMR (Mifflin–St Jeor), TDEE, calorie targeting, macro targets
- AI meal plan generation (Claude Sonnet 4.5) — structured JSON
- AI food image analysis (GPT-4o vision) with structured macros
- Food + water logging, today's totals, delete entries
- AI chatbot nutrition coach with persistent history
- Grocery list auto-generated from latest meal plan
- Smart recommendations (rule-based on logged totals vs targets)
- Dashboard with macro rings, hydration tracker, recommendations, food diary, plan preview

## Personas
- Health-conscious adults wanting personalized nutrition guidance
- People with medical conditions (diabetes, PCOS, hypertension) needing safe diet planning
- Fitness enthusiasts tracking macros & meal prep

## Backlog (P1 — phase 2)
- Weekly progress charts (weight, calories, macros over time) using Recharts
- Voice food logging (Whisper)
- Barcode scanner (open food facts)
- Wearables sync (Apple Health / Google Fit)
- Restaurant menu estimator
- RAG-based nutrition knowledge base
- Streaming chat responses (SSE)
- Profile edit page + measurement log

## Admin
- admin@dietai.com / admin123 (see `/app/memory/test_credentials.md`)