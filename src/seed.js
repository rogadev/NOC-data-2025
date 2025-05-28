/**
 * NOC Data Seeding Application - Main Orchestrator
 * ================================================
 *
 * Modular seeding application with:
 * - Check-then-create approach to skip existing records
 * - Conservative parallel batch processing to respect rate limits
 * - Transaction-based batching for atomic operations
 * - Connection management and rate limiting
 * - Percentage-based progress tracking
 * - Performance metrics and timing
 * - No data deletion - preserves existing database content
 */

const {
  BATCH_SIZE,
  PARALLEL_BATCHES,
  TRANSACTION_BATCH_SIZE,
  IS_PAID_TIER,
  SEED_CONFIG,
} = require('./config')
const { testConnection, disconnect, healthCheck } = require('./utils/database')
const logger = require('./utils/logger')
const {
  initializeProgress,
  setTotalRecords,
  getProgressStats,
  saveProgress,
} = require('./utils/progress')
const { calculateTotalRecords } = require('./utils/calculate-total')
const {
  calculateResumePositions,
  displayResumeSummary,
} = require('./utils/resume-calculator')

// Import seeders
const { seedProgramAreas } = require('./seeders/program-areas')
const { seedPrograms } = require('./seeders/programs')
const { seedNocUnitGroups } = require('./seeders/noc-unit-groups')
const { seedOutlooks } = require('./seeders/outlooks')
const { createProgramNocLinks } = require('./seeders/program-noc-links')

/**
 * Display application configuration
 */
function displayConfiguration() {
  logger.info('⚙️  Application Configuration:', {
    batchSize: BATCH_SIZE,
    parallelBatches: PARALLEL_BATCHES,
    transactionBatchSize: TRANSACTION_BATCH_SIZE,
    paidTier: IS_PAID_TIER,
    nodeEnv: process.env.NODE_ENV,
  })
}

/**
 * Display seeding plan
 */
function displaySeedingPlan() {
  logger.info('📋 Seeding Plan:')
  Object.entries(SEED_CONFIG).forEach(([section, enabled]) => {
    const status = enabled ? '✅ ENABLED' : '⏭️  SKIPPED'
    logger.info(`   ${section.replace(/_/g, ' ')}: ${status}`)
  })
}

/**
 * Execute seeding operations in dependency order
 * @param {Object} resumeConfig - Resume configuration with skip counts
 * @returns {Promise<Object>} Seeding results
 */
async function executeSeedingOperations(resumeConfig) {
  const results = {}

  // Seed data in dependency order
  if (SEED_CONFIG.PROGRAM_AREAS) {
    logger.seedStart('Program Areas')
    results.programAreas = await seedProgramAreas(
      resumeConfig.SKIP_PROGRAM_AREAS
    )
    logger.seedComplete('Program Areas', results.programAreas)
  } else {
    logger.info('⏭️  Skipping Program Areas (disabled in config)')
    results.programAreas = { created: 0, skipped: 0 }
  }

  if (SEED_CONFIG.PROGRAMS) {
    logger.seedStart('Programs')
    results.programs = await seedPrograms(resumeConfig.SKIP_PROGRAMS)
    logger.seedComplete('Programs', results.programs)
  } else {
    logger.info('⏭️  Skipping Programs (disabled in config)')
    results.programs = { created: 0, skipped: 0 }
  }

  if (SEED_CONFIG.NOC_UNIT_GROUPS) {
    logger.seedStart('NOC Unit Groups')
    results.nocUnitGroups = await seedNocUnitGroups(
      resumeConfig.SKIP_NOC_UNIT_GROUPS
    )
    logger.seedComplete('NOC Unit Groups', results.nocUnitGroups)
  } else {
    logger.info('⏭️  Skipping NOC Unit Groups (disabled in config)\n')
    results.nocUnitGroups = { created: 0, skipped: 0 }
  }

  if (SEED_CONFIG.OUTLOOKS) {
    logger.seedStart('Outlooks')
    results.outlooks = await seedOutlooks(resumeConfig.SKIP_OUTLOOKS)
    logger.seedComplete('Outlooks', results.outlooks)
  } else {
    logger.info('⏭️  Skipping Outlooks (disabled in config)')
    results.outlooks = { created: 0, skipped: 0 }
  }

  if (SEED_CONFIG.PROGRAM_NOC_LINKS) {
    logger.seedStart('Program-NOC Links')
    results.programNocLinks = await createProgramNocLinks(
      resumeConfig.SKIP_PROGRAM_NOC_LINKS
    )
    logger.seedComplete('Program-NOC Links', results.programNocLinks)
  } else {
    logger.info('⏭️  Skipping Program-NOC Links (disabled in config)')
    results.programNocLinks = { created: 0, skipped: 0 }
  }

  return results
}

/**
 * Display final seeding summary
 * @param {Object} results - Seeding results
 * @param {Object} finalStats - Final performance statistics
 */
function displaySummary(results, finalStats) {
  logger.info('📊 Seeding Summary:')
  logger.info('='.repeat(50))

  Object.entries(results).forEach(([key, result]) => {
    logger.info(
      `${key}: ${result.created.toLocaleString()} created, ${result.skipped.toLocaleString()} skipped`
    )
  })

  const totalCreated = Object.values(results).reduce(
    (sum, result) => sum + result.created,
    0
  )
  const totalSkipped = Object.values(results).reduce(
    (sum, result) => sum + result.skipped,
    0
  )

  // Performance metrics
  const avgBatchTime = (
    parseFloat(finalStats.elapsedSeconds) / Math.ceil(totalCreated / BATCH_SIZE)
  ).toFixed(2)

  logger.info('Final Statistics:', {
    totalCreated: totalCreated.toLocaleString(),
    totalSkipped: totalSkipped.toLocaleString(),
    duration: `${finalStats.elapsedSeconds} seconds`,
    rate: `${finalStats.rate} records/second`,
    avgBatchTime: `${avgBatchTime} seconds`,
  })
}

/**
 * Main seeding function
 */
async function main() {
  const startTime = Date.now()

  try {
    logger.info(
      '🚀 Starting optimized database seeding with check-then-create...'
    )

    // Display configuration
    displayConfiguration()

    // Test database connection and health
    logger.info('🔌 Testing database connection...')
    const connected = await testConnection()
    if (!connected) {
      throw new Error('Database connection failed')
    }

    // Perform health check
    const health = await healthCheck()
    logger.info('Database health check:', health)

    // Initialize progress tracking
    initializeProgress()

    // Calculate total records for progress tracking
    logger.info('📊 Calculating total records for progress tracking...')
    const totalRecords = await calculateTotalRecords()
    setTotalRecords(totalRecords)
    logger.info(`Total records to process: ${totalRecords.toLocaleString()}`)

    // Calculate resume positions based on existing database records
    logger.info('🔍 Checking existing database records for smart resume...')
    const resumeConfig = await calculateResumePositions()
    displayResumeSummary(resumeConfig)

    logger.info(
      '📝 Using database record counts as skip values to avoid duplicating data...'
    )

    // Display seeding plan
    displaySeedingPlan()

    // Execute seeding operations
    const results = await executeSeedingOperations(resumeConfig)

    // Calculate final performance metrics
    const finalStats = getProgressStats()

    // Display summary
    displaySummary(results, finalStats)

    // Save final progress
    const totalProcessed = Object.values(results).reduce(
      (sum, result) => sum + result.created + result.skipped,
      0
    )
    saveProgress('COMPLETED', totalProcessed, totalRecords)

    logger.info('✅ Optimized seeding completed successfully!')

    return {
      success: true,
      results,
      stats: finalStats,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    logger.seedError('Main seeding process', error)

    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    }
  } finally {
    await disconnect()
  }
}

// Run the seeding if called directly
if (require.main === module) {
  main()
    .then((result) => {
      if (result.success) {
        // Exit successfully
        return
      } else {
        logger.error('Seeding failed', { error: result.error })
        throw new Error(`Seeding failed: ${result.error}`)
      }
    })
    .catch((error) => {
      logger.error('Unhandled error in main process', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    })
}

module.exports = { main }
