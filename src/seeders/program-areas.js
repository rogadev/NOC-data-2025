/**
 * Program Areas Seeder
 * ===================
 */

const fs = require('fs')
const { BATCH_SIZE } = require('../config')
const { safeDbOperation, prisma } = require('../utils/database')
const { processInParallelBatches } = require('../utils/batch-processor')

/**
 * Seed Program Areas
 * @param {number} skipCount - Number of records to skip for resume functionality
 */
async function seedProgramAreas(skipCount = 0) {
  console.log('🏫 Seeding Program Areas...')

  const viuPrograms = JSON.parse(
    fs.readFileSync('data/viu_programs.json', 'utf8'),
  )

  // Extract unique program areas
  const programAreasMap = new Map()
  viuPrograms.forEach(program => {
    if (program.program_area) {
      programAreasMap.set(program.program_area.nid, {
        nid: program.program_area.nid,
        title: program.program_area.title,
      })
    }
  })

  const programAreas = Array.from(programAreasMap.values())

  const processor = async area => {
    // Use upsert to create or update in one operation
    const result = await safeDbOperation(
      () =>
        prisma.programArea.upsert({
          where: { nid: area.nid },
          update: { title: area.title }, // Update if exists
          create: {
            nid: area.nid,
            title: area.title,
          },
        }),
      `Program Area: ${area.title}`,
    )

    return result ? 'created' : 'error'
  }

  return await processInParallelBatches(
    programAreas,
    BATCH_SIZE,
    processor,
    'Program Areas',
    skipCount,
  )
}

module.exports = {
  seedProgramAreas,
}
