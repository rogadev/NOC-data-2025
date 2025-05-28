/**
 * NOC Unit Groups Seeder
 * ======================
 */

const fs = require('fs')
const { BATCH_SIZE } = require('../config')
const { safeDbOperation, prisma } = require('../utils/database')
const { processInParallelBatches } = require('../utils/batch-processor')
const { incrementSkipped } = require('../utils/progress')

/**
 * Seed NOC Unit Groups and their sections
 * @param {number} skipCount - Number of records to skip for resume functionality
 */
async function seedNocUnitGroups(skipCount = 0) {
  console.log('🏢 Seeding NOC Unit Groups...')

  const unitGroups = JSON.parse(
    fs.readFileSync('data/unit_groups.json', 'utf8'),
  )

  const processor = async unitGroup => {
    // Validate required fields
    if (!unitGroup.noc_number || !unitGroup.occupation) {
      console.warn('⚠️  Skipping invalid unit group:', unitGroup)
      incrementSkipped()
      return 'skipped'
    }

    // Use upsert to create or update the unit group
    const createdUnitGroup = await safeDbOperation(
      () =>
        prisma.nocUnitGroup.upsert({
          where: { nocCode: unitGroup.noc_number },
          update: { occupation: unitGroup.occupation },
          create: {
            nocCode: unitGroup.noc_number,
            occupation: unitGroup.occupation,
          },
        }),
      `NOC Unit Group: ${unitGroup.noc_number}`,
    )

    if (!createdUnitGroup) {
      return 'error'
    }

    // Create sections if they exist - use batch upserts for better performance
    if (unitGroup.sections && unitGroup.sections.length > 0) {
      // Show progress for unit groups with many sections
      if (unitGroup.sections.length > 20) {
        console.log(
          `\n  📋 Processing ${unitGroup.sections.length} sections for NOC ${unitGroup.noc_number}...`,
        )
      }

      // Process all sections in parallel with upserts
      const sectionPromises = unitGroup.sections.map(async section => {
        return await safeDbOperation(
          () =>
            prisma.nocSection.upsert({
              where: {
                nocCode_title: {
                  nocCode: unitGroup.noc_number,
                  title: section.title,
                },
              },
              update: { items: section.items || [] },
              create: {
                nocCode: unitGroup.noc_number,
                title: section.title,
                items: section.items || [],
              },
            }),
          `NOC Section: ${section.title}`,
        )
      })

      await Promise.all(sectionPromises)
    }

    return 'created'
  }

  return await processInParallelBatches(
    unitGroups,
    BATCH_SIZE,
    processor,
    'NOC Unit Groups',
    skipCount,
  )
}

module.exports = {
  seedNocUnitGroups,
}
