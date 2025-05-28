/**
 * Environment Configuration
 * =========================
 *
 * Centralized environment variable management with validation and defaults
 */

require('dotenv').config()

/**
 * Validates that required environment variables are present
 * @param {string[]} requiredVars - Array of required environment variable names
 * @throws {Error} If any required variables are missing
 */
function validateRequiredEnvVars(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName])

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file or environment configuration.',
    )
  }
}

/**
 * Gets an environment variable with optional default and type conversion
 * @param {string} name - Environment variable name
 * @param {*} defaultValue - Default value if not set
 * @param {string} type - Type to convert to ('string', 'number', 'boolean')
 * @returns {*} The environment variable value
 */
function getEnvVar(name, defaultValue = undefined, type = 'string') {
  const value = process.env[name]

  if (value === undefined) {
    return defaultValue
  }

  switch (type) {
    case 'number': {
      const num = Number(value)
      if (isNaN(num)) {
        throw new Error(
          `Environment variable ${name} must be a valid number, got: ${value}`,
        )
      }
      return num
    }

    case 'boolean':
      return value.toLowerCase() === 'true'

    case 'string':
    default:
      return value
  }
}

// Validate required environment variables
const requiredVars = ['DATABASE_URL']
validateRequiredEnvVars(requiredVars)

// Export environment configuration
module.exports = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,

  // Application
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  LOG_LEVEL: getEnvVar('LOG_LEVEL', 'info'),

  // Supabase/Database configuration
  SUPABASE_PAID_TIER: getEnvVar('SUPABASE_PAID_TIER', false, 'boolean'),

  // Seeding configuration
  BATCH_SIZE: getEnvVar('BATCH_SIZE', 25, 'number'),
  PARALLEL_BATCHES: getEnvVar('PARALLEL_BATCHES', 2, 'number'),
  TRANSACTION_BATCH_SIZE: getEnvVar('TRANSACTION_BATCH_SIZE', 50, 'number'),
  BATCH_DELAY_MS: getEnvVar('BATCH_DELAY_MS', 100, 'number'),

  // Feature flags
  LOG_ERRORS: getEnvVar('LOG_ERRORS', true, 'boolean'),
  ENABLE_PROGRESS_TRACKING: getEnvVar(
    'ENABLE_PROGRESS_TRACKING',
    true,
    'boolean',
  ),

  // File paths
  PROGRESS_FILE: getEnvVar('PROGRESS_FILE', 'seeding-progress.json'),
  DATA_DIR: getEnvVar('DATA_DIR', 'data'),

  // Utility functions
  validateRequiredEnvVars,
  getEnvVar,

  // Environment checks
  isDevelopment: () => module.exports.NODE_ENV === 'development',
  isProduction: () => module.exports.NODE_ENV === 'production',
  isTest: () => module.exports.NODE_ENV === 'test',
}
