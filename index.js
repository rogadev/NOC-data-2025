/*
 * NOC Data Seeding Application
 * ============================
 *
 * This application is designed to seed a database with National Occupational Classification (NOC) data.
 * It processes Excel files containing employment outlook data, JSON files with VIU (Vancouver Island University)
 * programs, and unit group information.
 *
 * Key Features:
 * - Database seeding with batch processing for performance
 * - Error handling and duplicate detection
 * - Configurable operation modes (seed vs clean)
 * - Automatic port detection for server startup
 * - Comprehensive logging for debugging
 *
 * Data Flow:
 * 1. Unit Groups: Basic NOC occupational categories
 * 2. Economic Regions: Geographic regions for employment data
 * 3. Outlooks: Employment outlook data linked to regions and NOC codes
 * 4. Program Areas & Programs: Educational programs from VIU
 *
 * This uses Prisma as an ORM (Object-Relational Mapping) tool, batch processing prevents
 * database overwhelm with large datasets, error logging helps with debugging data import issues,
 * and the application can run in either "seed" or "clean" mode.
 */

// External dependencies - these are npm packages that provide core functionality
const express = require('express') // Web framework for Node.js
const { PrismaClient } = require('@prisma/client') // Database ORM for type-safe database access
const xlsx = require('xlsx') // Excel file parser for reading .xlsx files
const fs = require('fs') // File system operations (built-in Node.js module)
const path = require('path') // Path manipulation utilities (built-in Node.js module)
const crypto = require('crypto') // Cryptographic functionality for hashing (built-in Node.js module)
const net = require('net') // Network utilities for port checking (built-in Node.js module)

// Initialize Prisma client - this is our main interface to the database
// Prisma generates type-safe database queries based on your schema.prisma file
const prisma = new PrismaClient()

// Initialize Express app - this will handle HTTP requests (though mainly used for health checks here)
const app = express()

// Server configuration
// Environment variables allow different settings in development vs production
const DEFAULT_PORT = process.env.PORT || 3000 // Use PORT from environment or default to 3000
const FALLBACK_PORT = 4321 // Backup port if default is unavailable

// ============================================================================
// CONFIGURATION OPTIONS
// ============================================================================
// These flags control what operations the application performs
// Modify these to customize the seeding process

// Batch Size for processing data (max 20 recommended)
// Processing thousands of records at once can overwhelm the database
// and cause memory issues. Batching processes data in smaller chunks.
const BATCH_SIZE = 20

// Seed Options - Control which types of data to import
// These boolean flags let you selectively seed different parts of the database
const SEED_OUTLOOKS = false // Employment outlook data from Excel files
const SEED_PROGRAMS = true // VIU educational programs from JSON
const SEED_UNIT_GROUPS = true // NOC unit groups and sections from JSON

// Operation Mode - Choose between seeding (adding data) or cleaning (removing bad data)
// This is useful for maintenance and data correction
const CLEAN = false // if true, clean the database; if false, seed it

// Log File Options - Control what gets logged to files for debugging
// Logging helps track issues during large data imports
const LOG_ERRORS = true // Log database errors to errors.txt
const LOG_DUPLICATES = false // Log duplicate record attempts to duplicates.txt

// ============================================================================
// GLOBAL COUNTERS AND CACHES
// ============================================================================
// These variables track progress and cache frequently-used data

// Counters for tracking import progress
// These help monitor the seeding process and identify issues
let createdCount = 0 // Successfully created records
let duplicateCount = 0 // Records that already existed (duplicates)

// Cache for economic regions to avoid repeated database queries
// Caching improves performance by storing frequently-accessed data in memory
// Map is more efficient than Object for key-value lookups with string keys
let economicRegionsCache = new Map()

// Write streams for logging - these stay open during the entire process
// Streams are more efficient than repeatedly opening/closing files
const errorLog = LOG_ERRORS
  ? fs.createWriteStream('errors.txt', { flags: 'a' }) // 'a' = append mode
  : null
const duplicateLog = LOG_DUPLICATES
  ? fs.createWriteStream('duplicates.txt', { flags: 'a' })
  : null

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
// These functions provide common functionality used throughout the application

/**
 * Progress Logging Function
 * ========================
 * Clears the current console line and displays a progress update showing
 * the number of items created and duplicate items encountered.
 *
 * This creates a "live updating" progress display that overwrites the same line
 * instead of creating new lines, keeping the output clean during long operations.
 *
 * - process.stdout is Node.js's interface to the terminal output
 * - clearLine() removes the current line content
 * - cursorTo(0) moves cursor to the beginning of the line
 * - write() outputs text without a newline (unlike console.log)
 */
function logProgress() {
  process.stdout.clearLine() // Clear the current terminal line
  process.stdout.cursorTo(0) // Move cursor to start of line
  process.stdout.write(
    `Created: ${createdCount} | Duplicates: ${duplicateCount}`
  )
}

/**
 * Safe Database Creation Function
 * ==============================
 * Attempts to create a record in the database while handling potential duplicates and errors.
 * This is a key function that wraps database operations with error handling.
 *
 * Why is this needed?
 * - Database operations can fail for various reasons (duplicates, connection issues, etc.)
 * - We want to continue processing even if some records fail
 * - We need to track successes vs failures for monitoring
 *
 * @param {PrismaClient[keyof PrismaClient]} model - The Prisma model to create the record in (e.g., prisma.unitGroup)
 * @param {Object} data - The data object to be inserted into the database
 * @param {string} idLabel - Identifier label for logging purposes (helps identify which record failed)
 *
 * - P2002 is Prisma's error code for unique constraint violations (duplicates)
 * - The function doesn't throw errors - it handles them gracefully and continues
 * - Error logging is optional based on configuration flags
 */
async function safeCreate(model, data, idLabel) {
  try {
    await model.create({ data })
    createdCount++
  } catch (error) {
    // Handle duplicate key errors (P2002 is Prisma's code for unique constraint violation)
    if (error.code === 'P2002') {
      duplicateCount++

      // Log detailed information about the duplicate if logging is enabled
      if (LOG_DUPLICATES && duplicateLog) {
        // Enhanced duplicate logging with field information
        const uniqueFields = error.meta?.target || [] // Which fields caused the conflict
        duplicateLog.write(
          `Duplicate on ${idLabel}:\n` +
            `Fields causing conflict: ${uniqueFields.join(', ')}\n` +
            `Data: ${JSON.stringify(data, null, 2)}\n` + // Pretty-print the data
            '----------------------------------------\n'
        )
      }
    } else {
      // Handle other types of database errors (connection issues, data type errors, etc.)
      if (LOG_ERRORS && errorLog) {
        errorLog.write(`Error on ${idLabel}: ${error.message}\n`)
      }
    }
  } finally {
    // Always update progress display, regardless of success or failure
    logProgress()
  }
}

/**
 * Safe Database Deletion Function
 * ===============================
 * Safely deletes a record from the database with error handling.
 * Used during cleanup operations to remove invalid or unwanted data.
 *
 * @param {PrismaClient[keyof PrismaClient]} model - The Prisma model to delete from
 * @param {Object} where - The where clause for identifying the record to delete
 * @param {string} label - Identifier label for logging purposes
 *
 * - This wraps deletion operations with try-catch to prevent crashes
 * - Deletion failures are logged but don't stop the cleanup process
 */
async function safeDelete(model, where, label) {
  try {
    await model.delete({ where })
  } catch (error) {
    if (LOG_ERRORS && errorLog) {
      errorLog.write(`Error deleting ${label}: ${error.message}\n`)
    }
  }
}

/**
 * Batch Processing Function
 * ========================
 * Processes an array of data in chunks to prevent overwhelming the database.
 * This is a critical performance optimization for large datasets.
 *
 * Why batch processing?
 * - Processing thousands of records simultaneously can overwhelm the database
 * - It can cause memory issues and connection timeouts
 * - Batching allows for better error recovery and progress tracking
 *
 * @param {Array} dataArray - Array of items to process
 * @param {Function} handler - Async function to process each item
 *
 * - Promise.all() runs operations in parallel within each batch for speed
 * - await ensures each batch completes before starting the next
 * - The handler function receives each individual item from the array
 */
async function processInChunks(dataArray, handler) {
  // Process the array in chunks of BATCH_SIZE
  for (let i = 0; i < dataArray.length; i += BATCH_SIZE) {
    const chunk = dataArray.slice(i, i + BATCH_SIZE)

    // Process all items in the current chunk simultaneously
    // This balances performance (parallel processing) with database safety (limited concurrency)
    await Promise.all(chunk.map((item) => handler(item)))
  }
}

/**
 * Delete Progress Logging Function
 * ================================
 * Updates the console output to show delete operation progress with percentage.
 * Similar to logProgress() but specifically for deletion operations.
 *
 * @param {number} deletedCount - Number of records deleted so far
 * @param {number} totalToDelete - Total number of records to delete
 *
 * - Math.floor() rounds down to get whole percentage numbers
 * - This provides user feedback during potentially long deletion operations
 */
function logDeleteProgress(deletedCount, totalToDelete) {
  const percent = Math.floor((deletedCount / totalToDelete) * 100)
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  process.stdout.write(
    `Deleting records: ${deletedCount}/${totalToDelete} (${percent}%)`
  )
}

/**
 * Hash Generation Function
 * =======================
 * Generates a MD5 hash of the given value.
 * Used to create unique identifiers for duplicate detection.
 *
 * Why hashing?
 * - Creates consistent, unique identifiers from text content
 * - Helps detect when the same content is being inserted multiple times
 * - MD5 is fast and sufficient for this use case (not cryptographic security)
 *
 * @param {string} value - The input string to hash
 * @returns {string} The hashed output in hexadecimal format
 *
 * - MD5 is not cryptographically secure but fine for duplicate detection
 * - 'hex' format creates a readable string of letters and numbers
 * - crypto.createHash() is a Node.js built-in function
 */
function createHash(value) {
  return crypto.createHash('md5').update(value).digest('hex')
}

// ============================================================================
// CACHING AND DATABASE MANAGEMENT FUNCTIONS
// ============================================================================
// These functions handle performance optimization and database connection management

/**
 * Economic Regions Cache Initialization
 * ====================================
 * Initializes the economic regions cache from the database.
 * This is a performance optimization that loads all regions into memory once
 * instead of querying the database repeatedly.
 *
 * Why caching?
 * - Economic regions are referenced frequently during outlook data processing
 * - Database queries are slow compared to memory lookups
 * - Reduces database load and improves overall performance
 *
 * - Cache is populated once at startup, then used throughout the process
 * - If cache initialization fails, the process continues with an empty cache
 * - Map.set() and Map.get() provide O(1) lookup performance
 */
async function initializeRegionsCache() {
  console.log('Initializing economic regions cache...')
  try {
    // Fetch all economic regions from database using safe operation wrapper
    const regions = await safeDbOperation(
      () => prisma.economicRegion.findMany(),
      'initialize regions cache'
    )

    // Populate the cache Map with region code as key, full region object as value
    regions.forEach((region) => {
      economicRegionsCache.set(region.economicRegionCode, region)
    })
    console.log(`Cached ${economicRegionsCache.size} economic regions`)
  } catch (error) {
    console.error('Failed to initialize regions cache:', error.message)
    // Return with empty cache rather than failing - graceful degradation
    economicRegionsCache = new Map()
    console.log('Proceeding with empty regions cache')
  }
}

/**
 * Region Existence Checker and Creator
 * ===================================
 * Checks if a region exists in the cache and creates it if it doesn't.
 * This implements a "cache-aside" pattern for managing region data.
 *
 * Cache-aside pattern:
 * 1. Check cache first
 * 2. If not found, create in database
 * 3. Add to cache for future use
 * 4. Handle race conditions gracefully
 *
 * @param {Object} regionData - The region data to check/create
 * @returns {Promise<void>}
 *
 * - This function handles the race condition where another process might create the same region
 * - It uses optimistic creation: try to create, handle duplicate gracefully
 * - Cache is updated after successful creation to keep it current
 */
async function ensureRegionExists(regionData) {
  const { economicRegionCode } = regionData

  // Check if region already exists in our in-memory cache
  if (!economicRegionsCache.has(economicRegionCode)) {
    try {
      // Try to create the region in the database
      const newRegion = await safeDbOperation(
        () => prisma.economicRegion.create({ data: regionData }),
        `create region ${economicRegionCode}`
      )

      // Add newly created region to cache for future lookups
      economicRegionsCache.set(economicRegionCode, newRegion)
      createdCount++
    } catch (error) {
      // Handle the case where another process created the region first (race condition)
      if (error.code === 'P2002') {
        // If we get here, another process might have created the region
        // Let's fetch and cache it to keep our cache current
        try {
          const existingRegion = await safeDbOperation(
            () =>
              prisma.economicRegion.findUnique({
                where: { economicRegionCode },
              }),
            `fetch existing region ${economicRegionCode}`
          )
          if (existingRegion) {
            economicRegionsCache.set(economicRegionCode, existingRegion)
          }
        } catch (fetchError) {
          console.error(
            `Failed to fetch existing region ${economicRegionCode}:`,
            fetchError.message
          )
        }

        duplicateCount++
        // Log duplicate information if enabled
        if (LOG_DUPLICATES && duplicateLog) {
          const uniqueFields = error.meta?.target || []
          duplicateLog.write(
            `Duplicate region:\n` +
              `Fields causing conflict: ${uniqueFields.join(', ')}\n` +
              `Data: ${JSON.stringify(regionData, null, 2)}\n` +
              '----------------------------------------\n'
          )
        }
      } else {
        // Handle other types of errors (connection issues, data validation, etc.)
        if (LOG_ERRORS && errorLog) {
          errorLog.write(`Error creating region: ${error.message}\n`)
        }
      }
    }
  }
}

/**
 * Database Transaction Error Handler
 * =================================
 * Handles database transaction errors by reconnecting if needed.
 * This function deals with database connection issues that can occur during long-running operations.
 *
 * Why is this needed?
 * - Long-running database operations can experience connection timeouts
 * - Database servers might restart or lose connections
 * - Transaction conflicts can occur with concurrent operations
 *
 * - This is a specific handler for transaction abort errors
 * - $disconnect() and $connect() reset the Prisma connection
 * - The error is re-thrown after handling so calling code can decide what to do
 */
async function handleDatabaseError(error, operation) {
  if (error.message && error.message.includes('transaction is aborted')) {
    console.log(`Transaction aborted during ${operation}, reconnecting...`)
    await prisma.$disconnect() // Close current connection
    await prisma.$connect() // Establish new connection
  }
  throw error // Re-throw so calling code can handle it
}

/**
 * Safe Database Operation Wrapper
 * ==============================
 * Safely executes a database operation with automatic retry on transaction errors.
 * This implements a retry pattern for handling transient database issues.
 *
 * Retry Pattern:
 * 1. Try the operation
 * 2. If it fails due to connection issues, reconnect and retry once
 * 3. If it still fails, give up and throw the error
 *
 * @param {Function} operation - The database operation to execute
 * @param {string} context - Description of the operation for logging
 * @returns {Promise<any>} - Result of the database operation
 *
 * - This wrapper makes database operations more resilient
 * - It only retries specific types of errors (transaction aborts)
 * - The retry is limited to one attempt to avoid infinite loops
 */
async function safeDbOperation(operation, context = 'database operation') {
  try {
    return await operation()
  } catch (error) {
    // Check if this is a transaction abort error that we can recover from
    if (error.message && error.message.includes('transaction is aborted')) {
      console.log(
        `Transaction aborted during ${context}, resetting connection...`
      )
      await prisma.$disconnect() // Clean disconnect
      await prisma.$connect() // Fresh connection

      // Retry the operation once after reconnection
      try {
        return await operation()
      } catch (retryError) {
        console.error(
          `Failed to execute ${context} after retry:`,
          retryError.message
        )
        throw retryError
      }
    }
    throw error // Re-throw non-recoverable errors
  }
}

// ============================================================================
// MAIN DATA SEEDING FUNCTION
// ============================================================================
// This is the heart of the application - it orchestrates the entire seeding process

/**
 * Main Database Seeding Function
 * ==============================
 * Main database seeding function that processes outlook data, VIU programs,
 * and unit groups based on configuration flags.
 *
 * Data Processing Order (Important!):
 * 1. Unit Groups - Basic NOC occupational categories (must be first)
 * 2. Economic Regions - Geographic regions for employment data
 * 3. Outlooks - Employment outlook data (depends on Unit Groups and Regions)
 * 4. Program Areas - Educational program categories from VIU
 * 5. Programs - Individual educational programs (depends on Program Areas)
 *
 * Why this order?
 * - Dependencies: Child tables need parent records to exist first
 * - Foreign keys: Database enforces referential integrity
 * - Data consistency: Ensures all relationships are valid
 *
 * This uses if-else statements to handle different data types and their dependencies.
 */
async function seedDatabase() {
  // ============================================================================
  // STEP 1: SEED UNIT GROUPS
  // ============================================================================
  // Unit Groups are the foundation - they must be created first because
  // Outlook records reference them via foreign keys

  if (SEED_UNIT_GROUPS) {
    console.log('\n\nSeeding Unit Groups...')
    const unitGroupsFile = path.join(__dirname, 'data/unit_groups.json')

    // Always check if data files exist before trying to process them
    if (fs.existsSync(unitGroupsFile)) {
      // Load and parse the JSON data file
      const unitGroupsData = JSON.parse(fs.readFileSync(unitGroupsFile, 'utf8'))

      // Process each unit group from the data file
      await processInChunks(unitGroupsData, async (unitGroup) => {
        const { noc_number, occupation, sections } = unitGroup

        // Insert the main UnitGroup record
        // This creates the primary record that other tables will reference
        await safeCreate(
          prisma.unitGroup,
          {
            noc: noc_number, // NOC code (National Occupational Classification)
            occupation, // Human-readable occupation title
          },
          `noc=${noc_number}` // Identifier for error logging
        )

        // Process associated sections if they exist
        // Sections contain detailed information about the occupation
        if (sections && sections.length > 0) {
          // Insert Sections related to the UnitGroup
          await processInChunks(sections, async (section) => {
            const { title, items } = section

            await safeCreate(
              prisma.sectionsEntity,
              {
                noc: noc_number, // Links back to the UnitGroup
                title, // Section title (e.g., "Main duties", "Employment requirements")
                items: items || [], // Array of items within this section
              },
              `sectionTitle=${title} for noc=${noc_number}`
            )
          })
        }
      })
    } else {
      console.log(`File not found: ${unitGroupsFile}`)
    }
  }

  // ============================================================================
  // STEP 2: PROCESS OUTLOOKS AND ECONOMIC REGIONS
  // ============================================================================
  // This section handles employment outlook data from Excel files
  // It also creates Economic Regions as needed (referenced by outlook data)

  if (SEED_OUTLOOKS) {
    // Initialize the regions cache for performance optimization
    await initializeRegionsCache()

    console.log('\n\nSeeding Outlooks...')

    // Load the Excel file containing employment outlook data
    const filePath = path.join(__dirname, 'data/2024-2026-3-year-outlooks.xlsx')
    const workbook = xlsx.readFile(filePath) // Read the Excel file
    const sheetName = workbook.SheetNames[0] // Get the first worksheet
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]) // Convert to JSON

    // Process each row of outlook data
    await processInChunks(data, async (row) => {
      // Clean and format the NOC code
      // Remove 'NOC_' prefix and pad with zeros to ensure 5-digit format
      const noc = row['NOC_Code'].replace('NOC_', '').padStart(5, '0')

      // First ensure the UnitGroup exists for this NOC code
      // This is critical because Outlook records reference UnitGroups
      await safeCreate(
        prisma.unitGroup,
        {
          noc,
          occupation: row['NOC Title'], // Using the NOC Title as occupation name
        },
        `UnitGroup noc=${noc}`
      )

      // Extract outlook data from the Excel row
      const economicRegionCode = row['Economic Region Code'].toString()
      const economicRegionName = row['Economic Region Name']
      const title = row['NOC Title']
      const outlook = row['Outlook'] // Employment outlook rating (e.g., "Fair", "Good")
      const trends = row['Employment Trends'] // Detailed trends description
      const trendsHash = createHash(row['Employment Trends']) // Hash for duplicate detection
      const releaseDate = new Date(row['Release Date']) // Data release date
      const province = row['Province'] // Canadian province
      const lang = row['LANG'] // Language (EN/FR)

      // Ensure the Economic Region exists before creating the Outlook
      // This uses our caching system for performance
      await ensureRegionExists({
        economicRegionCode,
        economicRegionName,
      })

      // Create the Outlook record with all the extracted data
      await safeCreate(
        prisma.outlook,
        {
          noc, // Links to UnitGroup
          economicRegionCode, // Links to EconomicRegion
          title,
          outlook,
          trends,
          trendsHash, // Used for duplicate detection
          releaseDate,
          province,
          lang,
        },
        `outlook=noc-${noc}-region-${economicRegionCode}` // Unique identifier for logging
      )
    })
  }

  // ============================================================================
  // STEP 3: SEED VIU PROGRAMS AND PROGRAM AREAS
  // ============================================================================
  // This section handles Vancouver Island University educational programs
  // Program Areas must be created before Programs (parent-child relationship)

  if (SEED_PROGRAMS) {
    console.log('\n\nSeeding Program Areas & Programs...')

    const programsFile = path.join(__dirname, 'data/viu_programs.json')

    if (fs.existsSync(programsFile)) {
      // Load the programs data from JSON file
      const programsData = JSON.parse(fs.readFileSync(programsFile, 'utf8'))

      // ========================================================================
      // STEP 3A: EXTRACT AND CREATE PROGRAM AREAS
      // ========================================================================
      // Extract unique program areas from the programs data
      // Each program belongs to a program area, but multiple programs can share the same area

      const programAreas = programsData.reduce((acc, program) => {
        const { nid, title } = program.program_area
        // Only add if we haven't seen this program area before (avoid duplicates)
        if (!acc.some((area) => area.nid === nid)) {
          acc.push({ nid, title })
        }
        return acc
      }, [])

      // Insert all unique Program Areas first
      await processInChunks(programAreas, async (area) => {
        await safeCreate(prisma.programArea, area, `ProgramArea: ${area.title}`)
      })

      // ========================================================================
      // STEP 3B: CREATE PROGRAMS WITH PROPER FOREIGN KEY REFERENCES
      // ========================================================================
      // Fetch all Program Areas from DB to ensure they exist and get their IDs
      // This is necessary because we need the database-generated IDs for foreign keys

      const existingProgramAreas = await prisma.programArea.findMany()
      const programAreaMap = new Map(
        existingProgramAreas.map((pa) => [pa.nid, pa.id]) // Map NID to database ID
      )

      // Insert Programs with proper foreign key relationships
      await processInChunks(programsData, async (program) => {
        const programAreaNid = program.program_area.nid
        const foundProgramAreaId = programAreaMap.get(programAreaNid)

        // Validate that the Program Area exists before creating the Program
        if (!foundProgramAreaId) {
          console.error(
            `Missing Program Area for: ${program.title} (NID: ${programAreaNid})`
          )
          if (LOG_ERRORS && errorLog) {
            errorLog.write(
              `Missing Program Area for: ${program.title} (NID: ${programAreaNid})\n`
            )
          }
          return // Skip this program if its Program Area doesn't exist
        }

        // Create the Program record with all its data
        await safeCreate(
          prisma.program,
          {
            nid: program.nid, // Unique identifier from source system
            title: program.title, // Program name
            duration: program.duration || null, // Program length (optional)
            credential: program.credential, // Type of credential earned
            programAreaNid: foundProgramAreaId, // Foreign key to Program Area
            viuSearchKeywords: program.viu_search_keywords || null, // VIU-specific search terms
            nocSearchKeywords: program.noc_search_keywords || [], // NOC-related search terms (array)
            knownNocGroups: program.known_noc_groups || [], // Known related NOC groups (array)
          },
          `Program: ${program.title}`
        )
      })

      console.log('\nFinished seeding Programs & Program Areas.')
    } else {
      console.log(`File not found: ${programsFile}`)
    }
  }

  // ============================================================================
  // SEEDING COMPLETE
  // ============================================================================
  // Clean up and report final results

  console.log('\n\nSeeding complete!')
  console.log(`Total Created: ${createdCount}, Duplicates: ${duplicateCount}`)

  // Close log files if they were opened
  if (LOG_ERRORS && errorLog) {
    errorLog.end()
  }
  if (LOG_DUPLICATES && duplicateLog) {
    duplicateLog.end()
  }

  // Disconnect from database to clean up resources
  await prisma.$disconnect()
}

// ============================================================================
// NETWORKING AND SERVER MANAGEMENT FUNCTIONS
// ============================================================================
// These functions handle port detection and server startup

/**
 * Port Availability Checker
 * =========================
 * Checks if a specific port is available for use by attempting to bind to it.
 * This prevents port conflicts when starting the server.
 *
 * How it works:
 * 1. Create a temporary server
 * 2. Try to bind to the specified port
 * 3. If successful, the port is available (close server and return true)
 * 4. If it fails, the port is in use (return false)
 *
 * @param {number} port - The port number to check (1-65535)
 * @returns {Promise<boolean>} - True if port is available, false if in use
 *
 * This uses Node.js's built-in 'net' module to test network connections and temporary server creation.
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    // Create a temporary TCP server to test the port
    const server = net.createServer()

    // Try to listen on the specified port
    server.listen(port, () => {
      // If we get here, the port is available
      server.close(() => {
        resolve(true) // Port is free to use
      })
    })

    // If listening fails, the port is already in use
    server.on('error', () => {
      resolve(false) // Port is occupied
    })
  })
}

/**
 * Available Port Finder
 * =====================
 * Gets an available port, checking DEFAULT_PORT first, then FALLBACK_PORT,
 * then searching for any available port if both are occupied.
 *
 * Port Selection Strategy:
 * 1. Try the preferred DEFAULT_PORT (usually from environment variable)
 * 2. If occupied, try the FALLBACK_PORT (hardcoded backup)
 * 3. If both are occupied, search incrementally starting from FALLBACK_PORT + 1
 * 4. Stop at port 65535 (maximum valid port number)
 *
 * @returns {Promise<number>} - An available port number
 * @throws {Error} - If no ports are available (extremely unlikely)
 *
 * This uses environment variables (process.env.PORT) and port testing to find an available port.
 */
async function getAvailablePort() {
  // First choice: Try the default port (from environment or 3000)
  if (await isPortAvailable(DEFAULT_PORT)) {
    return DEFAULT_PORT
  }

  // Second choice: Try the hardcoded fallback port
  if (await isPortAvailable(FALLBACK_PORT)) {
    console.log(
      `Port ${DEFAULT_PORT} is in use, switching to port ${FALLBACK_PORT}`
    )
    return FALLBACK_PORT
  }

  // Last resort: Find any available port starting from FALLBACK_PORT + 1
  // This ensures we don't interfere with other common development ports
  let port = FALLBACK_PORT + 1
  while (port < 65535) {
    // 65535 is the maximum valid port number
    if (await isPortAvailable(port)) {
      console.log(
        `Ports ${DEFAULT_PORT} and ${FALLBACK_PORT} are in use, using port ${port}`
      )
      return port
    }
    port++
  }

  // This should never happen unless the system is severely compromised
  throw new Error('No available ports found')
}

// ============================================================================
// DATABASE CLEANUP FUNCTIONS
// ============================================================================
// These functions handle data cleanup operations

/**
 * Database Cleanup Function
 * ========================
 * Cleans up database records with invalid or problematic data.
 * Currently focuses on removing records with short NOC codes (less than 5 digits).
 *
 * Why cleanup is needed:
 * - Data import processes can sometimes create malformed records
 * - Short NOC codes indicate incomplete or invalid data
 * - Cleanup maintains data quality and consistency
 *
 * Cleanup Process:
 * 1. Find all Outlook records with short NOC codes
 * 2. Delete them in batches (for performance and safety)
 * 3. Find all UnitGroup records with short NOC codes
 * 4. Delete them in batches
 * 5. Report cleanup results
 *
 * This uses try-catch to handle potential errors and logs cleanup status.
 */
async function cleanDatabase() {
  console.log('Starting database cleanup...')

  try {
    // ========================================================================
    // STEP 1: CLEAN UP OUTLOOK RECORDS WITH SHORT NOC CODES
    // ========================================================================

    // Fetch all Outlook records and filter for those with short NOC codes
    let outlookShortNoc = await prisma.outlook.findMany()
    outlookShortNoc = outlookShortNoc.filter((o) => o.noc.length < 5)

    // Delete problematic Outlook records in batches
    let deletedCount = 0
    const totalOutlook = outlookShortNoc.length
    if (totalOutlook > 0) {
      console.log(
        `Found ${totalOutlook} Outlook records with short NOC to delete`
      )
      await processInChunks(outlookShortNoc, async (o) => {
        await safeDelete(prisma.outlook, { id: o.id }, `Outlook ID=${o.id}`)
        deletedCount++
        logDeleteProgress(deletedCount, totalOutlook)
      })
      console.log('\nDone deleting Outlook records with short noc.')
    } else {
      console.log('No Outlook records with short NOC found.')
    }

    // ========================================================================
    // STEP 2: CLEAN UP UNITGROUP RECORDS WITH SHORT NOC CODES
    // ========================================================================

    // Fetch all UnitGroup records and filter for those with short NOC codes
    let unitGroupsShortNoc = await prisma.unitGroup.findMany()
    unitGroupsShortNoc = unitGroupsShortNoc.filter((u) => u.noc.length < 5)

    // Delete problematic UnitGroup records in batches
    deletedCount = 0
    const totalUnitGroups = unitGroupsShortNoc.length
    if (totalUnitGroups > 0) {
      console.log(
        `Found ${totalUnitGroups} UnitGroup records with short NOC to delete`
      )
      await processInChunks(unitGroupsShortNoc, async (u) => {
        await safeDelete(
          prisma.unitGroup,
          { noc: u.noc }, // Delete by NOC code (unique identifier)
          `UnitGroup noc=${u.noc}`
        )
        deletedCount++
        logDeleteProgress(deletedCount, totalUnitGroups)
      })
      console.log('\nDone deleting UnitGroup records with short noc.')
    } else {
      console.log('No UnitGroup records with short NOC found.')
    }

    console.log('\nCleanup complete!')
  } catch (error) {
    // Log cleanup errors but don't crash the application
    if (LOG_ERRORS && errorLog) {
      errorLog.write(`Error during cleanup: ${error.message}\n`)
    }
    console.error('Error during cleanup:', error)
    throw error // Re-throw to be handled by calling function
  } finally {
    // Always disconnect from database, even if errors occurred
    await prisma.$disconnect()
  }
}

// ============================================================================
// MAIN APPLICATION STARTUP FUNCTION
// ============================================================================
// This function orchestrates the entire application lifecycle

/**
 * Server Startup and Operation Controller
 * ======================================
 * Main function that controls the application flow and starts the HTTP server.
 * This function determines whether to run in SEED mode or CLEAN mode based on configuration.
 *
 * Application Flow:
 * 1. Check operation mode (CLEAN or SEED)
 * 2. Execute the appropriate database operation
 * 3. Find an available port for the HTTP server
 * 4. Start the server to indicate operation completion
 * 5. Handle any errors gracefully
 *
 * Why start a server after data operations?
 * - Provides a clear indication that operations completed successfully
 * - Allows for potential health checks or status endpoints
 * - Keeps the process running for monitoring in production environments
 *
 * This uses try-catch to handle potential errors and logs operation status.
 */
async function startServer() {
  try {
    // ========================================================================
    // STEP 1: EXECUTE DATABASE OPERATION BASED ON CONFIGURATION
    // ========================================================================

    // Run the appropriate operation based on the CLEAN configuration flag
    if (CLEAN) {
      console.log('🧹 CLEAN mode enabled - Starting database cleanup...')
      await cleanDatabase()
    } else {
      console.log('🌱 SEED mode enabled - Starting database seeding...')
      await seedDatabase()
    }

    // ========================================================================
    // STEP 2: CLEANUP AND EXIT SUCCESSFULLY
    // ========================================================================

    console.log('✅ Operation completed successfully!')

    // Find an available port (for logging/future use)
    const PORT = await getAvailablePort()
    console.log(`📡 Available port: ${PORT}`)

    // Close any remaining log files
    if (LOG_ERRORS && errorLog) {
      errorLog.end()
    }
    if (LOG_DUPLICATES && duplicateLog) {
      duplicateLog.end()
    }

    // Ensure database connection is closed
    try {
      await prisma.$disconnect()
      console.log('Database connection closed')
    } catch (disconnectError) {
      console.error(
        'Warning: Failed to close database connection:',
        disconnectError
      )
    }

    // Exit with success code (0)
    process.exit(0)
  } catch (error) {
    // ========================================================================
    // ERROR HANDLING AND CLEANUP
    // ========================================================================

    console.error('❌ Failed to complete operation:', error.message)

    // Try to cleanup the database connection gracefully
    try {
      await prisma.$disconnect()
      console.log('Database connection closed')
    } catch (disconnectError) {
      console.error('Failed to close database connection:', disconnectError)
    }

    // Exit with error code to indicate failure
    process.exit(1)
  }
}

// ============================================================================
// APPLICATION ENTRY POINT
// ============================================================================
// Start the application when this file is executed

// This starts the entire application when the script is run
// It's the main entry point that kicks off all operations
startServer()
