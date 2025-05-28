/**
 * Database Utilities
 * ==================
 *
 * Centralized database connection and operation management
 * with proper error handling, logging, and retry logic.
 */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')
const { DB_CONFIG, LOG_ERRORS } = require('../config')
const { logger } = require('./logger')
const { incrementCreated, incrementSkipped } = require('./progress')

/**
 * Supabase-optimized Prisma client with connection pooling
 */
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
})

// Set up Prisma logging
prisma.$on('error', e => {
  logger.error('Prisma error', { error: e })
})

prisma.$on('warn', e => {
  logger.warn('Prisma warning', { warning: e })
})

prisma.$on('info', e => {
  logger.debug('Prisma info', { info: e })
})

prisma.$on('query', e => {
  if (e.duration > 1000) {
    // Log slow queries (>1s)
    logger.warn('Slow query detected', {
      query: e.query,
      duration: e.duration,
      params: e.params,
    })
  }
})

// Error logging to file (if enabled)
let errorLog = null
if (LOG_ERRORS) {
  const errorLogPath = path.join(process.cwd(), 'logs', 'database-errors.log')

  // Ensure logs directory exists
  const logsDir = path.dirname(errorLogPath)
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  errorLog = fs.createWriteStream(errorLogPath, { flags: 'a' })
}

/**
 * Retry wrapper for database operations
 * @param {Function} operation - The database operation to retry
 * @param {string} context - Context for logging
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<*>} The result of the operation
 */
async function withRetry(
  operation,
  context,
  maxRetries = DB_CONFIG.MAX_RETRIES,
) {
  let lastError

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // Don't retry on certain errors
      if (
        error.code === 'P2002' || // Unique constraint violation
        error.code === 'P2025' || // Record not found
        error.message?.includes('Invalid input')
      ) {
        throw error
      }

      if (attempt < maxRetries) {
        const delay = DB_CONFIG.RETRY_DELAY_MS * attempt
        logger.warn(
          `Retrying ${context} (attempt ${attempt}/${maxRetries}) after ${delay}ms`,
          {
            error: error.message,
            code: error.code,
          },
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * Safe database operation with comprehensive error handling
 * @param {Function} operation - The database operation to perform
 * @param {string} context - Context for logging and error reporting
 * @returns {Promise<*|null>} The result of the operation or null if failed
 */
async function safeDbOperation(operation, context) {
  try {
    const result = await withRetry(operation, context)
    incrementCreated()
    return result
  } catch (error) {
    incrementSkipped()

    // Log error details
    const errorInfo = {
      context,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    }

    // Categorize and handle different types of errors
    if (error.code === 'P2034') {
      // Transaction conflict - can be retried
      logger.warn('Transaction conflict', errorInfo)
      if (errorLog) {
        errorLog.write(
          `${new Date().toISOString()} - Transaction conflict in ${context}: ${error.message}\n`,
        )
      }
      return null
    } else if (
      error.message?.includes('too many connections') ||
      error.message?.includes('connection limit') ||
      error.message?.includes('rate limit')
    ) {
      // Connection/rate limit errors
      logger.warn('Rate limit or connection limit hit', errorInfo)
      if (errorLog) {
        errorLog.write(
          `${new Date().toISOString()} - Rate limit in ${context}: ${error.message}\n`,
        )
      }
      return null
    } else if (error.code === 'P2002') {
      // Unique constraint violation - record already exists
      logger.debug('Record already exists (unique constraint)', errorInfo)
      return null
    } else {
      // Other errors
      logger.error('Database operation failed', errorInfo)
      if (errorLog) {
        errorLog.write(
          `${new Date().toISOString()} - Error in ${context}: ${error.message}\n`,
        )
      }
      return null
    }
  }
}

/**
 * Test database connection with comprehensive checks
 * @returns {Promise<boolean>} True if connection is successful
 */
async function testConnection() {
  try {
    logger.info('Testing database connection...')

    // Test basic connectivity
    await prisma.$queryRaw`SELECT 1 as test`

    // Test if we can access the schema
    const tableCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `

    logger.info('Database connection successful', {
      tablesFound: Number(tableCount[0].count),
    })

    return true
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
      code: error.code,
    })
    return false
  }
}

/**
 * Gracefully disconnect from database
 */
async function disconnect() {
  try {
    logger.info('Disconnecting from database...')

    if (errorLog) {
      errorLog.end()
    }

    await prisma.$disconnect()
    logger.info('Database disconnection successful')
  } catch (error) {
    logger.error('Error during database disconnection', {
      error: error.message,
    })
  }
}

/**
 * Get Prisma client instance
 * @returns {PrismaClient} The Prisma client instance
 */
function getPrisma() {
  return prisma
}

/**
 * Execute a database transaction with proper error handling
 * @param {Function} transactionFn - Function to execute within transaction
 * @param {string} context - Context for logging
 * @returns {Promise<*>} Transaction result
 */
async function executeTransaction(transactionFn, context) {
  return await withRetry(
    () =>
      prisma.$transaction(transactionFn, {
        timeout: DB_CONFIG.TRANSACTION_TIMEOUT,
      }),
    `Transaction: ${context}`,
  )
}

/**
 * Health check for database connection
 * @returns {Promise<Object>} Health check results
 */
async function healthCheck() {
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const responseTime = Date.now() - start

    return {
      status: 'healthy',
      responseTime,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    }
  }
}

module.exports = {
  prisma,
  safeDbOperation,
  testConnection,
  disconnect,
  getPrisma,
  executeTransaction,
  healthCheck,
  withRetry,
}
