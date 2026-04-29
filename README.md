# Appointly

A modern multi-tenant booking platform where businesses manage services, staff, and schedules, while customers discover businesses and book appointments online.

Built as a full-stack app with a React + Vite frontend and an Express + MongoDB backend.

## Highlights

- Multi-tenant workspace model (one account can manage multiple businesses)
- Role-based dashboards (`tenant`, `staff`, `customer`, `admin`)
- Public business pages and online booking flow
- Staff/service availability and slot-based scheduling
- Reviews, ratings, customer insights, and analytics
- Subscription plans with feature gating (including Enterprise-only webhooks)

## Core Features

### Frontend

- Authentication flows (sign up, sign in, forgot/reset password)
- Theme support (light/dark mode)
- Role-aware dashboard navigation and route protection
- Workspace picker for multi-business owners
- Business onboarding and management tools
- Booking management views:
  - Active bookings
  - Completed
  - Cancelled
  - No-shows
- Calendar and closing-days management
- Email integration settings (SMTP/provider setup flow)
- Coupon management (plan-gated)
- Smart staff ranking module (plan-gated)
- Webhooks dashboard and delivery testing (Enterprise-gated)
- Staff utilization insights and KPI cards
- Reviews pages with rating filters
- Customer pages:
  - My bookings
  - My reviews
  - Spending by business
  - Profile
- Admin pages:
  - Business approvals
  - Admin users
  - Newsletter subscribers
  - Contact messages
- Upgrade-gated features with redirect-to-pricing flow

### Backend

- REST API with Express
- MongoDB data layer with Mongoose
- JWT-based auth and role authorization
- Plan/feature enforcement at API level
- Webhooks management (Enterprise plan)
- Coupons and smart-ranking feature enforcement by subscription plan
- Email integration endpoints and mailer workflow support
- Booking and dashboard KPI endpoints
- Security middleware:
  - `helmet`
  - `cors`
  - `express-rate-limit`
- Health endpoint (`/api/health`)
- Basic automated health test

## Roles & Access Model

- **Tenant**: full business workspace controls (services, staff, bookings, customers, reviews, analytics, settings)
- **Staff**: operational dashboard access for assigned workplace
- **Customer**: personal booking/review/account area
- **Admin**: platform moderation and management tools

## Tech Stack

- **Frontend**: React 19, Vite, React Router, React Icons, Bootstrap, Recharts, Leaflet
- **Backend**: Node.js, Express 5, MongoDB, Mongoose, JWT, Nodemailer
- **Tooling**: ESLint, Nodemon, Node test runner

## Project Structure

```text
appointly/
  frontend/   # React + Vite client app
  backend/    # Express API server
```

## Getting Started

## 1) Clone

```bash
git clone <your-repo-url>
cd appointly
```

## 2) Frontend setup

```bash
cd frontend
npm install
```

Create your env file:

```bash
cp .env.example .env
```

Run frontend dev server:

```bash
npm run dev
```

## 3) Backend setup

```bash
cd ../backend
npm install
```

Create your env file:

```bash
cp .env.example .env
```

Run backend dev server:

```bash
npm run dev
```

## Scripts

### Frontend (`frontend/package.json`)

- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint

### Backend (`backend/package.json`)

- `npm run dev` - start with Nodemon
- `npm run start` - start with Node
- `npm run lint` - syntax/lint checks
- `npm run test` - run backend tests
- `npm run test:health` - run health endpoint test

## Deployment Notes

- Frontend can be deployed to Vercel/Netlify
- Backend can be deployed to Render/Railway/Fly.io/other Node hosts
- Use MongoDB Atlas (or your own MongoDB instance)
- Set environment variables in your hosting provider
- Ensure CORS origin and API base URL are configured correctly

## Environment Variables

Use:

- `frontend/.env.example`
- `backend/.env.example`

as the source of truth for required variables.

Do **not** commit real `.env` files.

## Status

This project is actively developed and prepared for public release.

