# Overview
This project is a calendar application for your phone. It is a Progressive Web App (PWA),
so it can be installed to the home screen from the browser and works offline.

## Features
- Day view with overlapping events shown side by side
- Create, edit and delete events
- Repeatable events (daily, weekly, monthly)
- Date picker in the header, and a button to jump back to today

## How data is stored
Events are saved on the user's device in the browser's IndexedDB database. There is no
server or account, and events do not sync between devices. Clearing the browser's site data
deletes them.

## Project layout
- `client/` — the app: React + TypeScript, built with Vite

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
