/**
 * Programs Seeder
 * ==============
 */

const fs = require('fs')
const { BATCH_SIZE } = require('../config')
const { safeDbOperation, prisma } = require('../utils/database')
const { processInParallelBatches } = require('../utils/batch-processor')
const { incrementSkipped } = require('../utils/progress')

/**
 * Seed Programs
 * @param {number} skipCount - Number of records to skip for resume functionality
 */
async function seedPrograms(skipCount = 0) {
  console.log('📚 Seeding Programs...')

  const viuPrograms = JSON.parse(
    fs.readFileSync('data/viu_programs.json', 'utf8'),
  )

  const processor = async program => {
    // Find the program area ID first
    const programArea = await prisma.programArea.findUnique({
      where: { nid: program.program_area?.nid },
    })

    if (!programArea) {
      incrementSkipped()
      return 'skipped'
    }

    // Map credential type
    let credentialType
    switch (program.credential?.toLowerCase()) {
      case 'certificate':
        credentialType = 'Certificate'
        break
      case 'diploma':
        credentialType = 'Diploma'
        break
      case 'degree':
        credentialType = 'Degree'
        break
      default:
        credentialType = 'Certificate'
    }

    // Use upsert to create or update in one operation
    const result = await safeDbOperation(
      () =>
        prisma.program.upsert({
          where: { nid: program.nid },
          update: {
            title: program.title,
            duration: program.duration,
            credential: credentialType,
            viuSearchKeywords: program.viu_search_keywords,
            nocSearchKeywords: program.noc_search_keywords || [],
            knownNocGroups: program.known_noc_groups || [],
            programAreaId: programArea.id,
          },
          create: {
            nid: program.nid,
            title: program.title,
            duration: program.duration,
            credential: credentialType,
            viuSearchKeywords: program.viu_search_keywords,
            nocSearchKeywords: program.noc_search_keywords || [],
            knownNocGroups: program.known_noc_groups || [],
            programAreaId: programArea.id,
          },
        }),
      `Program: ${program.title}`,
    )

    return result ? 'created' : 'error'
  }

  return await processInParallelBatches(
    viuPrograms,
    BATCH_SIZE,
    processor,
    'Programs',
    skipCount,
  )
}

module.exports = {
  seedPrograms,
}
