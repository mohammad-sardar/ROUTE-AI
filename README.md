# ROUTE-AI

AI-powered data cleaning platform for automated preprocessing, profiling, cleaning, and export workflows.

## Project structure

- `backend/`: FastAPI + pandas + scikit-learn services
- `frontend/`: React + Vite dashboard

## Backend

```bash
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Single-app local run

Setup first:

```powershell
cd "C:\Users\pvp_pc\OneDrive\سطح المكتب\ROUTE AI"
.\Setup-App.ps1
```

Build the frontend once, then run the backend which will serve the built UI and API together:

```powershell
cd "C:\Users\pvp_pc\OneDrive\سطح المكتب\ROUTE AI"
.\Start-App.ps1 -BuildFrontend
```

After that, open:

```text
http://127.0.0.1:8000
```

For later runs, if you did not change the frontend and only want to start the app again:

```powershell
.\Start-App.ps1
```

## Current scope

- CSV / Excel upload
- Automatic profiling
- Smart alerts and suggestions
- Auto clean pipeline
- Manual actions payload contract
- Before / after preview
- Export-ready response contracts
