/**
 * Program-NOC Links Seeder
 * ========================
 */

const { safeDbOperation, prisma } = require('../utils/database')
const { processInParallelBatches } = require('../utils/batch-processor')
const { incrementSkipped } = require('../utils/progress')

/**
 * Create Program-NOC Links
 * @param {number} skipCount - Number of records to skip for resume functionality
 */
async function createProgramNocLinks(skipCount = 0) {
  console.log('🔗 Creating Program-NOC Links...')

  const programs = await prisma.program.findMany({
    where: {
      knownNocGroups: {
        hasSome: [],
      },
    },
  })

  // Flatten all links into a single array for optimal batch processing
  const allLinks = []
  programs.forEach((program) => {
    program.knownNocGroups.forEach((nocCode) => {
      allLinks.push({
        programId: program.id,
        nocCode,
        programTitle: program.title,
      })
    })
  })

  const processor = async (link) => {
    // Check if NOC code exists first (this is still needed for foreign key validation)
    const nocExists = await prisma.nocUnitGroup.findUnique({
      where: { nocCode: link.nocCode },
    })

    if (!nocExists) {
      incrementSkipped()
      return 'skipped'
    }

    // Use upsert to create or update the link
    const result = await safeDbOperation(
      () =>
        prisma.programNocLink.upsert({
          where: {
            programId_nocCode: {
              programId: link.programId,
              nocCode: link.nocCode,
            },
          },
          update: {
            isKnown: true,
            confidence: 1.0,
          },
          create: {
            programId: link.programId,
            nocCode: link.nocCode,
            isKnown: true,
            confidence: 1.0,
          },
        }),
      `Program-NOC Link: ${link.programTitle} - ${link.nocCode}`
    )

    return result ? 'created' : 'error'
  }

  return await processInParallelBatches(
    allLinks,
    50, // Smaller batch size for links due to foreign key lookups
    processor,
    'Program-NOC Links',
    skipCount
  )
}

module.exports = {
  createProgramNocLinks,
}
