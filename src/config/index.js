/**
 * Configuration for NOC Data Seeding Application
 * ==============================================
 *
 * Main configuration module that combines environment variables
 * with application-specific settings and defaults.
 */

const env = require('./environment')

// Supabase-optimized configuration - Free Tier
const BATCH_SIZE = env.BATCH_SIZE
const TRANSACTION_BATCH_SIZE = env.TRANSACTION_BATCH_SIZE
const PARALLEL_BATCHES = env.PARALLEL_BATCHES
const BATCH_DELAY_MS = env.BATCH_DELAY_MS
const LOG_ERRORS = env.LOG_ERRORS

/**
 * Seeding control flags
 * Set to false to skip sections that have already been seeded
 */
const SEED_CONFIG = {
  PROGRAM_AREAS: env.getEnvVar('SEED_PROGRAM_AREAS', true, 'boolean'),
  PROGRAMS: env.getEnvVar('SEED_PROGRAMS', true, 'boolean'),
  NOC_UNIT_GROUPS: env.getEnvVar('SEED_NOC_UNIT_GROUPS', true, 'boolean'),
  OUTLOOKS: env.getEnvVar('SEED_OUTLOOKS', true, 'boolean'),
  PROGRAM_NOC_LINKS: env.getEnvVar('SEED_PROGRAM_NOC_LINKS', true, 'boolean'),
}

// Check if we're on a paid tier
const IS_PAID_TIER = env.SUPABASE_PAID_TIER

// Progress saving for resume capability
const PROGRESS_FILE = env.PROGRESS_FILE

/**
 * Data file paths configuration
 */
const DATA_PATHS = {
  VIU_PROGRAMS: `${env.DATA_DIR}/viu_programs.json`,
  PROGRAM_AREAS: `${env.DATA_DIR}/program_areas.json`,
  NOC_UNIT_GROUPS: `${env.DATA_DIR}/noc_unit_groups.json`,
  OUTLOOKS: `${env.DATA_DIR}/outlooks.json`,
}

/**
 * Database configuration optimized for Supabase
 */
const DB_CONFIG = {
  // Connection pool settings
  CONNECTION_LIMIT: IS_PAID_TIER ? 10 : 3,
  QUERY_TIMEOUT: 30000, // 30 seconds

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,

  // Transaction settings
  TRANSACTION_TIMEOUT: 60000, // 1 minute
}

/**
 * Validation function to ensure configuration is valid
 */
function validateConfig() {
  const errors = []

  if (BATCH_SIZE <= 0) {
    errors.push('BATCH_SIZE must be greater than 0')
  }

  if (PARALLEL_BATCHES <= 0) {
    errors.push('PARALLEL_BATCHES must be greater than 0')
  }

  if (TRANSACTION_BATCH_SIZE <= 0) {
    errors.push('TRANSACTION_BATCH_SIZE must be greater than 0')
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }
}

// Validate configuration on module load
validateConfig()

module.exports = {
  // Core configuration
  BATCH_SIZE,
  TRANSACTION_BATCH_SIZE,
  PARALLEL_BATCHES,
  BATCH_DELAY_MS,
  LOG_ERRORS,

  // Feature configurations
  SEED_CONFIG,
  IS_PAID_TIER,

  // File paths
  PROGRESS_FILE,
  DATA_PATHS,

  // Database configuration
  DB_CONFIG,

  // Environment access
  env,

  // Utility functions
  validateConfig,
}
