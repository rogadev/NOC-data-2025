/**
 * Database Record Counter
 * ======================
 *
 * Utility script to count records in all database tables.
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function countRecords() {
  console.log('📊 Counting records in all tables...\n')

  try {
    const counts = {}

    // Count all tables
    counts.programAreas = await prisma.programArea.count()
    counts.programs = await prisma.program.count()
    counts.nocUnitGroups = await prisma.nocUnitGroup.count()
    counts.nocSections = await prisma.nocSection.count()
    counts.economicRegions = await prisma.economicRegion.count()
    counts.outlooks = await prisma.outlook.count()
    counts.programNocLinks = await prisma.programNocLink.count()

    // Display results
    console.log('📈 Record Counts:')
    console.log('='.repeat(30))
    Object.entries(counts).forEach(([table, count]) => {
      console.log(`${table.padEnd(20)}: ${count.toLocaleString()}`)
    })

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    console.log('='.repeat(30))
    console.log(`${'Total'.padEnd(20)}: ${total.toLocaleString()}`)
  } catch (error) {
    console.error('❌ Error counting records:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  countRecords()
}

module.exports = { countRecords }
