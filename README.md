[![CI Pipeline](https://github.com/sims610/calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/sims610/calendar/actions/workflows/ci.yml)

# Overview
This project is a calendar application for your phone. It is a Progressive Web App (PWA),
so it can be installed to the home screen from the browser and works offline.

## Features
- Day view with overlapping events shown side by side
- Pinch the day to make hours shorter or taller; the size is remembered on the device
- Create, edit and delete events
- Repeatable events (daily, weekly, monthly). Changing, moving or deleting a repeat asks
  whether it's for only that day or that day and every later one; earlier days never change.
- Date picker in the header, and a button to jump back to today
- Event reminders (at the start, or 5, 15 or 30 minutes before), chosen in Settings. Only
  offered in the installed app. Reminders are timed on the device, so they show while the app
  is running or when it next wakes, but not while it's fully closed.

## How data is stored
Events are saved on the device in the browser's IndexedDB database, so the app works offline.
Signing in (on the Home tab) is optional:
- Signed out, events stay on that device only. Clearing the browser's site data deletes them.
- Signed in, events are also saved to the account on the server (`server/`, MySQL) and sync
  between devices in the background: on opening the app, after each change, and when the
  connection comes back. When the same event changes on two devices, the later change wins.
- Signing in on a device that has events from before offers to add them to the account. Signing
  out uploads any unsaved changes, then removes that account's events from the device.

The client finds the server through `VITE_API_URL`. CI sets it to the deployed server; when
it isn't set (`npm run dev`, or `npm run build` then `npm run preview`), the app uses the local
server at http://localhost:3000.

## Project layout
- `client/` — the app: React + TypeScript, built with Vite
- `server/` — the API: Express + TypeScript, backed by MySQL

## Running the server
Copy `server/.env.example` to `server/.env` and fill in your MySQL login. On startup the server
creates the database and its tables if they don't exist.
```
cd server
npm install
npm run dev
```
`GET /api/docs` lists every endpoint with an example.

## Getting started
```
npm install
npm run dev
```
Then open http://localhost:5173.

## Building for production
```
npm run build
```
The finished site is written to `client/dist/`. It is plain static files, so any static host
can serve it. The host must use HTTPS for the app to be installable.
