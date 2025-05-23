# NOC Data Seeding Application

A comprehensive Node.js application designed to seed databases with National Occupational Classification (NOC) data, employment outlook information, and Vancouver Island University (VIU) educational programs.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Data Files Required](#data-files-required)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Architecture Overview](#architecture-overview)
- [Troubleshooting](#troubleshooting)
- [Development Notes](#development-notes)

## 🎯 Overview

This application processes and imports large datasets related to Canadian employment and education data:

- **NOC Unit Groups**: Basic occupational categories from the National Occupational Classification system
- **Employment Outlooks**: 3-year employment forecasts by region and occupation
- **Economic Regions**: Geographic regions for employment data organization
- **VIU Programs**: Educational programs from Vancouver Island University
- **Program Areas**: Categories that group related educational programs

### Key Features

- ✅ **Batch Processing**: Handles large datasets efficiently without overwhelming the database
- ✅ **Error Handling**: Comprehensive error logging and duplicate detection
- ✅ **Configurable Operations**: Switch between seeding (adding data) and cleaning (removing bad data)
- ✅ **Performance Optimization**: Caching system for frequently-accessed data
- ✅ **Progress Tracking**: Real-time progress display during operations
- ✅ **Database Safety**: Transaction handling and automatic reconnection

## 🛠 Prerequisites

Before setting up this application, ensure you have:

### Required Software

- **Node.js** (version 14.x or higher)
- **npm** (comes with Node.js)
- **Database**: PostgreSQL, MySQL, SQLite, or SQL Server (configured via Prisma)
- **Git** (for cloning the repository)

### Knowledge Requirements

- Basic understanding of Node.js and npm
- Familiarity with database concepts
- Understanding of JSON and Excel file formats

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd NOC-data-2025
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Install Required Packages

The application uses these main dependencies:

```bash
npm install express @prisma/client xlsx
```

**Dependency Breakdown:**

- `express`: Web framework for the HTTP server
- `@prisma/client`: Database ORM for type-safe database operations
- `xlsx`: Excel file parser for reading employment outlook data

## 🗄 Database Setup

### Step 1: Configure Prisma

1. **Create/Update `schema.prisma`** file with your database configuration:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"  // or "mysql", "sqlite", "sqlserver"
  url      = env("DATABASE_URL")
}

// Your data models go here...
```

2. **Set up your database connection** in `.env` file:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/noc_database"
```

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

### Step 3: Run Database Migrations

```bash
npx prisma db push
# or if you have migration files:
npx prisma migrate dev
```

### Expected Database Schema

The application expects these main tables:

- `UnitGroup`: NOC occupational categories
- `SectionsEntity`: Detailed sections for each unit group
- `EconomicRegion`: Geographic regions
- `Outlook`: Employment outlook data
- `ProgramArea`: Educational program categories
- `Program`: Individual educational programs

## 📁 Data Files Required

Create a `data/` directory in your project root with these files:

### Required Files Structure

```
data/
├── unit_groups.json           # NOC unit groups and sections
├── viu_programs.json         # VIU educational programs
└── 2024-2026-3-year-outlooks.xlsx  # Employment outlook data
```

### File Format Specifications

#### `unit_groups.json`

```json
[
  {
    "noc_number": "10010",
    "occupation": "Financial managers",
    "sections": [
      {
        "title": "Main duties",
        "items": ["Duty 1", "Duty 2", "..."]
      }
    ]
  }
]
```

#### `viu_programs.json`

```json
[
  {
    "nid": "123",
    "title": "Business Administration",
    "duration": "2 years",
    "credential": "Diploma",
    "program_area": {
      "nid": "456",
      "title": "Business"
    },
    "viu_search_keywords": "business management",
    "noc_search_keywords": ["management", "business"],
    "known_noc_groups": ["10010", "10020"]
  }
]
```

#### `2024-2026-3-year-outlooks.xlsx`

Excel file with columns:

- `NOC_Code`: NOC classification code
- `NOC Title`: Occupation title
- `Economic Region Code`: Region identifier
- `Economic Region Name`: Region name
- `Outlook`: Employment outlook rating
- `Employment Trends`: Detailed trends description
- `Release Date`: Data release date
- `Province`: Canadian province
- `LANG`: Language (EN/FR)

## ⚙️ Configuration

The application behavior is controlled by configuration flags at the top of `index.js`:

### Batch Processing

```javascript
const BATCH_SIZE = 20 // Max 20 recommended
```

**What it does**: Controls how many records are processed simultaneously. Lower values are safer for database stability.

### Data Seeding Options

```javascript
const SEED_OUTLOOKS = false // Employment outlook data from Excel
const SEED_PROGRAMS = true // VIU educational programs from JSON
const SEED_UNIT_GROUPS = true // NOC unit groups from JSON
```

**What it does**: Toggle which types of data to import. Useful for partial updates or testing.

### Operation Mode

```javascript
const CLEAN = false // false = seed data, true = clean bad data
```

**What it does**:

- `false`: Import/seed data into database
- `true`: Remove problematic records (e.g., short NOC codes)

### Logging Options

```javascript
const LOG_ERRORS = true // Log database errors to errors.txt
const LOG_DUPLICATES = false // Log duplicate attempts to duplicates.txt
```

**What it does**: Control what information gets saved to log files for debugging.

## 🌍 Environment Variables

Create a `.env` file in your project root:

```env
# Database connection (REQUIRED)
DATABASE_URL="postgresql://username:password@localhost:5432/noc_database"

# Server port (OPTIONAL)
PORT=3000

# Additional Prisma options (OPTIONAL)
PRISMA_CLI_QUERY_ENGINE_TYPE=binary
```

### Environment Variable Details

| Variable       | Required | Default | Description                         |
| -------------- | -------- | ------- | ----------------------------------- |
| `DATABASE_URL` | ✅ Yes   | None    | Complete database connection string |
| `PORT`         | ❌ No    | 3000    | HTTP server port number             |

### Database URL Format Examples

**PostgreSQL:**

```env
DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
```

**MySQL:**

```env
DATABASE_URL="mysql://user:password@localhost:3306/database_name"
```

**SQLite:**

```env
DATABASE_URL="file:./dev.db"
```

## 🚀 Usage

### Running the Application

#### Seed Mode (Default)

Import data into the database:

```bash
node index.js
```

#### Clean Mode

Remove problematic records:

1. Change configuration in `index.js`:
   ```javascript
   const CLEAN = true
   ```
2. Run the application:
   ```bash
   node index.js
   ```

### Selective Data Import

To import only specific types of data, modify the configuration flags:

**Import only VIU programs:**

```javascript
const SEED_OUTLOOKS = false
const SEED_PROGRAMS = true
const SEED_UNIT_GROUPS = false
```

**Import only employment outlooks:**

```javascript
const SEED_OUTLOOKS = true
const SEED_PROGRAMS = false
const SEED_UNIT_GROUPS = false
```

### Understanding the Output

#### Progress Display

```
Created: 1250 | Duplicates: 45
```

- **Created**: Successfully imported records
- **Duplicates**: Records that already existed (skipped)

#### Log Files

- `errors.txt`: Database errors and connection issues
- `duplicates.txt`: Detailed information about duplicate records

#### Success Indicators

```
🌱 SEED mode enabled - Starting database seeding...
Seeding Unit Groups...
Seeding Outlooks...
Seeding Program Areas & Programs...
Seeding complete!
Total Created: 2500, Duplicates: 150
🚀 Server running on port 3000
Operation completed successfully!
```

## 🏗 Architecture Overview

### Data Processing Order

The application processes data in a specific order due to database relationships:

```
1. Unit Groups     → Foundation NOC categories
2. Economic Regions → Geographic regions
3. Outlooks        → Employment data (references Unit Groups & Regions)
4. Program Areas   → Educational categories
5. Programs        → Individual programs (references Program Areas)
```

### Performance Optimizations

#### Batch Processing

Large datasets are processed in chunks to prevent:

- Database connection timeouts
- Memory overflow issues
- Transaction deadlocks

#### Caching System

- **Economic Regions**: Cached in memory for fast lookups
- **Foreign Key References**: Pre-loaded to avoid repeated database queries

#### Error Handling Strategy

1. **Graceful Degradation**: Continue processing even if some records fail
2. **Automatic Retry**: Reconnect to database on transaction failures
3. **Comprehensive Logging**: Track all issues for debugging

### Database Design Principles

#### Foreign Key Relationships

```
UnitGroup (NOC) ←── Outlook
EconomicRegion ←── Outlook
ProgramArea ←── Program
UnitGroup ←── SectionsEntity
```

#### Duplicate Prevention

- Unique constraints on key fields
- Hash-based duplicate detection for content
- Graceful handling of constraint violations

## 🔧 Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Error:** `Can't reach database server`
**Solution:**

1. Verify `DATABASE_URL` in `.env` file
2. Ensure database server is running
3. Check network connectivity
4. Validate credentials

#### 2. File Not Found Errors

**Error:** `File not found: data/unit_groups.json`
**Solution:**

1. Create `data/` directory in project root
2. Add required data files
3. Verify file names match exactly

#### 3. Port Already in Use

**Error:** `Port 3000 is already in use`
**Solution:**

1. The app automatically finds alternative ports
2. Or set custom port: `PORT=3001 node index.js`
3. Or kill process using the port

#### 4. Memory Issues with Large Files

**Error:** `JavaScript heap out of memory`
**Solution:**

1. Reduce `BATCH_SIZE` (try 10 or 5)
2. Process data types separately
3. Increase Node.js memory: `node --max-old-space-size=4096 index.js`

#### 5. Transaction Abort Errors

**Error:** `Transaction is aborted`
**Solution:**

1. The app automatically handles this with reconnection
2. Reduce batch size for stability
3. Check database server performance

### Debug Mode

Enable detailed logging for troubleshooting:

```javascript
const LOG_ERRORS = true
const LOG_DUPLICATES = true
```

Check log files:

- `errors.txt`: Database and system errors
- `duplicates.txt`: Duplicate record details

### Performance Monitoring

Monitor these metrics during operation:

- **Created vs Duplicates ratio**: High duplicates may indicate data issues
- **Processing speed**: Should maintain steady progress
- **Memory usage**: Should remain stable with batch processing
- **Database connections**: Should not accumulate

## 👨‍💻 Development Notes

### For Junior Developers

#### Key Concepts to Understand

1. **ORM (Object-Relational Mapping)**: Prisma translates JavaScript objects to SQL queries
2. **Batch Processing**: Processing data in small chunks instead of all at once
3. **Foreign Keys**: Database relationships that ensure data integrity
4. **Caching**: Storing frequently-used data in memory for speed
5. **Error Handling**: Managing failures gracefully without crashing

#### Code Structure

```
index.js
├── Configuration (lines 1-100)
├── Utility Functions (lines 100-300)
├── Database Operations (lines 300-600)
├── Data Seeding Logic (lines 600-900)
└── Server Startup (lines 900-1016)
```

#### Best Practices Demonstrated

- **Error Boundaries**: Each operation wrapped in try-catch
- **Resource Cleanup**: Database connections properly closed
- **Progress Feedback**: User-friendly progress indicators
- **Configurable Behavior**: Easy to modify without code changes
- **Documentation**: Extensive inline comments explaining complex logic

#### Safe Modification Guidelines

1. **Always test with small datasets first**
2. **Use batch processing for new data types**
3. **Add error logging for new operations**
4. **Maintain the data processing order**
5. **Test cleanup operations carefully**

### Adding New Data Types

To add support for new data types:

1. **Add configuration flag**:

   ```javascript
   const SEED_NEW_DATA = true
   ```

2. **Create seeding function**:

   ```javascript
   if (SEED_NEW_DATA) {
     console.log('Seeding new data...')
     // Processing logic here
   }
   ```

3. **Use batch processing**:

   ```javascript
   await processInChunks(newData, async (item) => {
     await safeCreate(prisma.newModel, item, `identifier`)
   })
   ```

4. **Add proper error handling and logging**

### Contributing

When contributing to this project:

1. Maintain the extensive commenting style
2. Add configuration options for new features
3. Include progress tracking for long operations
4. Write comprehensive error handling
5. Update this README with new features

---

**Need Help?** Check the inline code comments - they contain detailed explanations of how each function works and why specific approaches were chosen.
