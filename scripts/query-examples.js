/**
 * Database Query Examples
 * ======================
 *
 * Example queries to demonstrate database functionality.
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function runExampleQueries() {
  console.log('🔍 Running example database queries...\n')

  try {
    // Example 1: Get programs with their areas
    console.log('📚 Programs with their areas:')
    const programsWithAreas = await prisma.program.findMany({
      take: 5,
      include: {
        programArea: true,
      },
    })

    programsWithAreas.forEach(program => {
      console.log(
        `   ${program.title} (${program.programArea?.title || 'No area'})`,
      )
    })

    // Example 2: Get NOC unit groups with sections
    console.log('\n🏢 NOC Unit Groups with sections:')
    const nocWithSections = await prisma.nocUnitGroup.findMany({
      take: 3,
      include: {
        sections: true,
      },
    })

    nocWithSections.forEach(noc => {
      console.log(
        `   ${noc.nocCode}: ${noc.occupation} (${noc.sections.length} sections)`,
      )
    })

    // Example 3: Get outlooks for a specific region
    console.log('\n📈 Outlooks for British Columbia:')
    const bcOutlooks = await prisma.outlook.findMany({
      where: {
        province: 'British Columbia',
      },
      take: 5,
    })

    bcOutlooks.forEach(outlook => {
      console.log(`   NOC ${outlook.nocCode}: ${outlook.outlook}`)
    })

    // Example 4: Get program-NOC links
    console.log('\n🔗 Program-NOC Links:')
    const links = await prisma.programNocLink.findMany({
      take: 5,
      include: {
        program: true,
      },
    })

    links.forEach(link => {
      console.log(`   ${link.program.title} → NOC ${link.nocCode}`)
    })

    console.log('\n✅ Example queries completed!')
  } catch (error) {
    console.error('❌ Error running queries:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (require.main === module) {
  runExampleQueries()
}

module.exports = { runExampleQueries }
