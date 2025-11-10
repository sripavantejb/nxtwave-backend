# Flashcard Data Import Summary

## Import Date
November 10, 2025

## Data Source
Google Sheets: [FlashCard Questions](https://docs.google.com/spreadsheets/d/140YjTTysxhs98iVneY1JLt6bG0XJ2djMGNQAJi5I_XM/edit?usp=sharing)

## Data Structure

### Topics (2 total)
The data was consolidated into 2 main categories:

1. **SI and CI (si-ci)**
   - Description: Simple Interest and Compound Interest concepts combined
   - Covers: SI calculations, CI calculations, and differences between them
   - Questions: 9 (3 Easy, 3 Medium, 3 Hard)

2. **Profit & Loss (profit-loss)**
   - Description: CP, SP, MP, Profit, Loss calculations
   - Questions: 9 (3 Easy, 3 Medium, 3 Hard)

### Questions (18 total)

**By Difficulty:**
- Easy: 6 questions
- Medium: 6 questions
- Hard: 6 questions

**By Topic:**
- SI and CI: 9 questions
- Profit & Loss: 9 questions

## Database Collections

### Topics Collection
- Fields: `id`, `name`, `description`, `hint`
- Records: 4

### Questions Collection
- Fields: `id`, `topicId`, `difficulty`, `question`, `options` (array), `answerIndex`, `explanation`
- Records: 18
- All questions include:
  - 4 multiple choice options
  - Answer index (0-3)
  - Detailed explanations with mathematical formulas (LaTeX format)

## Import Script
Location: `/backend/scripts/importFlashcards.js`

**⚠️ IMPORTANT: This script performs a COMPLETE REPLACEMENT**

To re-import or update the data, run:
```bash
cd backend
node scripts/importFlashcards.js
```

**What this does:**
- Deletes ALL existing topics and questions from MongoDB
- Inserts only the data from the spreadsheet
- Ensures database contains exactly what's in the script

## Notes
- All mathematical formulas are preserved in LaTeX format for rendering with KaTeX
- Question IDs follow the pattern: `{topic}-{difficulty}-{number}`
- Topic IDs: `si-ci` (SI and CI), `profit-loss` (Profit & Loss)
- **The import script performs a COMPLETE REPLACEMENT** - all old data is deleted before inserting new data
- Data is consolidated into 2 clean categories for better organization

