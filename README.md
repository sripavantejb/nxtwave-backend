# SmartQuiz Backend (MVC, MongoDB)

## Setup
1. Create an `.env` file in `backend/` with:
```
MONGO_URI="mongodb+srv://myselfyourstej_db_user:nxtwave@cluster0.lfxust4.mongodb.net/?appName=Cluster0"
DB_NAME="smartquiz"
# Optional: Google Sheet URL (or direct CSV export URL)
SHEET_URL="https://docs.google.com/spreadsheets/d/140YjTTysxhs98iVneY1JLt6bG0XJ2djMGNQAJi5I_XM/edit?gid=1088068260#gid=1088068260"
```
If you cannot see `.env`, copy `env.sample` to `.env` and edit values.

2. Install dependencies:
```
npm install
```

## Run
```
npm run dev
```
Server starts after DB connection and exposes:
- GET `/api/health`
- GET `/api/topics`
- GET `/api/quiz?topicId=<id>&rating=3`

## Seed Data
- From local JSON and Google Sheet:
```
npm run seed
```
- Only local JSON:
```
npm run seed:json
```
- Only Google Sheet:
```
npm run seed:sheets
```

The seeder will:
- Upsert `topics` and `questions` from `data/questions.json`
- If `SHEET_URL` is set, download CSV from Google Sheets and upsert additional rows


