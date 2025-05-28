/**
 * Resume Calculator Utility
 * ========================
 *
 * Automatically calculates where to resume seeding operations
 * by checking existing database records and using those counts as skip values
 * to avoid duplicating data.
 */

const fs = require('fs')
const xlsx = require('node-xlsx')
const { prisma } = require('./database')
const logger = require('./logger')

/**
 * Calculate resume positions for all seeders based on existing database records
 * Uses database record counts directly as skip values to avoid duplicating data
 * @returns {Promise<Object>} Resume configuration with skip counts
 */
async function calculateResumePositions() {
  logger.info(
    '🔍 Checking database for existing records to calculate skip values...',
  )

  try {
    // Get existing record counts from database
    const existingCounts = await getExistingRecordCounts()
    logger.info('📊 Current database record counts:', existingCounts)

    // Use database counts directly as skip values
    const resumeConfig = {
      SKIP_PROGRAM_AREAS: existingCounts.programAreas,
      SKIP_PROGRAMS: existingCounts.programs,
      SKIP_NOC_UNIT_GROUPS: existingCounts.nocUnitGroups,
      SKIP_OUTLOOKS: existingCounts.outlooks,
      SKIP_PROGRAM_NOC_LINKS: existingCounts.programNocLinks,
    }

    // Validate skip values against source data to ensure they make sense
    const validatedConfig = await validateSkipValues(resumeConfig)

    // Log the calculated resume positions
    logger.info('📍 Calculated skip values based on existing database records:')
    Object.entries(validatedConfig).forEach(([key, value]) => {
      const sectionName = key.replace('SKIP_', '').replace(/_/g, ' ')
      if (value > 0) {
        logger.info(
          `   ${sectionName}: Skip first ${value.toLocaleString()} records (${value} exist in DB)`,
        )
      } else {
        logger.info(`   ${sectionName}: Start from beginning (0 exist in DB)`)
      }
    })

    return validatedConfig
  } catch (error) {
    logger.error('❌ Error calculating resume positions:', error)
    // Return safe defaults if calculation fails
    logger.warn('🔄 Falling back to safe defaults (start from beginning)')
    return {
      SKIP_PROGRAM_AREAS: 0,
      SKIP_PROGRAMS: 0,
      SKIP_NOC_UNIT_GROUPS: 0,
      SKIP_OUTLOOKS: 0,
      SKIP_PROGRAM_NOC_LINKS: 0,
    }
  }
}

/**
 * Get current record counts from database
 * @returns {Promise<Object>} Record counts for each table
 */
async function getExistingRecordCounts() {
  logger.info('🔢 Counting existing records in database...')

  const counts = {}

  try {
    counts.programAreas = await prisma.programArea.count()
    logger.info(`   Program Areas: ${counts.programAreas.toLocaleString()}`)
  } catch (error) {
    logger.warn('⚠️  Could not count program areas:', error.message)
    counts.programAreas = 0
  }

  try {
    counts.programs = await prisma.program.count()
    logger.info(`   Programs: ${counts.programs.toLocaleString()}`)
  } catch (error) {
    logger.warn('⚠️  Could not count programs:', error.message)
    counts.programs = 0
  }

  try {
    counts.nocUnitGroups = await prisma.nocUnitGroup.count()
    logger.info(`   NOC Unit Groups: ${counts.nocUnitGroups.toLocaleString()}`)
  } catch (error) {
    logger.warn('⚠️  Could not count NOC unit groups:', error.message)
    counts.nocUnitGroups = 0
  }

  try {
    counts.nocSections = await prisma.nocSection.count()
    logger.info(`   NOC Sections: ${counts.nocSections.toLocaleString()}`)
  } catch (error) {
    logger.warn('⚠️  Could not count NOC sections:', error.message)
    counts.nocSections = 0
  }

  try {
    counts.economicRegions = await prisma.economicRegion.count()
    logger.info(
      `   Economic Regions: ${counts.economicRegions.toLocaleString()}`,
    )
  } catch (error) {
    logger.warn('⚠️  Could not count economic regions:', error.message)
    counts.economicRegions = 0
  }

  try {
    counts.outlooks = await prisma.outlook.count()
    logger.info(`   Outlooks: ${counts.outlooks.toLocaleString()}`)
  } catch (error) {
    logger.warn('⚠️  Could not count outlooks:', error.message)
    counts.outlooks = 0
  }

  try {
    counts.programNocLinks = await prisma.programNocLink.count()
    logger.info(
      `   Program-NOC Links: ${counts.programNocLinks.toLocaleString()}`,
    )
  } catch (error) {
    logger.warn('⚠️  Could not count program-NOC links:', error.message)
    counts.programNocLinks = 0
  }

  return counts
}

/**
 * Validate skip values against source data to ensure they don't exceed available data
 * @param {Object} resumeConfig - Resume configuration with skip counts
 * @returns {Promise<Object>} Validated resume configuration
 */
async function validateSkipValues(resumeConfig) {
  logger.info('✅ Validating skip values against source data...')

  const validatedConfig = { ...resumeConfig }

  // Validate Program Areas
  try {
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8'),
    )
    const programAreasMap = new Map()
    viuPrograms.forEach((program) => {
      if (program.program_area) {
        programAreasMap.set(program.program_area.nid, program.program_area)
      }
    })
    const totalProgramAreas = programAreasMap.size

    if (validatedConfig.SKIP_PROGRAM_AREAS > totalProgramAreas) {
      logger.warn(
        `⚠️  Program Areas: Skip value (${validatedConfig.SKIP_PROGRAM_AREAS}) exceeds source data (${totalProgramAreas}), capping at source data size`,
      )
      validatedConfig.SKIP_PROGRAM_AREAS = totalProgramAreas
    }
    logger.info(
      `   Program Areas: ${validatedConfig.SKIP_PROGRAM_AREAS}/${totalProgramAreas} to skip`,
    )
  } catch (error) {
    logger.warn(
      '⚠️  Could not validate program areas skip value:',
      error.message,
    )
  }

  // Validate Programs
  try {
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8'),
    )
    const totalPrograms = viuPrograms.length

    if (validatedConfig.SKIP_PROGRAMS > totalPrograms) {
      logger.warn(
        `⚠️  Programs: Skip value (${validatedConfig.SKIP_PROGRAMS}) exceeds source data (${totalPrograms}), capping at source data size`,
      )
      validatedConfig.SKIP_PROGRAMS = totalPrograms
    }
    logger.info(
      `   Programs: ${validatedConfig.SKIP_PROGRAMS}/${totalPrograms} to skip`,
    )
  } catch (error) {
    logger.warn('⚠️  Could not validate programs skip value:', error.message)
  }

  // Validate NOC Unit Groups
  try {
    const unitGroups = JSON.parse(
      fs.readFileSync('data/unit_groups.json', 'utf8'),
    )
    const totalUnitGroups = unitGroups.length

    if (validatedConfig.SKIP_NOC_UNIT_GROUPS > totalUnitGroups) {
      logger.warn(
        `⚠️  NOC Unit Groups: Skip value (${validatedConfig.SKIP_NOC_UNIT_GROUPS}) exceeds source data (${totalUnitGroups}), capping at source data size`,
      )
      validatedConfig.SKIP_NOC_UNIT_GROUPS = totalUnitGroups
    }
    logger.info(
      `   NOC Unit Groups: ${validatedConfig.SKIP_NOC_UNIT_GROUPS}/${totalUnitGroups} to skip`,
    )
  } catch (error) {
    logger.warn(
      '⚠️  Could not validate NOC unit groups skip value:',
      error.message,
    )
  }

  // Validate Outlooks
  try {
    const workbook = xlsx.parse('data/2024-2026-3-year-outlooks.xlsx')
    const outlookData = workbook[0].data.slice(1) // Remove header row
    const totalOutlooks = outlookData.length

    if (validatedConfig.SKIP_OUTLOOKS > totalOutlooks) {
      logger.warn(
        `⚠️  Outlooks: Skip value (${validatedConfig.SKIP_OUTLOOKS}) exceeds source data (${totalOutlooks}), capping at source data size`,
      )
      validatedConfig.SKIP_OUTLOOKS = totalOutlooks
    }
    logger.info(
      `   Outlooks: ${validatedConfig.SKIP_OUTLOOKS}/${totalOutlooks} to skip`,
    )
  } catch (error) {
    logger.warn('⚠️  Could not validate outlooks skip value:', error.message)
  }

  // Validate Program-NOC Links
  try {
    const viuPrograms = JSON.parse(
      fs.readFileSync('data/viu_programs.json', 'utf8'),
    )
    let totalLinks = 0
    viuPrograms.forEach((program) => {
      if (program.known_noc_groups) {
        totalLinks += program.known_noc_groups.length
      }
    })

    if (validatedConfig.SKIP_PROGRAM_NOC_LINKS > totalLinks) {
      logger.warn(
        `⚠️  Program-NOC Links: Skip value (${validatedConfig.SKIP_PROGRAM_NOC_LINKS}) exceeds source data (${totalLinks}), capping at source data size`,
      )
      validatedConfig.SKIP_PROGRAM_NOC_LINKS = totalLinks
    }
    logger.info(
      `   Program-NOC Links: ${validatedConfig.SKIP_PROGRAM_NOC_LINKS}/${totalLinks} to skip`,
    )
  } catch (error) {
    logger.warn(
      '⚠️  Could not validate program-NOC links skip value:',
      error.message,
    )
  }

  return validatedConfig
}

/**
 * Display resume summary
 * @param {Object} resumeConfig - Resume configuration
 */
function displayResumeSummary(resumeConfig) {
  const hasResume = Object.values(resumeConfig).some((skip) => skip > 0)

  if (hasResume) {
    logger.info('🔄 Resume mode activated - skipping existing records:')
    Object.entries(resumeConfig).forEach(([key, value]) => {
      if (value > 0) {
        const sectionName = key.replace('SKIP_', '').replace(/_/g, ' ')
        logger.info(
          `   ${sectionName}: Skipping ${value.toLocaleString()} records`,
        )
      }
    })
  } else {
    logger.info('🆕 Starting fresh - no existing records to skip')
  }
}

module.exports = {
  calculateResumePositions,
  getExistingRecordCounts,
  displayResumeSummary,
}
